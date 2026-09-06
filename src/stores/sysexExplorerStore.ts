/**
 * SysEx explorer state (Debug drawer, "SysEx" tab).
 *
 * A `reactive()` module singleton — the Debug drawer is `v-if`-mounted (see `App.vue`), so a
 * sweep in progress, snapshots, notes, etc. must live outside the component to survive the
 * drawer being closed and reopened.
 *
 * Everything here talks to the shared editor session (`src/services/editorSessionService.ts`)
 * rather than opening its own; the explorer's Open/Close controls call
 * `useDeviceSettings().acquire()` / the returned release function.
 */
import { reactive } from 'vue';
import { editorSession } from '../services/editorSessionService';
import {
  bytesToHex,
  hexToBytes,
  describeZoomL6,
  findParamByAddress,
  PLACEHOLDER_GROUP,
  snapshotKey,
  diffSnapshots,
} from '../midi/sysex';
import type { ParamSnapshot, SnapshotDiff } from '../midi/sysex';

export interface SweepRow {
  group: number;
  index: number;
  values: number[] | null;
  status: 'ok' | 'timeout' | 'error';
  latencyMs: number;
  registryId?: string;
}

export interface MessageLogEntry {
  at: number;
  dir: 'in' | 'out';
  hex: string;
  description: string;
}

/** Hard cap on requests a sweep will ever send, regardless of confirmation. */
export const SWEEP_MAX_REQUESTS = 4096;
/** Sweeps larger than this need an explicit confirm (`runSweep(true)`). */
export const SWEEP_CONFIRM_THRESHOLD = 512;

const MAX_MESSAGE_LOG = 200;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class SweepTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SweepTimeoutError';
  }
}

/** Races `promise` against `timeoutMs` and `signal`; does not cancel `promise` itself (the
 * session has no per-request cancellation), it only stops *waiting* on it. */
function raceTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new SweepTimeoutError(`No reply within ${timeoutMs} ms`));
    }, timeoutMs);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Sweep aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Resolves after `ms`, or immediately if `signal` aborts first. Never rejects. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Not part of the reactive store: an `AbortController` should not be deep-proxied by Vue. */
let sweepAbortController: AbortController | null = null;

export const sysexExplorerStore = reactive({
  /** Raw hex textarea for the "send anything" panel; sent via `editorSession.sendRaw`. */
  rawHex: '',

  single: {
    group: 0,
    index: 0,
    result: null as number[] | null,
    error: null as string | null,
    busy: false,
  },

  sweep: {
    groupFrom: 0,
    groupTo: 2,
    indexFrom: 0,
    indexTo: 7,
    intervalMs: 40,
    timeoutMs: 400,
    running: false,
    progress: { done: 0, total: 0 },
    rows: [] as SweepRow[],
    error: null as string | null,
    /** Set when the requested range exceeds `SWEEP_CONFIRM_THRESHOLD`; call `runSweep(true)`. */
    needsConfirm: false,
  },

  setForm: {
    group: 0,
    index: 0,
    valuesHex: '',
    result: null as string | null,
  },

  snapshots: [] as ParamSnapshot[],
  diff: null as { aId: string; bId: string; result: SnapshotDiff } | null,
  notes: '',
  messageLog: [] as MessageLogEntry[],

  getSingle,
  runSweep,
  abortSweep,
  setParam,
  takeSnapshot,
  runDiff,
  exportJson,
  importJson,
  registryEntryFor,
});

// ── single get ────────────────────────────────────────────────────────────────
async function getSingle(): Promise<void> {
  const s = sysexExplorerStore.single;
  s.group = clamp(s.group, 0, PLACEHOLDER_GROUP - 1);
  s.index = clamp(s.index, 0, 127);
  s.error = null;
  s.busy = true;
  try {
    if (editorSession.state.value !== 'open') {
      throw new Error('Editor session is not open.');
    }
    s.result = await editorSession.getParam(s.group, s.index);
  } catch (e) {
    s.result = null;
    s.error = errorText(e);
  } finally {
    s.busy = false;
  }
}

// ── sweep ─────────────────────────────────────────────────────────────────────
async function sweepOne(group: number, index: number, timeoutMs: number, signal: AbortSignal): Promise<SweepRow> {
  const startedAt = Date.now();
  let status: SweepRow['status'] = 'ok';
  let values: number[] | null = null;
  try {
    // Pass the sweep timeout down to the session so its own request timer fires at the same
    // moment and frees the single in-flight slot; otherwise a dead address would keep blocking
    // the next GET until the session's longer default timeout, silently slowing the sweep.
    values = await raceTimeout(editorSession.getParam(group, index, timeoutMs), timeoutMs, signal);
  } catch (e) {
    status = e instanceof SweepTimeoutError ? 'timeout' : 'error';
  }
  const latencyMs = Date.now() - startedAt;
  const registryId = findParamByAddress({ scheme: 'param', group, index })?.id;
  return { group, index, values, status, latencyMs, registryId };
}

