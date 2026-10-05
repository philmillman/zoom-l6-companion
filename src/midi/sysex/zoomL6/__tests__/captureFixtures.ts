import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZoomL6 } from '../parse';

/**
 * Test fixtures taken from real hardware:
 *
 * - `fixtures/editor-captures.json`: the editor-open snapshots (`2A`) and param reads (`45`) from the
 *   official-editor MIDI Monitor captures (L6 fw 1.00 `01-…`–`13-…`, L6max `maxA-…`–`maxJ-…`), keyed
 *   by capture name. Evidence strings in `params.ts` / `stateSnapshot.ts` cite these names.
 * - `fixtures/probe-l6-snapshot-diff.jsonl`: snapshots from `scripts/l6probe.swift` on a live L6,
 *   one `{label, payload}` per step.
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const captures: Record<string, string[]> = JSON.parse(
  readFileSync(join(fixturesDir, 'editor-captures.json'), 'utf8'),
);

const bytes = (hex: string) => hex.split(' ').map((h) => parseInt(h, 16));

/** The parsed messages of the capture whose name starts with `prefix` (e.g. `'01-'`, `'maxA-'`). */
export function loadCapture(prefix: string) {
  const name = Object.keys(captures).find((n) => n.startsWith(prefix));
  if (!name) throw new Error(`no capture starting with "${prefix}"`);
  return captures[name].map((hex) => parseZoomL6(bytes(hex)));
}

/** The editor-open snapshot payload at the start of the capture (reflects the previous capture's end state). */
export function firstPayload(prefix: string): number[] {
  for (const m of loadCapture(prefix)) {
    if (m.kind === 'editorOpenState') return m.payload;
  }
  throw new Error(`no editor-open snapshot in "${prefix}"`);
}

/** The live-probe snapshot payloads, by step label. */
export function loadProbe(): Map<string, number[]> {
  return new Map(
    readFileSync(join(fixturesDir, 'probe-l6-snapshot-diff.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { label: string; payload: string })
      .map((r) => [r.label, bytes(r.payload)]),
  );
}
