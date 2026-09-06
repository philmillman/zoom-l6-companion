# Capturing ZOOM L6 Editor SysEx — L6max additions

Thanks for helping! The companion app already understands the plain L6's editor protocol, but a
few settings exist **only on the L6max** and we have no L6max hardware to capture them. This guide
asks you to record just those extra settings. It assumes an **L6max** connected over USB and the
official **ZOOM L6 Editor 2.0.0 or newer** installed (the L6max needs 2.0.0+).

If you would rather capture everything from scratch, the full procedure is in
[CAPTURE_GUIDE.md](CAPTURE_GUIDE.md); this file is the short L6max-only list.

## 1. Set up MIDI Monitor (macOS)

1. Install **MIDI Monitor** from <https://www.snoize.com/MIDIMonitor/> (free). Launch it once so it
   installs its spy driver (it will ask for permission).
2. **MIDI Monitor ▸ Settings ▸ Display**: turn on **Expert mode** and pick the clock-time format.
3. New window (⌘N) ▸ expand **Sources**:
   - Under *MIDI sources* check **L6max for L6 Editor Port** (or "for L6 Editor Port").
   - Under *Spy on output to destinations* check the same **… for L6 Editor Port**.
   - Leave the MIDI I/O and Mixer Control ports unchecked.
4. Set the event-count field (bottom of the window) to **20000**.

On Windows you can use a USB analyzer instead, but MIDI Monitor on a Mac is by far the easiest.

## 2. Record one scenario per file

For each row: with MIDI Monitor already running, launch ZOOM L6 Editor, wait for **CONNECTED**, do
the steps, then click the event list, ⌘A, ⌘C, and paste into a text file with the given name. Press
⌘K to clear before the next one. Move slowly, about a second between clicks.

**Write down, next to each step, the exact value the editor showed** — the mixer's own numbers are
the only ground truth we have. Put those notes in `notes-l6max.md`.

| File | In the editor, do this |
|---|---|
| `maxA-connect.txt` | Start MIDI Monitor first, then launch the editor; wait for CONNECTED and 5 seconds. (Confirms the L6max init sequence and its capability list.) |
| `maxB-monitor-point.txt` | Monitor Point pull-down: Pre Master Fader → Pre Master Fader + Comp → Post Master Fader → back to Pre Master Fader. |
| `maxC-subout-point.txt` | Sub-Out Point pull-down: Pre Master Fader → Pre Master Fader + Comp → Post Master Fader → back. |
| `maxD-usb-mix-minus.txt` | USB Mix Minus: Off → On → Off. |
| `maxE-usb-audio-mode.txt` | USB Audio Interface ▸ Mode: Stereo mix → Multi Track → Stereo mix (if the editor exposes it; if it is device-menu only, skip and note that). |
| `maxF-aux78.txt` | AUX Send Point ▸ Edit: channel 7 AUX 1 Pre → Post, channel 8 AUX 2 Post → Pre, OK. (L6max has channels 7 and 8; the plain L6 stops at 6.) |
| `maxG-pad-clock-sync.txt` | Sound pad 1: MIDI Clock Sync Off → On → Off (this is L6max-only). |
| `maxH-submix.txt` | If the editor exposes SUB-MIX level per channel, sweep one channel's SUB-MIX min → mid → max, OK. If it is device-only, note that. |
| `maxI-effect-params.txt` | Effect Parameter ▸ Edit: for each of Hall/Room/Spring/Delay/Echo, move both knobs min → mid → max, OK. (Lets us confirm the L6max uses the same effect-parameter encoding as the L6.) |
| `maxJ-ai-nr.txt` | Select "AI Noise Reduction" on the mixer, then open any effect/menu screens in the editor. (AI NR is L6max-only; we want to see whether it sends anything.) |

If a setting turns out to be reachable only from the L6max's own menu screen and not the editor,
just note "device-menu only, editor shows nothing" for that file — that is still useful to know.

## 3. Send it back

Zip the `max*.txt` files plus `notes-l6max.md` and send them over, or open a pull request adding
them under `captures/` in the repo. Each file is small plain text. That is everything — thank you!

## What we already have (so you don't need to recapture it)

The plain-L6 settings are already decoded: MIDI Out/Thru mode, Mixer Control via MIDI, MIDI channel,
battery type, auto power off, recorder mode, the five internal effects' parameters, AUX send points
for channels 1-6, and sound-pad play mode / level / MIDI note. The L6max shares all of these; the
list above is only the parts unique to the L6max.