/**
 * Sweeps `[groupFrom..groupTo] x [indexFrom..indexTo]` with GET-only requests, sequential (the
 * session allows one request in flight at a time anyway), paced by `intervalMs` and abortable via
 * `abortSweep()`. Ranges are clamped to valid addresses; a range over `SWEEP_CONFIRM_THRESHOLD`
 * requests sets `sweep.needsConfirm` and does nothing until called again with `confirmed: true`; a
 * range over `SWEEP_MAX_REQUESTS` is rejected outright via `sweep.error`.
 */
async function runSweep(confirmed = false): Promise<void> {
  const s = sysexExplorerStore.sweep;
  s.error = null;

  s.groupFrom = clamp(s.groupFrom, 0, PLACEHOLDER_GROUP - 1);
  s.groupTo = clamp(s.groupTo, 0, PLACEHOLDER_GROUP - 1);
  s.indexFrom = clamp(s.indexFrom, 0, 127);
  s.indexTo = clamp(s.indexTo, 0, 127);
  s.intervalMs = Math.max(0, Math.round(s.intervalMs));
  s.timeoutMs = Math.max(1, Math.round(s.timeoutMs));

  const groupLo = Math.min(s.groupFrom, s.groupTo);
  const groupHi = Math.max(s.groupFrom, s.groupTo);
  const indexLo = Math.min(s.indexFrom, s.indexTo);
  const indexHi = Math.max(s.indexFrom, s.indexTo);
  const total = (groupHi - groupLo + 1) * (indexHi - indexLo + 1);

  if (total > SWEEP_MAX_REQUESTS) {
    s.needsConfirm = false;
    s.error = `That range is ${total} requests; the sweep limit is ${SWEEP_MAX_REQUESTS}. Narrow the range.`;
    return;
  }
  if (total > SWEEP_CONFIRM_THRESHOLD && !confirmed) {
    s.needsConfirm = true;
    return;
  }
  s.needsConfirm = false;

  if (editorSession.state.value !== 'open') {
    s.error = 'Editor session is not open.';
    return;
  }

  const controller = new AbortController();
  sweepAbortController = controller;
  s.running = true;
  s.rows = [];
  s.progress = { done: 0, total };

  try {
    outer: for (let group = groupLo; group <= groupHi; group++) {
      for (let index = indexLo; index <= indexHi; index++) {
        if (controller.signal.aborted) break outer;
        const row = await sweepOne(group, index, s.timeoutMs, controller.signal);
        s.rows.push(row);
        s.progress.done += 1;
        if (controller.signal.aborted) break outer;
        await delay(s.intervalMs, controller.signal);
      }
    }
  } finally {
    s.running = false;
    if (sweepAbortController === controller) sweepAbortController = null;
  }
}

/** Stops an in-progress `runSweep()` after its current in-flight request settles. */
function abortSweep(): void {
  sweepAbortController?.abort();
}

// ── set ───────────────────────────────────────────────────────────────────────
/**
 * Sends `45 <group> <index> <valuesHex>`. `confirmed` must be `true` when the address is not in
 * the registry (the UI gates this behind an "I understand this address is not in the registry"
 * checkbox) — an unrecognized address could be anything, including something destructive.
 */
async function setParam(confirmed = false): Promise<void> {
  const s = sysexExplorerStore.setForm;
  s.group = clamp(s.group, 0, PLACEHOLDER_GROUP - 1);
  s.index = clamp(s.index, 0, 127);
  s.result = null;
  try {
    const known = findParamByAddress({ scheme: 'param', group: s.group, index: s.index });
    if (!known && !confirmed) {
      throw new Error('This address is not in the registry; confirm to send it anyway.');
    }
    if (editorSession.state.value !== 'open') {
      throw new Error('Editor session is not open.');
    }
    const values = hexToBytes(s.valuesHex);
    const ack = await editorSession.setParam(s.group, s.index, values);
    s.result = `Ack 0x${ack.toString(16).padStart(2, '0')}${known ? ` (${known.label})` : ''}`;
  } catch (e) {
    s.result = `Error: ${errorText(e)}`;
  }
}

// ── snapshots & diff ────────────────────────────────────────────────────────────
/** Snapshots the current sweep results (`group:index` -> value bytes) plus the editor-open state
 * blob from the live session, if any. */
