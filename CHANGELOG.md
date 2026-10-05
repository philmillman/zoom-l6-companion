# Changelog

## 1.0.0 — 2026-10-05

The companion app can now change the settings that used to need the official ZOOM L6 Editor, and
it reads your mixer's current settings when it connects.

### New

- **Device settings.** Change the mixer's settings from Advanced Settings ▸ Device Settings:
  - MIDI Out / Thru, Mixer Control via MIDI and the MIDI channel
  - Battery type, auto power off and recorder mode
  - AUX 1 / AUX 2 send point (pre or post fader) for each channel
  - **L6max:** monitor point, sub-out point, USB Mix Minus, USB audio mode, and AUX send points
    for channels 7–8
- **Effect knobs.** The selected internal effect now has knobs next to the EFX selector: Decay and
  Tone for Hall and Room, Dwell and Tone for Spring, Time and Feedback for Delay, and Time and
  Repeat for Echo.
- **Sound pad editor.** Set each pad's play mode (One-shot, Loop, Hold), level (−∞ to +10 dB) and
  MIDI note, laid out like the official editor. On the L6max you can also turn MIDI clock sync on
  per pad. Each pad shows the name of the file assigned to it.
- **Reads your mixer's settings on connect.** Controls show what the mixer is actually set to, not
  a default. The app also picks up the mixer's CC mapping, MIDI channel and pad notes, so a custom
  mapping made in the official editor carries over. A short notice tells you when it does. The
  app reads the settings again when you open Device Settings, recall a scene, or close Advanced
  Settings.
- **Works alongside the official editor.** An "Editor link" switch in Device Settings releases the
  connection so you can use the official ZOOM L6 Editor without closing the app.
- **iPhone and iPad support** through the free
  [MIDIWeb Browser](https://apps.apple.com/us/app/midiweb-browser/id6757226617) app. Safari now
  points you to it.
- **Report a bug / Request a feature** links in the footer.
- **SysEx explorer** in the Debug drawer, for anyone who wants to dig into the mixer's protocol.

### Improved

- The app connects to both of the mixer's ports when they're available: faders, pads and scenes
  over "Mixer Control", and the new settings over the editor port, which is found automatically.
  The connection screen explains this.
- **Advanced Settings is reorganized.** USB mass storage moved into Device Settings, and the old
  "Non-MIDI" section is gone.
  - The MIDI channel is now a single 1–16 dropdown that sets both the app and the mixer.
  - Pad MIDI notes are shared the same way.
  - Cancel puts the mixer back the way it was.
  - Channel Controls starts collapsed, and the dropdowns look lighter.
- Pads set to "Not Mapped" on the mixer are disabled in the main view, with a tooltip explaining
  why.
- Unsupported-browser warnings only appear when Web MIDI is actually missing, and iPads are
  detected correctly.
- The connection screen explains how to bridge MIDI on mobile setups (such as Android) that only
  expose one port.
- New app icon.

## 0.6.0 — 2026-04-20

- **USB mass storage.** Switch the mixer's SD card to USB drive mode (and back) from Advanced
  Settings, without using the mixer's buttons. ([#9](https://github.com/philmillman/zoom-l6-companion/pull/9))
- The Debug drawer shows SysEx messages as well as regular MIDI.

## 0.5.0 — 2025-11-19

- **L6max support.** The app detects an L6max and adds its extra channels, scenes, send and AI
  Noise Reduction effect type. You can also pick the mixer model by hand in Advanced Settings
  and override any of its MIDI mappings. ([#7](https://github.com/philmillman/zoom-l6-companion/pull/7))

## 0.4.0 — 2025-10-19

- **Scenes.** Recall scenes from the app; scene changes made on the mixer show up in the app too.
- Turn off the LFO on a single control.
- Clearer messages when your browser or platform doesn't support Web MIDI.
- Fixed list formatting on mobile.

## 0.3.0 — 2025-10-13

- **Advanced Settings.** Customize every MIDI CC mapping for the channel and global controls, the
  sound pad notes and the MIDI channel. Duplicate CCs and notes are flagged, you can reset to
  factory defaults, and your settings are saved in the browser.
- Pause and resume LFOs globally or per channel.
- Reset buttons look and behave the same everywhere.

## 0.2.0 — 2025-10-07

- **Debug console** showing incoming and outgoing MIDI, including sound pad notes. It keeps its
  contents when you hide and show it.
- Tighter compact layout.

## 0.1.0 — 2025-10-01

First release.

- **6 channel strips:** 3-band EQ with mid frequency, pan, AUX 1 / AUX 2 and effect sends,
  volume fader, and Mute, Mono (ch 3/4) and USB (ch 5/6) buttons. Double-click a control to reset
  it, or reset a whole channel.
- **Global controls:** effect type (Hall, Room, Spring, Delay, Echo) and the compressor.
- **Sound pads:** trigger the mixer's 4 pads over MIDI.
- **LFOs** on any knob: sine, triangle, square or saw waves, bipolar, positive or negative
  modulation, and adjustable rate and depth. LFOs can be turned off per channel or globally.
- Auto-connects to the mixer, with manual port selection as a fallback.
- Dark theme, compact and regular views, and a layout that works on phones and tablets.
