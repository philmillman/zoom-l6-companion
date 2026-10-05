# CLAUDE.md

Guidance for working in this repository.

## What this is

A web-based companion app for the **Zoom LiveTrak L6 / L6max** mixer, built with **Vue 3 +
TypeScript + Vite** and **WebMIDI.js**. It controls the mixer from the browser over USB MIDI:
channel strips and global controls via MIDI CC, sound pads via notes, scenes via program change,
and — the newer layer — editor-only settings via Zoom's proprietary SysEx protocol.

Not affiliated with Zoom Corp. Live build: https://zooml6.webmidi.cc

## Commands

```bash
npm run dev          # Vite dev server (WebMIDI needs Chrome/Edge/Firefox + a real device)
npm run build        # type-check + production build
npm run type-check   # vue-tsc --build (the CI gate; run after every change)
npm test             # vitest run (pure protocol/codec/parser/session tests)
npm run decode captures/NN-name.txt [-- --diff captures/other.txt]   # decode a MIDI Monitor capture
```

There is no linter. `type-check` and `test` must both stay green.

## Conventions

- 2-space indent, single quotes, semicolons. Vue SFCs use `<script setup lang="ts">` with scoped styles.
- The dark theme is hardcoded per-component (no CSS variables): bg `#1e1e1e`/`#1a1a1a`, borders `#333`,
  accent `#4a90e2`, warn `#ff9800`, error `#f44336`, ok `#4caf50`. Match neighbours.
- **Do not add AI / Co-Authored-By attribution to commit messages** (project preference).
- Commit or push only when asked; branch off `main` for changes.

## Architecture

Single-page app; `src/App.vue` is a large root component (local refs, no router/store). Shared state
lives in module singletons, not a store.

- **`src/services/midiService.ts`** — singleton wrapping WebMIDI. CC/notes/PC go to the selected
  *Mixer Control* port; SysEx goes to the dedicated *Editor* port. `sendSysexRaw` is the single send
  path (the Debug drawer monkey-patches it to log). `addEditorSysexListener` fans out inbound editor
  SysEx and rebinds across USB re-enumeration (mass-storage toggling replaces the port objects).
- **`src/config/midiConfig.ts` / `midiConfigL6Max.ts`** — CC/note/PC mappings, editable in Advanced
  Settings and persisted to `localStorage` (`zoom-l6-*`). `detectMixerType()` picks L6 vs L6max.
- **`src/midi/sysex/zoomL6/`** — the SysEx protocol layer (pure, unit-tested):
  - `messages.ts` builders, `parse.ts` classifier, `codec.ts` 7-bit LE encode/decode,
    `params.ts` the **parameter registry** (single source of truth for the UI + explorer),
    `editorSession.ts` the session manager (identity → editor-open → 100 ms heartbeat, one request
    in flight, no correlation id), `capture/` the MIDI Monitor decoder.
- **`src/services/editorSessionService.ts`** — the `editorSession` singleton over `midiService`.
- **`src/composables/useDeviceSettings.ts`** — registry-driven device state: `link` lifecycle,
  ref-counted `acquire()/release()`, optimistic throttled `set()` + awaitable `setNow()`, verified-only gating. Components
  read/write settings only through this.
- **UI**: `ParamKnob` / `EffectParams` (effect knobs), `DeviceSettingsPanel` / `DeviceParamField`
  (Advanced Settings ▸ Device Settings, incl. editor link + USB mass storage), the Sound Pads section
  of `AdvancedSettings.vue` (pad play mode / level / MIDI note / L6max clock sync, laid out like the
  official editor), `debug/SysexExplorer.vue` (Debug drawer SysEx tab).

## The SysEx protocol (see docs/PROTOCOL.md for the full tables)

Envelope `F0 52 00 00 <cmd> <args> F7` (52 = Zoom). Editable settings are **written** with a session
command `31 <id> <args>` and acked by `00 <id>`. Example: MIDI Out→Thru is `F0 52 00 00 31 0C 01 F7`.
The `45/46 <group> <index>` family is the editor *reading* device state; its per-setting read
encoding is **not yet decoded**, so registry settings are currently **write-only**
(`useDeviceSettings.refresh` skips them; the UI shows what you set, not what the device holds).

### Adding or verifying a setting

1. Capture the official ZOOM L6 Editor with MIDI Monitor per `docs/CAPTURE_GUIDE.md`; save under
   `captures/`. `npm run decode` prints the `31 <id>` writes.
2. In `params.ts`, set the entry's `address` to `{ scheme: 'session', id, prefix }` (prefix = the
   fixed selector bytes, e.g. pad index or effect+param), the right `encoding`/`range`/labels,
   `verified: true`, and an `evidence` string naming the capture and bytes.
3. Add a byte-level test in `src/midi/sysex/zoomL6/__tests__/` asserting the exact wire bytes.
4. Unverified entries stay hidden from the UI (there is no "show experimental" toggle) and are
   refused by `editorSession.setValue` without `{ force: true }`. Only mark `verified` from a real
   capture — never invent an address. The L6max-only settings were verified on an L6max
   (`captures/max*.txt`); `docs/CAPTURE_GUIDE_L6MAX.md` covers capturing more.

## Gotchas

- The official editor and this app must not hold a session at once (both heartbeat the Editor port).
  The "Editor link" switch in Advanced Settings and `suspend()` before mass-storage exist for this.
- Never sweep SET (`45`) addresses on hardware from the explorer — GET (`46`) only.
- Values > 127 are 7-bit little-endian (LSB first); `codec.ts` handles this and `deviceOffset`
  (e.g. MIDI channel stored as value − 1).
- WebMIDI is unavailable in some embedded browser previews; verify MIDI behaviour in real Chrome.
- The Safari/iOS warnings in `App.vue` are gated on feature detection (`navigator.requestMIDIAccess`),
  not the user agent, so WebMIDI-capable apps like MIDIWeb Browser don't trigger them. iPadOS reports a
  Mac user agent; `detectPlatform()` uses `maxTouchPoints` to tell iPads apart.
- Pad MIDI notes and the MIDI channel are each one value shared by the app and the mixer: the UI
  writes the mixer immediately and the app config on Save; Cancel reverts the mixer and Save pushes
  values changed by Reset to Defaults (`syncMixer` in `AdvancedSettings.vue`). The channel control
  lives in Device Settings ▸ MIDI (`DeviceParamField` in controlled mode via `modelValue`).
  `PAD_NOTE_NOT_MAPPED` (128, `midiConfig.ts`) means "Not Mapped" and disables that pad in the main view.
- Note names follow the official editor (C3 = 60): use `midiNoteLabel()` from `midiConfig.ts`.