function takeSnapshot(label: string): ParamSnapshot {
  const params: Record<string, number[]> = {};
  for (const row of sysexExplorerStore.sweep.rows) {
    if (row.values) params[snapshotKey(row.group, row.index)] = row.values;
  }
  const payload = editorSession.info.value?.editorState.payload;
  const snapshot: ParamSnapshot = {
    id: newId(),
    label: label.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
    takenAt: Date.now(),
    editorOpenPayload: payload ? [...payload] : null,
    params,
  };
  sysexExplorerStore.snapshots.push(snapshot);
  return snapshot;
}

function runDiff(aId: string, bId: string): void {
  const a = sysexExplorerStore.snapshots.find((snap) => snap.id === aId);
  const b = sysexExplorerStore.snapshots.find((snap) => snap.id === bId);
  if (!a || !b) {
    sysexExplorerStore.diff = null;
    return;
  }
  sysexExplorerStore.diff = { aId, bId, result: diffSnapshots(a, b) };
}

// ── export / import ─────────────────────────────────────────────────────────────
interface SysexExplorerExport {
  version: 1;
  device: { firmware: string | null };
  snapshots: ParamSnapshot[];
  /** Raw sweep findings (address, values, width, latency) — the point of the export. */
  findings: SweepRow[];
  notes: string;
}

function exportJson(): string {
  const data: SysexExplorerExport = {
    version: 1,
    device: { firmware: editorSession.getFirmware() },
    snapshots: sysexExplorerStore.snapshots,
    findings: sysexExplorerStore.sweep.rows,
    notes: sysexExplorerStore.notes,
  };
  return JSON.stringify(data, null, 2);
}

/** Replaces snapshots/findings/notes from a previously exported JSON blob. Throws on anything
 * that is not `{ version: 1, ... }` so the caller can surface the error. */
function importJson(text: string): void {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1) {
    throw new Error('Unsupported export format (expected "version": 1).');
  }
  const parsed = data as Partial<SysexExplorerExport>;
  if (Array.isArray(parsed.snapshots)) {
    sysexExplorerStore.snapshots.splice(0, sysexExplorerStore.snapshots.length, ...parsed.snapshots);
  }
  if (Array.isArray(parsed.findings)) {
    sysexExplorerStore.sweep.rows.splice(0, sysexExplorerStore.sweep.rows.length, ...parsed.findings);
  }
  if (typeof parsed.notes === 'string') {
    sysexExplorerStore.notes = parsed.notes;
  }
}

// ── registry entry scaffolding ───────────────────────────────────────────────────
/** Guesses a `ParamDef` literal from a sweep row's byte width, for pasting into `params.ts` once
 * the id/label/range are known from a capture. Always `verified: false`. */
function registryEntryFor(row: SweepRow): string {
  const width = row.values?.length ?? 0;
  const encoding =
    width === 1
      ? "{ kind: 'u7' }"
      : width === 2
        ? "{ kind: 'u14le' }"
        : width === 4
          ? "{ kind: 'u28le' }"
          : `{ kind: 'ascii', length: ${width} }`;
  const max = width === 1 ? 127 : width === 2 ? 16383 : width === 4 ? 268435455 : 0;
  const today = new Date().toISOString().slice(0, 10);
  return [
    '{',
    `  id: 'TODO',`,
    `  label: 'TODO',`,
    `  category: 'system',`,
    `  address: { scheme: 'param', group: ${row.group}, index: ${row.index} },`,
    `  encoding: ${encoding},`,
    `  range: { min: 0, max: ${max} },`,
    `  models: ['l6'],`,
    `  verified: false,`,
    `  evidence: 'explorer sweep ${today}',`,
    '}',
  ].join('\n');
}

// ── inbound message log ──────────────────────────────────────────────────────────
// Outbound SysEx already appears in the Debug drawer's MIDI tab (`midiService.sendSysexRaw` is
// monkey-patched there); this only needs to add the inbound half. Heartbeats/acks are filtered
// out — at ~10/s they would push everything else out of the 200-entry cap within seconds, and
// heartbeat health is already visible via `editorSession.heartbeatMisses` / `lastAckAt`.
editorSession.onMessage((m) => {
  if (m.kind === 'heartbeat' || m.kind === 'heartbeatAck') return;
  sysexExplorerStore.messageLog.unshift({
    at: Date.now(),
    dir: 'in',
    hex: bytesToHex(m.raw),
    description: describeZoomL6(m),
  });
  if (sysexExplorerStore.messageLog.length > MAX_MESSAGE_LOG) {
    sysexExplorerStore.messageLog.length = MAX_MESSAGE_LOG;
  }
});
