# Zoom L6 / L6max Editor Protocol Reference

This document is a reference for anyone reverse-engineering or contributing to the SysEx implementation. The protocol is undocumented and reconstructed from captures and the official ZOOM L6 Editor. See [Magicking/L6-MassStorage](https://github.com/Magicking/L6-MassStorage) (README and `zooml6_info.py`) for the source of these facts.

## USB MIDI Ports

The L6 and L6max present three USB MIDI ports, each with independent I/O:

| Port Name (macOS / Windows) | Role | CC/Note Dest. |
|---|---|---|
| **L6 MIDI I/O Port** / **MIDIIN1/MIDIOUT1** | Device audio engine I/O and effect sends | Mixer Control (SysEx) |
| **L6 Mixer Control Port** / **MIDIIN2/MIDIOUT2** | CC and program change for mixer control | Mixer Control (SysEx) |
| **for L6 Editor Port** / **MIDIIN3/MIDIOUT3** | Dedicated editor protocol (SysEx only) | Editor (SysEx) |

The **Editor port** (port 3) is where all SysEx protocol messages go. Do not attempt to send editor SysEx to the Mixer Control or MIDI I/O ports. The **Mixer Control port** (port 2) receives MIDI CC and note events, not SysEx; the Editor port receives SysEx only.

## Message Envelope

All Zoom L6 SysEx messages have the structure:

```
F0 52 00 00 <command> <body…> F7
│  │  │  │  │
│  │  │  │  └─ Command byte (0x00–0x7F)
│  │  │  └───── Model (0x00 = L6 / L6max)
│  │  └──────── Device ID (0x00 = broadcast)
│  └─────────── Manufacturer ID (0x52 = Zoom Corporation)
└─────────────── SysEx start marker
```

The end marker `F7` closes every message. Every byte in `<body…>` and the command must be in the range 0x00–0x7F (seven-bit clean); values ≥ 0x80 are never sent on the wire.

## Known Message Types

The following table lists every message type observed or inferred from the protocol. Status indicates **verified on hardware** (tested with an L6 or L6max in the companion app or official editor) or **observed in captures** (from Magicking's `zooml6_info.py` and reverse-engineering captures):

### Universal Identity (SysEx-ID)

| Direction | Bytes | Status | Notes |
|---|---|---|---|
| **Request** | `F0 7E 00 06 01 F7` | **Verified on hardware** | Device ID `00` (broadcast); see MIDI spec (Recommended Practice 2) |
| **Reply** | `F0 7E 00 06 02 52 72 00 0B 00 <fw ascii> F7` | **Verified on hardware** | Manufacturer `52` (Zoom); family `72 00`; member `0B 00`; firmware e.g. `31 2E 31 30` = "1.10" |

### Editor Session

| Direction | Command | Bytes | Status | Notes |
|---|---|---|---|---|
| **Host → Device** | EditorOpen | `F0 52 00 00 2B F7` | **Verified on hardware** | Start the editor session. The device replies with `2A …` (see below). |
| **Device → Host** | EditorOpenReply | `F0 52 00 00 2A 03 <state blob> F7` | **Verified on hardware** | ~120-byte state and capability dump; see `editorOpenState` parser in `src/midi/sysex/zoomL6/parse.ts`. |

### Session Keep-Alive

| Direction | Command | Bytes | Status | Notes |
|---|---|---|---|---|
| **Host → Device** | Heartbeat | `F0 52 00 00 31 0B F7` | **Verified on hardware** | Sent ~every 100 ms while the session is open. Required to keep the device responding to editor commands. |
| **Device → Host** | Heartbeat Ack | `F0 52 00 00 00 0B F7` | **Verified on hardware** | Echoed in reply to the heartbeat (ack code `0B` echoes the heartbeat session ID). If these stop, the session is considered stale and should be reopened. |

### File Transfer (USB Mass Storage)

| Direction | Command | Bytes | Status | Notes |
|---|---|---|---|---|
| **Host → Device** | Activate | `F0 52 00 00 31 09 01 F7` | **Verified on hardware** | Enable USB mass storage mode. The device then exposes the SD card as a USB drive and stops responding to audio/MIDI until deactivated. |
| **Host → Device** | Deactivate | `F0 52 00 00 31 09 00 F7` | **Verified on hardware** | Exit mass storage mode. The device re-enumerates and resumes normal MIDI/audio. |
| **Device → Host** | Ack | `F0 52 00 00 00 09 F7` | **Verified on hardware** | Reply to either file transfer command (ack code `09` echoes the file-transfer session ID). |

### Parameter Access

| Direction | Command | Bytes | Status | Notes |
|---|---|---|---|---|
| **Host → Device** | GetParam | `F0 52 00 00 46 <group> <index> F7` | **Observed in captures** | Request the value of a parameter. Group and index are both 0x00–0x7F. Reply is `45 <group> <index> <values…>`. |
| **Device → Host** | ParamValue | `F0 52 00 00 45 <group> <index> <values…> F7` | **Observed in captures** | Reply to `46`, or sent by host to write (device acks with `00 <code>`). Multi-byte values are 7-bit little-endian. |
| **Host → Device** | SetParam | `F0 52 00 00 45 <group> <index> <values…> F7` | **Observed in captures** | Write a parameter. Device replies with generic ack `00 <code>`. |
| **Device → Host** | Generic Ack | `F0 52 00 00 00 <code> F7` | **Observed in captures** | Reply to a SetParam. The code echoes the command that triggered it (e.g., `45` for SetParam). |

### Capabilities and Scene Info

| Direction | Command | Bytes | Status | Notes |
|---|---|---|---|---|
| **Host → Device** | CapabilitiesSet | `F0 52 00 00 45 05 02 00 00 00 00 00 27 00 F7` | **Observed in captures** | Sent by the official editor after EditorOpen. Purpose unknown; included here for protocol completeness. |
| **Host → Device** | SceneInfoRequest | `F0 52 00 00 67 01 F7` | **Observed in captures** | Request scene / track information (subtype `01`). |
| **Device → Host** | SceneInfo | `F0 52 00 00 67 <subtype> <data…> F7` | **Observed in captures** | Reply with scene or track metadata (format unknown). |

## Session Model

An editor session begins when the host sends the **Identity Request**, followed by **EditorOpen**:

```
Host: Identity Request (F0 7E 00 06 01 F7)
Device: Identity Reply (F0 7E 00 06 02 52 …)
  ↓
Host: EditorOpen (F0 52 00 00 2B F7)
Device: EditorOpenReply (F0 52 00 00 2A 03 …state blob…)
  ↓
Host: Heartbeat (F0 52 00 00 31 0B F7) — sent ~every 100 ms
Device: Heartbeat Ack (F0 52 00 00 00 0B F7)
  ↓
(repeat heartbeat/ack loop; meanwhile, host can issue GetParam / SetParam)
```

**Session closure:** There is no known close or disconnect message. The device times out an idle session on its own (after roughly 10–30 heartbeat misses, depending on firmware). To close gracefully, stop sending heartbeats and release the session; the device will eventually drop it.

**Stale detection:** If the device stops acking heartbeats (e.g., the connection is broken or the app is backgrounded), the session is marked **stale**. The next time the host needs to read or write a parameter, it will automatically reopen the session (issue a new EditorOpen if still connected).

**Concurrent sessions:** The official ZOOM L6 Editor and this app must not both hold an open session. If they overlap, SysEx messages collide and both may malfunction. Always close one before opening the other: quit the editor before turning on this app's editor link.

## State Snapshot (GlobalSettingDump)

When an editor session opens, the device immediately replies to the **EditorOpen** command with a **GlobalSettingDump** — a complete snapshot of the mixer's settings, laid out in write-command-id order (`31 <id>` command bytes).

```
Host: EditorOpen (F0 52 00 00 2B F7)
Device: EditorOpenReply (F0 52 00 00 2A <layoutByte> <payload> F7)
```

The first byte of the payload (`<layoutByte>`) identifies the device type:
- `0x03`: L6 (133-byte payload)
- `0x2E`: L6max (176-byte payload)

### State Layout (L6)

| Offset | Width | Setting | Notes |
|--------|-------|---------|-------|
| 0 | 1 | layout byte | `0x03` |
| 2 | 1 | battery type | `00` Alkaline / `01` Ni-MH / `02` Lithium |
| 3 | 1 | auto power off | `00` 10 Hours / `01` Never |
| 4 | 1 | mixer control via MIDI | `00` off / `01` on |
| 5 | 1 | recorder mode | `00` Multi Track / `01` Master Only |
| 6–9 | 1 each | pad 1–4 play mode | `00` One-shot / `01` Loop / `02` Hold |
| 10–13 | 1 each | pad 1–4 level | `00`–`3B` (`00` = −∞, otherwise raw − 49 dB; `31` = 0 dB) |
| 19 | 1 | MIDI out mode | `00` Out / `01` Thru |
| 20 | 1 | MIDI channel | channel − 1 (`00` = ch 1 … `0F` = ch 16) |
| 21–86 | 1 each | CC mapping table | 66 bytes: the CC# for each control, in write-order |
| 87–90 | 1 each | pad 1–4 MIDI note | `00`–`7F` (C−2 … G8, with C3 = 60); reads `00` when the pad is Not Mapped |
| 91–94 | 1 each | pad 1–4 Not Mapped flag | `01` = Not Mapped (overrides the note byte) / `00` = mapped |
| 95–114 | 2 each (LE) | effect parameters | 10 slots: Hall Decay/Tone, Room Decay/Tone, Spring Dwell/Tone, Delay Time/Feedback, Echo Time/Repeat (14-bit LE) |
| 115–120 | 1 each | AUX1 send point, ch 1–6 | `00` Pre / `01` Post |
| 121–126 | 1 each | AUX2 send point, ch 1–6 | `00` Pre / `01` Post (AUX-major: all AUX1 channels, then all AUX2) |

Bytes 1, 14–18 and 127–132 are still unidentified. Offsets 3, 5, 19, 20, 91–94 and 115–126 were
located by a live probe on an L6 (fw 1.00): each setting was written with its verified `31 <id>`
command, the snapshot was re-read (Identity Request + EditorOpen) and diffed, then the mixer was
restored (`scripts/l6probe.swift`). The snapshots are in
`src/midi/sysex/zoomL6/__tests__/fixtures/probe-l6-snapshot-diff.jsonl`, which the unit tests use.

### State Layout (L6max)

| Offset | Width | Setting | Notes |
|--------|-------|---------|-------|
| 0 | 1 | layout byte | `0x2E` |
| 6 | 1 | USB audio mode | `00` Stereo mix / `01` Multi Track |
| 13–16 | 1 each | pad 1–4 play mode | `00` One-shot / `01` Loop / `02` Hold; unverified (same structure as the L6) |
| 17–20 | 1 each | pad 1–4 level | `00`–`3B` (−∞ … +10 dB); unverified (same structure as the L6) |
| 28–121 | 1 each | CC mapping table | 94 bytes: the CC# for each control, in write-order |
| 122–125 | 1 each | pad 1–4 MIDI note | `00`–`7F` (C−2 … G8, with C3 = 60); unverified (same structure as the L6) |
| 130–149 | 2 each (LE) | effect parameters | 10 slots (same order as L6; unverified) |
| 150 | 1 | monitor point | `00` Pre / `01` Pre+Comp / `02` Post |
| 151 | 1 | sub-out point | `00` Pre / `01` Pre+Comp / `02` Post |

### Sound Pad Files

Pad file names are read separately with **GetParam** (`46 00 <pad>` and `46 02 <pad>`):

```
Host: GetParam (F0 52 00 00 46 00 <pad> F7)                     — check if assigned
Device: ParamValue (F0 52 00 00 45 00 <pad> [00 01] F7)        — [00 01] = file assigned

Host: GetParam (F0 52 00 00 46 02 <pad> F7)                     — read file name
Device: ParamValue (F0 52 00 00 45 02 <pad> <header> <packed> F7)
```

The file-name payload:
- Bytes 0–1: header (usually `7F 7F` if no file, ignored if file is assigned)
- Bytes 2–3: file-name byte length (7-bit LE)
- Bytes 4+: UTF-16LE text, packed 8→7-bit (one MSB byte followed by up to seven data bytes)

### Re-Read Sequence

The mixer does not push changes made on its hardware; the app re-reads state at these points:

1. **On session open**: Decode the snapshot immediately
2. **When Device Settings opens**: Send Identity Request, then EditorOpen again
3. **After a scene recall** (from hardware or the app): Re-read snapshot
4. **When Advanced Settings closes**: Re-read snapshot

The SysEx explorer includes a **Snapshot** button to capture the current state and a **Diff** button to show byte-level changes from the last capture.

## Session-Command Writes (`31 <id> …`) — the write path for editable settings

Reverse-engineering the official editor's captures showed that **every editable setting is
written with a session command**, not the `45 <group> <index>` family originally assumed.

> The evidence column cites the original MIDI Monitor captures by name (`captures/12` =
> `12-device-settings.txt`, `maxB` = `maxB-monitor-point.txt`, …; L6 fw 1.00, L6max editor 2.0.0).
> The raw captures are not kept in the repo; the snapshots and reads the tests need are in
> `src/midi/sysex/zoomL6/__tests__/fixtures/editor-captures.json`, keyed by capture name.
>
> Not write commands: **SUB-MIX** is device-menu only (the editor sends nothing), **AI Noise
> Reduction** is a hardware learn function, and **date/time** (`00`) is a one-way clock push.

```
F0 52 00 00 31 <id> <prefix…> <value…> F7        (host → device)
F0 52 00 00 00 <id> F7                            (device → host ack, id echoed)
```

`<prefix…>` is a fixed run of selector bytes; the encoded value bytes follow it. The device state
is read at session open via the **GlobalSettingDump** (see the State Snapshot section above); pad
file names are read separately with `46 02 <pad>` (see Sound Pad Files above).

| id | setting | prefix | value | evidence |
|----|---------|--------|-------|----------|
| `00` | date/time push | — | `1A 09 06 0C <a> <b>` (clock) | sent once at connect (not modelled) |
| `01` | battery type | — | `00` Alkaline / `01` Ni-MH / `02` Lithium | captures/12 |
| `02` | auto power off | — | `00` 10 Hours / `01` Never | captures/12 |
| `03` | mixer control via MIDI | — | `00` off / `01` on | captures/03 |
| `04` | recorder mode | — | `00` Multi Track / `01` Master Only | captures/13 |
| `06` | sound pad play mode | `[pad]` (0-3) | `00` One-shot / `01` Loop / `02` Hold | captures/11 |
| `07` | sound pad level | `[pad]` (0-3) | `00`–`3B` (−∞ … +10 dB) | captures/11 |
| `0C` | MIDI out mode | — | `00` Out / `01` Thru | captures/02 |
| `0D` | MIDI channel | — | channel − 1 (`00`=CH1 … `0F`=CH16) | captures/04 |
| `0F` | sound pad MIDI note | `[pad]` (0-3) | `<note>` then `<mapped-flag>` (0 mapped / 1 Not Mapped) | captures/11 |
| `13` | internal effect parameter | `[effect, param]` | 14-bit LE (`lo` + `hi`·128) | captures/05-09 |
| `14` | AUX send point | `[ch, aux]` (ch 0-7, aux 0/1) | `00` Pre / `01` Post | captures/10 (ch1-6); captures/maxF (ch7-8, L6max) |
| `15` | USB mix minus (L6max) | — | `00` Off / `01` On | captures/maxD |
| `17` | sound pad MIDI clock sync (L6max) | `[pad]` (0-3) | `00` Off / `01` On | captures/maxG |
| `18` | USB audio mode (L6max) | — | `00` Stereo mix / `01` Multi Track | captures/maxE |
| `19` | monitor point (L6max) | — | `00` Pre / `01` Pre+Comp / `02` Post | captures/maxB |
| `1A` | sub-out point (L6max) | — | `00` Pre / `01` Pre+Comp / `02` Post | captures/maxC |

### Effect-parameter map (`31 13 <effect> <param> <lo> <hi>`)

The two selector bytes are the effect index then the parameter index within that effect (0 = first
knob, 1 = second). The value is always two bytes (14-bit little-endian), even for the 0–100 params:

| effect | param 0 | param 1 | capture |
|--------|---------|---------|---------|
| `00` Hall   | Decay (0–100)     | Tone (0–100)     | captures/05-fx-hall.txt |
| `01` Room   | Decay (0–100)     | Tone (0–100)     | captures/06-fx-room.txt |
| `02` Spring | Dwell (0–100)     | Tone (0–100)     | captures/07-fx-spring.txt |
| `03` Delay  | Time (10–2000 ms) | Feedback (0–100) | captures/08-fx-delay.txt |
| `04` Echo   | Time (10–2000 ms) | Repeat (0–100)   | captures/09-fx-echo.txt |

Example — delay TIME 915 ms: `F0 52 00 00 31 13 03 00 13 07 F7` (`lo` 0x13=19, `hi` 0x07=7 → 19+7·128=915).

The pad-note write `31 0F <pad> <note> <flag>` is modelled as `u14le`: note N encodes to `[N, 0]`,
and the "Not Mapped" sentinel value 128 encodes to `[0, 1]` — matching the observed bytes exactly.

## Parameter Registry

Every editable setting on the L6 (MIDI routing, effect parameters, AUX send points, sound pads, device settings) is accessed via the session-command write path above (`31 <id> <prefix…> <value…>`). The companion app maintains a registry of known parameters in `src/midi/sysex/zoomL6/params.ts`.

### Registry Entry Structure

Each parameter definition includes:

- **id**: Unique identifier (e.g., `midiOutMode`, `fx.delay.time`)
- **label**: Human-readable name for the UI
- **category**: `midi`, `fx`, `aux`, `pads`, `system`, `recorder`, `monitor`, or `info`
- **address**: How to access it — either:
  - `{scheme: 'session', id, prefix?}`: **write** via the session command `31 <id> <prefix…> <value…>` (the path every editable setting uses; current values are read from the state snapshot instead, see above). `prefix` is the fixed selector run, e.g. `[pad]`, `[ch, aux]`, `[effect, param]`.
  - `{scheme: 'param', group, index}`: read/write via `46/45 <group> <index>` (used for the placeholder addresses of settings not yet decoded)
  - `{scheme: 'identity'}`: derived from the Identity Reply (firmware version only)
- **encoding**: Byte representation — `u7`, `u14le`, `u28le`, `bool`, `enum`, or `ascii`
- **range**: Min, max, optional step and unit
- **models**: L6 only, L6max only, or both
- **verified**: `true` if the address has been tested on hardware; `false` if placeholder
- **evidence**: Citation where the address came from (e.g., "captures/02-midi-out-mode.txt")

### Placeholder Addresses

While the exact group/index values are being reverse-engineered, unverified entries use group `0x7F` (never sent by the app) with placeholder indices. Once a capture session identifies the real address, the entry is updated with `verified: true` and the evidence note.

### Known Parameter Groups (from zooml6_info.py)

- **Group 0x00** (4 entries, 2 bytes each): Device-level MIDI settings
- **Group 0x02** (4 entries, 4 bytes each): Channel-level settings

Other groups are unknown; the SysEx explorer can sweep ranges to discover new ones.

### Parameter Registry Table

All entries as of this documentation date. The **Address** column shows the session command that
writes the setting: `31 <id>` optionally followed by a fixed argument prefix `+[…]` (the encoded
value bytes follow the prefix on the wire). Fifty-two settings are **verified** against the captures in
`captures/` (write path; reading is covered by the state snapshot section); `firmwareVersion` is verified via the
identity reply. Entries marked `placeholder` are still unverified — L6max-only settings now captured on real L6max hardware are verified too; the remaining placeholders are
`dateTime`/`sdInfo`, whose encodings are undecoded.

| ID | Label | Category | Models | Address | Encoding | Range | Verified |
|---|---|---|---|---|---|---|---|
| `midiOutMode` | MIDI Out Mode | midi | l6, l6max | `31 0C` | enum (1B) | 0–1 | ✓ |
| `mixerControlViaMidi` | Mixer Control via MIDI | midi | l6, l6max | `31 03` | bool (1B) | 0–1 | ✓ |
| `midiChannel` | MIDI Channel | midi | l6, l6max | `31 0D` | u7 (1B) | 1–16 | ✓ |
| `fx.hall.decay` | Decay | fx | l6, l6max | `31 13 +[0,0]` | u14le (2B) | 0–100 | ✓ |
| `fx.hall.tone` | Tone | fx | l6, l6max | `31 13 +[0,1]` | u14le (2B) | 0–100 | ✓ |
| `fx.room.decay` | Decay | fx | l6, l6max | `31 13 +[1,0]` | u14le (2B) | 0–100 | ✓ |
| `fx.room.tone` | Tone | fx | l6, l6max | `31 13 +[1,1]` | u14le (2B) | 0–100 | ✓ |
| `fx.spring.dwell` | Dwell | fx | l6, l6max | `31 13 +[2,0]` | u14le (2B) | 0–100 | ✓ |
| `fx.spring.tone` | Tone | fx | l6, l6max | `31 13 +[2,1]` | u14le (2B) | 0–100 | ✓ |
| `fx.delay.time` | Time | fx | l6, l6max | `31 13 +[3,0]` | u14le (2B) | 0–2000 ms | ✓ |
| `fx.delay.feedback` | Feedback | fx | l6, l6max | `31 13 +[3,1]` | u14le (2B) | 0–100 | ✓ |
| `fx.echo.time` | Time | fx | l6, l6max | `31 13 +[4,0]` | u14le (2B) | 0–2000 ms | ✓ |
| `fx.echo.repeat` | Repeat | fx | l6, l6max | `31 13 +[4,1]` | u14le (2B) | 0–100 | ✓ |
| `batteryType` | Battery Type | system | l6, l6max | `31 01` | enum (1B) | 0–2 | ✓ |
| `autoPowerOff` | Auto Power Off | system | l6, l6max | `31 02` | enum (1B) | 0–1 | ✓ |
| `dateTime` | Date & Time | system | l6, l6max | `placeholder` | ascii (12B) | — | placeholder |
| `recorderMode` | Recorder Mode | recorder | l6, l6max | `31 04` | enum (1B) | 0–1 | ✓ |
| `monitorPoint` | Monitor Point | monitor | l6max | `31 19` | enum (1B) | 0–2 | ✓ |
| `subOutPoint` | Sub-Out Point | monitor | l6max | `31 1A` | enum (1B) | 0–2 | ✓ |
| `usbMixMinus` | USB Mix Minus | monitor | l6max | `31 15` | bool (1B) | 0–1 | ✓ |
| `usbAudioMode` | USB Audio Mode | monitor | l6max | `31 18` | enum (1B) | 0–1 | ✓ |
| `sdInfo` | microSD card | info | l6, l6max | `placeholder` | ascii (0B) | — | placeholder |
| `firmwareVersion` | Firmware | info | l6, l6max | `identity` | ascii (4B) | — | ✓ |
| `aux1SendPoint.ch1` | AUX 1 send point (ch 1) | aux | l6, l6max | `31 14 +[0,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch2` | AUX 1 send point (ch 2) | aux | l6, l6max | `31 14 +[1,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch3` | AUX 1 send point (ch 3) | aux | l6, l6max | `31 14 +[2,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch4` | AUX 1 send point (ch 4) | aux | l6, l6max | `31 14 +[3,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch5` | AUX 1 send point (ch 5) | aux | l6, l6max | `31 14 +[4,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch6` | AUX 1 send point (ch 6) | aux | l6, l6max | `31 14 +[5,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch7` | AUX 1 send point (ch 7) | aux | l6max | `31 14 +[6,0]` | enum (1B) | 0–1 | ✓ |
| `aux1SendPoint.ch8` | AUX 1 send point (ch 8) | aux | l6max | `31 14 +[7,0]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch1` | AUX 2 send point (ch 1) | aux | l6, l6max | `31 14 +[0,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch2` | AUX 2 send point (ch 2) | aux | l6, l6max | `31 14 +[1,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch3` | AUX 2 send point (ch 3) | aux | l6, l6max | `31 14 +[2,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch4` | AUX 2 send point (ch 4) | aux | l6, l6max | `31 14 +[3,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch5` | AUX 2 send point (ch 5) | aux | l6, l6max | `31 14 +[4,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch6` | AUX 2 send point (ch 6) | aux | l6, l6max | `31 14 +[5,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch7` | AUX 2 send point (ch 7) | aux | l6max | `31 14 +[6,1]` | enum (1B) | 0–1 | ✓ |
| `aux2SendPoint.ch8` | AUX 2 send point (ch 8) | aux | l6max | `31 14 +[7,1]` | enum (1B) | 0–1 | ✓ |
| `pad1.mode` | Pad 1 play mode | pads | l6, l6max | `31 06 +[0]` | enum (1B) | 0–2 | ✓ |
| `pad1.level` | Pad 1 level | pads | l6, l6max | `31 07 +[0]` | u7 (1B) | 0–59 dB | ✓ |
| `pad1.note` | Pad 1 MIDI note | pads | l6, l6max | `31 0F +[0]` | u14le (2B) | 0–127 | ✓ |
| `pad1.clockSync` | Pad 1 MIDI clock sync | pads | l6max | `31 17 +[0]` | bool (1B) | 0–1 | ✓ |
| `pad2.mode` | Pad 2 play mode | pads | l6, l6max | `31 06 +[1]` | enum (1B) | 0–2 | ✓ |
| `pad2.level` | Pad 2 level | pads | l6, l6max | `31 07 +[1]` | u7 (1B) | 0–59 dB | ✓ |
| `pad2.note` | Pad 2 MIDI note | pads | l6, l6max | `31 0F +[1]` | u14le (2B) | 0–127 | ✓ |
| `pad2.clockSync` | Pad 2 MIDI clock sync | pads | l6max | `31 17 +[1]` | bool (1B) | 0–1 | ✓ |
| `pad3.mode` | Pad 3 play mode | pads | l6, l6max | `31 06 +[2]` | enum (1B) | 0–2 | ✓ |
| `pad3.level` | Pad 3 level | pads | l6, l6max | `31 07 +[2]` | u7 (1B) | 0–59 dB | ✓ |
| `pad3.note` | Pad 3 MIDI note | pads | l6, l6max | `31 0F +[2]` | u14le (2B) | 0–127 | ✓ |
| `pad3.clockSync` | Pad 3 MIDI clock sync | pads | l6max | `31 17 +[2]` | bool (1B) | 0–1 | ✓ |
| `pad4.mode` | Pad 4 play mode | pads | l6, l6max | `31 06 +[3]` | enum (1B) | 0–2 | ✓ |
| `pad4.level` | Pad 4 level | pads | l6, l6max | `31 07 +[3]` | u7 (1B) | 0–59 dB | ✓ |
| `pad4.note` | Pad 4 MIDI note | pads | l6, l6max | `31 0F +[3]` | u14le (2B) | 0–127 | ✓ |
| `pad4.clockSync` | Pad 4 MIDI clock sync | pads | l6max | `31 17 +[3]` | bool (1B) | 0–1 | ✓ |

## Value Encoding

Every parameter value is encoded as 7-bit bytes in little-endian order (LSB first), matching other Zoom equipment (e.g., MS-50G). The companion app codec is in `src/midi/sysex/zoomL6/codec.ts`.

### Encoding Kinds

- **u7**: Single byte (0–127)
- **u14le**: Two 7-bit bytes (0–16383): `[LSB, MSB]` where MSB is the upper 7 bits
- **u28le**: Four 7-bit bytes (0–268,435,455)
- **bool**: Single byte (0 = false, 1 = true)
- **enum**: Single byte index into a label list (e.g., `0 = "Out"`, `1 = "Thru"`)
- **ascii**: Fixed-length string in 7-bit ASCII (trailing NUL is stripped)

### Example: 14-bit Little-Endian

Delay time value **1234** ms encodes as:

```
1234 & 0x7F = 0x6A (LSB = 106)
1234 >> 7   = 0x09 (MSB = 9)
Bytes: [0x6A, 0x09]
```

On the wire: `F0 52 00 00 45 <group> <index> 6A 09 F7`

### deviceOffset

Some parameters apply an offset before encoding. For example, MIDI channel (1–16 in the UI) is stored as 0–15 on the device:

```
UI value:     1     2     3  ...  16
deviceOffset: -1    -1    -1 ... -1
Device byte:  0     1     2  ...  15
```

The registry defines the offset for each entry; the UI layer and the session transparently apply it.

## How to Contribute Findings

**Writes** come from watching the official ZOOM L6 Editor (macOS):

1. Install [MIDI Monitor](https://www.snoize.com/MIDIMonitor/). In Settings ▸ Display turn on
   **Expert mode**. In a new window, check **L6 Editor Port** under both *MIDI sources* and
   *Spy on output to destinations*, and nothing else.
2. Turn the app's **Editor link** off (or close the app), launch the editor and wait for CONNECTED.
3. Change one setting slowly (e.g. Out → Thru → Out), then ⌘A ⌘C the event list into
   `captures/NN-scenario.txt` (`captures/` is git-ignored scratch space).
4. Decode it; a toggled setting shows up as one `31 <id>` write whose value flips and flips back:
   ```bash
   npm run decode captures/NN-scenario.txt
   npm run decode captures/NN-scenario.txt -- --diff captures/MM-scenario.txt
   ```

**Reads** (where a setting sits in the state snapshot) come from diffing snapshots around one
change, either with the Debug drawer's **SysEx** tab (Open → Snapshot → change the setting →
Re-read snapshot → Snapshot → Diff) or with `swift scripts/l6probe.swift steps.json` on macOS
(verified `31` writes per step, a snapshot after each, restore steps at the end). Never send `45`
SETs to unknown addresses; the explorer's Sweep is GET-only.

**Promote an entry to verified** only from such evidence:

- Write: in `src/midi/sysex/zoomL6/params.ts`, set `address: { scheme: 'session', id, prefix }`,
  `verified: true` and an `evidence` string naming the capture and bytes; add a wire-byte test.
- Read: add a `SnapshotSlot` in `stateSnapshot.ts` with `verified: true` and `evidence`; copy the
  messages its test needs into `src/midi/sysex/zoomL6/__tests__/fixtures/` rather than committing
  the raw capture.
- Run `npm test` and `npm run type-check`, then open a PR describing the findings.

The Debug drawer's SysEx tab logs all inbound and outbound SysEx to the browser console; if the official ZOOM L6 Editor and this app both push on the same port, you will see collisions in the MIDI tab.

## References

- **Magicking/L6-MassStorage**: [GitHub repository](https://github.com/Magicking/L6-MassStorage) with README and `zooml6_info.py` showing known group/index values and firmware/model info parsing
- **MIDI Spec (Recommended Practice 2)**: Universal Identity Request / Reply
- **Zoom MS-50G protocol**: Similar 7-bit little-endian encoding; see `zooml6_info.py` for the parallel
