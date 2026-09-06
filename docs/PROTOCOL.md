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

**Concurrent sessions:** The official ZOOM L6 Editor and this app must not both hold an open session. If they overlap, SysEx messages collide and both may malfunction. Always close one before opening the other; the CAPTURE_GUIDE.md recommends quitting the editor before using this app's editor link.

## Parameter Registry

Every editable setting on the L6 (MIDI routing, effect parameters, AUX send points, sound pads, device settings) is accessed via the **Get/Set Parameter** protocol (`46 <group> <index>` / `45 <group> <index> <values…>`). The companion app maintains a registry of known parameters in `src/midi/sysex/zoomL6/params.ts`.

### Registry Entry Structure

Each parameter definition includes:

- **id**: Unique identifier (e.g., `midiOutMode`, `fx.delay.time`)
- **label**: Human-readable name for the UI
- **category**: `midi`, `fx`, `aux`, `pads`, `system`, `recorder`, `monitor`, or `info`
- **address**: How to access it — either:
  - `{scheme: 'param', group, index}`: read/write via `46/45 <group> <index>`
  - `{scheme: 'session', id}`: accessed via session command (`31 <id> <value…>`)
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

All entries as of this documentation date. Only `firmwareVersion` is **verified on hardware**; all others are placeholders pending reverse-engineering captures.

