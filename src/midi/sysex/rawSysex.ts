import type { Output } from 'webmidi';

const SYX_START = 0xf0;
const SYX_END = 0xf7;

/**
 * Sends a complete System Exclusive message (including leading 0xF0 and trailing 0xF7).
 * Use this for arbitrary vendor messages; higher-level helpers can wrap it.
 * Requires WebMidi to have been enabled with `{ sysex: true }`.
 */
export function sendCompleteSysex(output: Output, bytes: readonly number[]): void {
  if (bytes.length < 2 || bytes[0] !== SYX_START || bytes[bytes.length - 1] !== SYX_END) {
    throw new RangeError('SysEx must start with 0xF0 and end with 0xF7');
  }
  output.send(Uint8Array.from(bytes));
}
