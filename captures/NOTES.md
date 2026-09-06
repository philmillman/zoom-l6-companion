# Capture notes — decoded write protocol (L6, firmware 1.00, editor 2.0.0)

All editable settings are written with a **session command** `F0 52 00 00 31 <id> <args…> F7`
on the "L6 for L6 Editor Port". (The `45/46 <group> <index>` family seen at connect is the editor
*reading* device state — sound-pad file names as ASCII in groups 1/2, a small settings block in
group 0 — and its per-setting encoding is not yet decoded, so reads stay best-effort.)

Confirmed `31 <id>` write commands (id = hex):

| id | setting | arg layout | values seen |
|----|---------|------------|-------------|
| 00 | date/time push | `1A 09 06 0C <a> <b>` | varies per session (clock); sent once at connect |
| 01 | battery type | `<v>` | 00 Alkaline, 01 Ni-MH, 02 Lithium |
| 02 | auto power off | `<v>` | 00 = 10 Hours, 01 = Never |
| 03 | mixer control via MIDI | `<v>` | 00 off, 01 on |
| 04 | recorder mode | `<v>` | 00 Multi Track, 01 Master Only |
| 06 | sound pad play mode | `<pad> <v>` | pad 0-3; v 00 One-shot, 01 Loop, 02 Hold |
| 07 | sound pad level | `<pad> <v>` | pad 0-3; v 0x00-0x3B (editor shows −∞…+10 dB) |
| 0C | MIDI out mode | `<v>` | 00 Out, 01 Thru |
| 0D | MIDI channel | `<v>` | v = channel − 1 (00=CH1 … 0F=CH16) |
| 0F | sound pad MIDI note | `<pad> <note> <mapped-flag>` | note 0-127, last byte 00 mapped / 01 "Not Mapped" (note byte 00 when unmapped) |
| 13 | internal effect parameter | `<effect> <param> <lo> <hi>` | value = lo + hi·128 (14-bit LE). `<effect>` 00-04, `<param>` 00/01 (see map below) |
| 14 | AUX send point | `<ch> <aux> <v>` | ch 0-5, aux 0=AUX1 / 1=AUX2, v 00 Pre / 01 Post |

### Effect-parameter map (`31 13 <effect> <param> <lo> <hi>`) — DECODED

The `31 13` arg is **two** selector bytes: `<effect>` then `<param>` (0 = first knob, 1 = second),
followed by the value as 14-bit LE (`lo + hi·128`). Confirmed by sweeping one knob per capture and
reading the value range (delay/echo TIME reach 2000 → genuinely 14-bit; every other param 0-100 but
still transmitted as two bytes):

| effect | param 0 | param 1 | capture | value range |
|--------|---------|---------|---------|-------------|
| 00 Hall   | Decay (0-100)      | Tone (0-100)     | captures/05-fx-hall.txt   | both 0..100 |
| 01 Room   | Decay (0-100)      | Tone (0-100)     | captures/06-fx-room.txt   | both 0..100 |
| 02 Spring | Dwell (0-100)      | Tone (0-100)     | captures/07-fx-spring.txt | both 0..100 |
| 03 Delay  | Time (10-2000 ms)  | Feedback (0-100) | captures/08-fx-delay.txt  | param0 10..2000, param1 0..100 |
| 04 Echo   | Time (10-2000 ms)  | Repeat (0-100)   | captures/09-fx-echo.txt   | param0 10..2000, param1 0..100 |

Example: delay TIME 915 ms → `F0 52 00 00 31 13 03 00 13 07 F7` (lo 0x13=19, hi 0x07=7, 19+7·128=915).

Device→host: every write is followed by `F0 52 00 00 00 <id> F7` (ack echoing the id, e.g. `00 13`
for every effect write, `00 14` for AUX, `00 06/07/0F` for pads). Verified in each capture above.

The `2A 03` editor-open reply's `supportedIds` run: `01 02 03 04 05 06 0B 0C 0D 0E 0F 10 15 16 17 18
19 1A 21 22 …` (advertises most, but not all, writable ids — 0x13 and 0x14 are used yet absent).

## Status

All ids in the table above are decoded and promoted to `verified: true` in
`src/midi/sysex/zoomL6/params.ts` (address `{scheme:'session', id, prefix}`), except date/time (00,
push-only) which is left as-is. Reads (`46 …`) are still not decoded, so these are **write-only**.
L6max-only settings (monitor/sub-out point, USB mix-minus/audio mode, pad clock-sync, AUX ch7/8)
stay unverified — no hardware to capture them.