| ID | Label | Category | Models | Encoding | Range | Verified |
|---|---|---|---|---|---|---|
| `midiOutMode` | MIDI Out Mode | midi | l6, l6max | enum (1B) | 0–1 |  |
| `mixerControlViaMidi` | Mixer Control via MIDI | midi | l6, l6max | bool (1B) | 0–1 |  |
| `midiChannel` | MIDI Channel | midi | l6, l6max | u7 (1B) | 1–16 |  |
| `fx.hall.decay` | Decay | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.hall.tone` | Tone | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.room.decay` | Decay | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.room.tone` | Tone | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.spring.dwell` | Dwell | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.spring.tone` | Tone | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.delay.time` | Time | fx | l6, l6max | u14le (2B) | 0–2000 ms |  |
| `fx.delay.feedback` | Feedback | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `fx.echo.time` | Time | fx | l6, l6max | u14le (2B) | 0–2000 ms |  |
| `fx.echo.repeat` | Repeat | fx | l6, l6max | u7 (1B) | 0–100 |  |
| `batteryType` | Battery Type | system | l6, l6max | enum (1B) | 0–2 |  |
| `autoPowerOff` | Auto Power Off | system | l6, l6max | enum (1B) | 0–1 |  |
| `dateTime` | Date & Time | system | l6, l6max | ascii (12B) | N/A |  |
| `recorderMode` | Recorder Mode | recorder | l6, l6max | enum (1B) | 0–1 |  |
| `monitorPoint` | Monitor Point | monitor | l6max | enum (1B) | 0–2 |  |
| `subOutPoint` | Sub-Out Point | monitor | l6max | enum (1B) | 0–2 |  |
| `usbMixMinus` | USB Mix Minus | monitor | l6max | bool (1B) | 0–1 |  |
| `usbAudioMode` | USB Audio Mode | monitor | l6max | enum (1B) | 0–1 |  |
| `sdInfo` | microSD card | info | l6, l6max | ascii (0B) | N/A |  |
| `firmwareVersion` | Firmware | info | l6, l6max | ascii (4B) | N/A | ✓ |
| `aux1SendPoint.ch1` | AUX 1 send point (ch 1) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch2` | AUX 1 send point (ch 2) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch3` | AUX 1 send point (ch 3) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch4` | AUX 1 send point (ch 4) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch5` | AUX 1 send point (ch 5) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch6` | AUX 1 send point (ch 6) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch7` | AUX 1 send point (ch 7) | aux | l6max | enum (1B) | 0–1 |  |
| `aux1SendPoint.ch8` | AUX 1 send point (ch 8) | aux | l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch1` | AUX 2 send point (ch 1) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch2` | AUX 2 send point (ch 2) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch3` | AUX 2 send point (ch 3) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch4` | AUX 2 send point (ch 4) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch5` | AUX 2 send point (ch 5) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch6` | AUX 2 send point (ch 6) | aux | l6, l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch7` | AUX 2 send point (ch 7) | aux | l6max | enum (1B) | 0–1 |  |
| `aux2SendPoint.ch8` | AUX 2 send point (ch 8) | aux | l6max | enum (1B) | 0–1 |  |
| `pad1.mode` | Pad 1 play mode | pads | l6, l6max | enum (1B) | 0–2 |  |
| `pad1.level` | Pad 1 level | pads | l6, l6max | u7 (1B) | 0–127 dB |  |
| `pad1.note` | Pad 1 MIDI note | pads | l6, l6max | u7 (1B) | 0–127 |  |
| `pad1.clockSync` | Pad 1 MIDI clock sync | pads | l6max | bool (1B) | 0–1 |  |
| `pad2.mode` | Pad 2 play mode | pads | l6, l6max | enum (1B) | 0–2 |  |
| `pad2.level` | Pad 2 level | pads | l6, l6max | u7 (1B) | 0–127 dB |  |
| `pad2.note` | Pad 2 MIDI note | pads | l6, l6max | u7 (1B) | 0–127 |  |
| `pad2.clockSync` | Pad 2 MIDI clock sync | pads | l6max | bool (1B) | 0–1 |  |
| `pad3.mode` | Pad 3 play mode | pads | l6, l6max | enum (1B) | 0–2 |  |
| `pad3.level` | Pad 3 level | pads | l6, l6max | u7 (1B) | 0–127 dB |  |
| `pad3.note` | Pad 3 MIDI note | pads | l6, l6max | u7 (1B) | 0–127 |  |
| `pad3.clockSync` | Pad 3 MIDI clock sync | pads | l6max | bool (1B) | 0–1 |  |
| `pad4.mode` | Pad 4 play mode | pads | l6, l6max | enum (1B) | 0–2 |  |
| `pad4.level` | Pad 4 level | pads | l6, l6max | u7 (1B) | 0–127 dB |  |
| `pad4.note` | Pad 4 MIDI note | pads | l6, l6max | u7 (1B) | 0–127 |  |
| `pad4.clockSync` | Pad 4 MIDI clock sync | pads | l6max | bool (1B) | 0–1 |  |

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

If you are reverse-engineering new parameter addresses:

1. **Record a capture**: Follow the steps in [docs/CAPTURE_GUIDE.md](./CAPTURE_GUIDE.md) to record MIDI Monitor output (macOS) or equivalent tool (Linux / Windows) while using the official ZOOM L6 Editor.

2. **Decode the capture**:
   ```bash
   npm run decode captures/NN-scenario.txt
   ```
   This prints a human-readable report of every parameter read/write, grouped by group/index.

3. **Compare captures** (optional):
   ```bash
   npm run decode captures/NN-scenario.txt -- --diff captures/MM-scenario.txt
   ```
   Shows only the differences between two captures.

4. **Inspect the SysEx explorer** (live, in the app):
   - Open Debug drawer (⌘D or gear icon)
   - Go to **SysEx** tab
   - Click **Open** to start an editor session
   - Use **Sweep** to query groups/indices automatically (GET only; never use SET on placeholders)
   - Use **Snapshot** to capture current device state, then modify on hardware and **Diff** to see what changed

5. **Promote an entry to verified**:
   - In `src/midi/sysex/zoomL6/params.ts`, find the entry
   - Change `address: placeholder()` to `address: {scheme: 'param', group: X, index: Y}`
   - Change `verified: false` to `verified: true`
   - Add `evidence: "captures/NN-scenario.txt lines A–B"` with a specific cite
   - Run `npm test` to ensure no duplicate addresses

6. **Run tests**:
   ```bash
   npm test
   npm run type-check
   ```

7. **Submit a PR** linking to your capture(s) and parameter findings.

The Debug drawer's SysEx tab logs all inbound and outbound SysEx to the browser console; if the official ZOOM L6 Editor and this app both push on the same port, you will see collisions in the MIDI tab.

## References

- **Magicking/L6-MassStorage**: [GitHub repository](https://github.com/Magicking/L6-MassStorage) with README and `zooml6_info.py` showing known group/index values and firmware/model info parsing
- **MIDI Spec (Recommended Practice 2)**: Universal Identity Request / Reply
- **Zoom MS-50G protocol**: Similar 7-bit little-endian encoding; see `zooml6_info.py` for the parallel
