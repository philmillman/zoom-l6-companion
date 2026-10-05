/**
 * App-wide Zoom L6 editor session, wired to WebMIDI.
 *
 * Lives in a module singleton (not in a component) because the Debug drawer is `v-if`-mounted and
 * the session must survive it being closed.
 */
import { ZoomL6EditorSession } from '../midi/sysex/zoomL6/editorSession';
import { midiService } from './midiService';

export const editorSession = new ZoomL6EditorSession({
  // Dispatch through the object at call time: the Debug drawer monkey-patches
  // `midiService.sendSysexRaw` to log outbound SysEx, and a bound reference captured at import
  // time would bypass that patch.
  send: (bytes) => midiService.sendSysexRaw(bytes),
  subscribe: (cb) => midiService.addEditorSysexListener(cb),
});
