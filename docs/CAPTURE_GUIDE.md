# Capturing ZOOM L6 Editor SysEx traffic (macOS)

The official ZOOM L6 Editor talks to the mixer over the dedicated **L6 Editor Port** using
Zoom‑proprietary SysEx. Most of that protocol is undocumented. This guide explains how to
record what the editor sends and receives so the companion app can learn the parameter
addresses. The recordings are plain text and are decoded with `npm run decode`.

## 1. Install MIDI Monitor

1. Download **MIDI Monitor** from <https://www.snoize.com/MIDIMonitor/> (free, open source) and
   move it to Applications.
2. Launch it once. It installs `~/Library/Audio/MIDI Drivers/MIDI Monitor.plugin`, which is what
   makes "spying" on other apps' output possible. If macOS asks, allow it.

## 2. Configure a monitor window

1. **MIDI Monitor ▸ Settings ▸ Display**: turn **Expert mode** on (the Data column becomes plain
   hex) and choose the clock‑time timestamp format.
2. Open a new document (⌘N). Expand **Sources**:
   - Under *MIDI sources* check only **L6 Editor Port** (device → computer).
   - Under *Spy on output to destinations* check only **L6 Editor Port** (computer → device).
   - Leave the *MIDI I/O* and *Mixer Control* ports unchecked to keep noise down.
3. In the event‑count field at the bottom of the window type **20000** and press Return
   (the editor sends a heartbeat ten times a second, so lists grow quickly).

## 3. Record one scenario at a time

1. Plug in the L6, switch it on, make sure the companion app's **Editor link** is off (Advanced
   Settings) or the app is closed, and quit any DAW that uses the L6 ports.
2. Launch **ZOOM L6 Editor** and wait for **CONNECTED**.
3. Do exactly one scenario from the table below. Move slowly; leave a second between actions.
4. Click in the event list, press ⌘A then ⌘C, and paste into a new text file named
   `captures/NN-scenario.txt` (numbers below). Then press ⌘K to clear the list.
5. Write down what you did and the value the editor displayed after each step in
   `captures/NOTES.md`. The L6 has no display, so the editor's numbers are the ground truth.

| # | File | What to do |
|---|---|---|
| 01 | `01-connect.txt` | Start MIDI Monitor **before** the editor. Launch the editor, wait for CONNECTED, wait 5 s. |
| 02 | `02-midi-out-mode.txt` | MIDI Out Mode: Out → Thru → Out. |
| 03 | `03-mixer-control-via-midi.txt` | Mixer Control via MIDI: off → on → off. |
| 04 | `04-midi-channel.txt` | MIDI Channel: 1 → 2 → 16 → 1. |
| 05 | `05-fx-hall.txt` | Select **Hall** with the SEL button on the mixer. Effect Parameter ▸ Edit. DECAY: min → middle → max. TONE: min → middle → max. OK. |
| 06 | `06-fx-room.txt` | Same for **Room** (DECAY, TONE). |
| 07 | `07-fx-spring.txt` | Same for **Spring** (DWELL, TONE). |
| 08 | `08-fx-delay.txt` | Same for **Delay** (TIME, FEEDBACK). |
| 09 | `09-fx-echo.txt` | Same for **Echo** (TIME, REPEAT). |
| 10 | `10-aux-send-point.txt` | AUX Send Point ▸ Edit: channel 1 AUX 1 Pre → Post; channel 6 AUX 2 Post → Pre; OK. |
| 11 | `11-sound-pad.txt` | Sound pad 1: Play mode One‑shot → Loop → Hold → One‑shot; Level −∞ → 0 dB → +10 dB → 0 dB; MIDI Note 60 → Not Mapped → 60. |
| 12 | `12-device-settings.txt` | Battery Type: Alkaline → Ni‑MH → Lithium → Alkaline. Auto Power Off: 10 Hours → Never → 10 Hours. |
| 13 | `13-recorder-mode.txt` | Recorder Mode: Multi Track → Master Only → Multi Track. |
| 14 | `14-cc-mapping.txt` | MIDI CC# Mapping ▸ Edit: change EQ HI LEVEL (CH 1) to 20, OK. Then Edit ▸ Default settings ▸ OK. |
| 15 | `15-hardware-changes.txt` | With the editor open, on the mixer: press SEL twice, press channel 1 mute twice, hold Scene B until it lights. |
| 16 | `16-quit.txt` | Quit the editor (⌘Q). Wait 3 s. |

Write the values you saw in `captures/NOTES.md`, for example:

```
05-fx-hall: DECAY min=0 mid=50 max=100 ; TONE min=0 mid=50 max=100
08-fx-delay: TIME min=0 mid=1000 max=2000 ms ; FEEDBACK 0/50/100
```

## 4. Format reference (what the decoder expects)

One event per line, tab‑separated, no header:

```
14:02:11.532	To L6 Editor Port	SysEx		F0 52 00 00 31 0B F7
14:02:11.541	From L6 Editor Port	SysEx		F0 52 00 00 00 0B F7
```

- `To …` means computer → mixer (spied), `From …` means mixer → computer.
- Without Expert mode the Data column has an extra cell (`ZOOM Corporation 7 bytes`) before
  the hex; the decoder accepts both.
- Events longer than 255 data bytes are cut off with `…`. For those, double‑click the event,
  click **Save As** in the detail window and put the `.syx` file next to the text file.

## 5. Decode

```bash
npm run decode captures/02-midi-out-mode.txt
npm run decode captures/02-midi-out-mode.txt -- --diff captures/01-connect.txt
```

The report lists every parameter address the editor read or wrote, in order, with the values,
so a setting toggled Out → Thru → Out shows up as one address whose value flips and flips back.
