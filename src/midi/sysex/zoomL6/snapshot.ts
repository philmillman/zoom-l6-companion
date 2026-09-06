/**
 * Pure snapshot/diff helpers for the SysEx explorer's "Snapshot & Diff" feature. A snapshot
 * captures a set of parameter values (keyed `"group:index"`) plus the editor-open state blob at
 * a point in time, so two snapshots can be diffed to find what changed on the device.
 */

export interface ParamSnapshot {
  id: string;
  label: string;
  takenAt: number;
  editorOpenPayload: number[] | null;
  /** Keyed `"group:index"` (see `snapshotKey`). */
  params: Record<string, number[]>;
}

/** Builds the `"group:index"` key used by `ParamSnapshot.params`. */
export function snapshotKey(group: number, index: number): string {
  return `${group}:${index}`;
}

export interface ParamDiffEntry {
  key: string;
  group: number;
  index: number;
  before: number[] | null;
  after: number[] | null;
}

export interface PayloadDiffEntry {
  offset: number;
  before: number | null;
  after: number | null;
}

export interface SnapshotDiff {
  params: ParamDiffEntry[];
  payload: PayloadDiffEntry[];
}

function bytesEqual(a: number[] | null, b: number[] | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function parseKey(key: string): { group: number; index: number } {
  const [group, index] = key.split(':').map((n) => Number(n));
  return { group: group ?? -1, index: index ?? -1 };
}

/**
 * Diffs two snapshots: `params` lists every `group:index` whose byte array changed (added,
 * removed or different), and `payload` diffs `editorOpenPayload` byte-by-byte.
 */
export function diffSnapshots(a: ParamSnapshot, b: ParamSnapshot): SnapshotDiff {
  const keys = new Set<string>([...Object.keys(a.params), ...Object.keys(b.params)]);
  const params: ParamDiffEntry[] = [];
  for (const key of keys) {
    const before = a.params[key] ?? null;
    const after = b.params[key] ?? null;
    if (!bytesEqual(before, after)) {
      const { group, index } = parseKey(key);
      params.push({ key, group, index, before, after });
    }
  }
  params.sort((x, y) => (x.group - y.group) || (x.index - y.index));

  const payload: PayloadDiffEntry[] = [];
  const pa = a.editorOpenPayload ?? [];
  const pb = b.editorOpenPayload ?? [];
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i++) {
    const before = i < pa.length ? pa[i]! : null;
    const after = i < pb.length ? pb[i]! : null;
    if (before !== after) payload.push({ offset: i, before, after });
  }

  return { params, payload };
}
