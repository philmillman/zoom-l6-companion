import { describe, it, expect } from 'vitest';
import { snapshotKey, diffSnapshots, type ParamSnapshot } from '../snapshot';

function makeSnapshot(overrides: Partial<ParamSnapshot> = {}): ParamSnapshot {
  return {
    id: 'snap',
    label: 'Snapshot',
    takenAt: 0,
    editorOpenPayload: null,
    params: {},
    ...overrides,
  };
}

describe('snapshotKey', () => {
  it('formats group:index', () => {
    expect(snapshotKey(0, 1)).toBe('0:1');
    expect(snapshotKey(2, 15)).toBe('2:15');
  });
});

describe('diffSnapshots — params', () => {
  it('detects changed, added and removed values', () => {
    const a = makeSnapshot({ params: { '0:1': [1, 0], '0:2': [5] } });
    const b = makeSnapshot({ params: { '0:1': [0, 0], '0:3': [9] } });

    const { params } = diffSnapshots(a, b);
    const byKey = Object.fromEntries(params.map((d) => [d.key, d]));

    expect(params).toHaveLength(3);
    expect(byKey['0:1']).toEqual({ key: '0:1', group: 0, index: 1, before: [1, 0], after: [0, 0] });
    expect(byKey['0:2']).toEqual({ key: '0:2', group: 0, index: 2, before: [5], after: null });
    expect(byKey['0:3']).toEqual({ key: '0:3', group: 0, index: 3, before: null, after: [9] });
  });

  it('reports nothing for unchanged values', () => {
    const a = makeSnapshot({ params: { '0:1': [1, 2] } });
    const b = makeSnapshot({ params: { '0:1': [1, 2] } });
    expect(diffSnapshots(a, b).params).toEqual([]);
  });

  it('sorts entries by group then index', () => {
    const a = makeSnapshot({ params: { '2:1': [1], '0:5': [1] } });
    const b = makeSnapshot({ params: { '2:1': [2], '0:5': [2] } });
    const { params } = diffSnapshots(a, b);
    expect(params.map((p) => p.key)).toEqual(['0:5', '2:1']);
  });
});

describe('diffSnapshots — editorOpenPayload', () => {
  it('diffs byte-by-byte, including length changes', () => {
    const a = makeSnapshot({ editorOpenPayload: [1, 2, 3] });
    const b = makeSnapshot({ editorOpenPayload: [1, 9, 3, 4] });
    const { payload } = diffSnapshots(a, b);
    expect(payload).toEqual([
      { offset: 1, before: 2, after: 9 },
      { offset: 3, before: null, after: 4 },
    ]);
  });

  it('treats a null payload as empty', () => {
    const a = makeSnapshot({ editorOpenPayload: null });
    const b = makeSnapshot({ editorOpenPayload: [7] });
    expect(diffSnapshots(a, b).payload).toEqual([{ offset: 0, before: null, after: 7 }]);
  });

  it('reports nothing when both payloads are null', () => {
    const a = makeSnapshot({ editorOpenPayload: null });
    const b = makeSnapshot({ editorOpenPayload: null });
    expect(diffSnapshots(a, b).payload).toEqual([]);
  });
});
