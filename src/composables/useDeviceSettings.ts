/**
 * Device state for the Zoom L6 / L6max editor protocol.
 *
 * Module-level singleton (same pattern as `midiService`) so components stay dumb and session
 * state survives `v-if`-mounted panels. Every parameter is addressed by its registry id
 * (`src/midi/sysex/zoomL6/params.ts`); nothing here ever throws into a component — failures land
 * in `status[id]` / `errors[id]` (or `lastError` for link-level problems).
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { midiService } from '../services/midiService';
import { editorSession } from '../services/editorSessionService';
import { decodeParamValue } from '../midi/sysex/zoomL6/codec';
import {
  listParams,
  findParamByAddress,
  zoomL6Params,
  zoomL6ParamList,
} from '../midi/sysex/zoomL6/params';
import type { ParamDef, ParamId, ZoomModel } from '../midi/sysex/zoomL6/params';
import type { ParsedZoomL6Message } from '../midi/sysex/zoomL6/parse';
import { SessionClosedError, type SessionInfo } from '../midi/sysex/zoomL6/editorSession';
import { decodeSnapshot } from '../midi/sysex/zoomL6/stateSnapshot';
import type { PadFileInfo, SnapshotLayoutId } from '../midi/sysex/zoomL6/stateSnapshot';
import type { MixerType } from '../config/midiConfig';

export type ParamStatus = 'idle' | 'reading' | 'writing' | 'ok' | 'error';

export type DeviceLinkState =
  | 'no-sysex'
  | 'no-editor-port'
  | 'closed'
  | 'opening'
  | 'open'
  | 'stale'
  | 'suspended'
  | 'error';

export interface SetOptions {
  /** Read the value back after writing. Defaults to true for unverified registry entries. */
  verifyAfterWrite?: boolean;
}

/**
 * What the mixer reported in its last state snapshot (the editor-open `2A` reply) plus the pad file
 * reads that follow it. Refreshed on every session open and by {@link refreshState}.
 */
export interface MixerState {
  /** Snapshot layout, chosen from the payload's layout byte (not from the app's mixer type). */
  layout: SnapshotLayoutId | null;
  /** The mixer's CC# table in snapshot order (see `config/ccMapping.ts`), or null if unknown. */
  ccMap: number[] | null;
  ccMapVerified: boolean;
  /** Per pad (index 0 = pad 1); empty until read, `null` for a pad whose read failed. */
  padFiles: Array<PadFileInfo | null>;
  /**
   * The verified snapshot values that were actually applied to `values` by the last read. Ids that
   * had a write in flight (or queued) were skipped and are absent, so this only ever holds what the
   * mixer reported — App adopts the shared settings (MIDI channel, pad notes) from here.
   */
  values: Partial<Record<ParamId, number>>;
  /** `Date.now()` of the last applied snapshot; null until one has been read. */
  readAt: number | null;
}

/** Leading + trailing throttle window for numeric (knob/slider) writes. */
const WRITE_THROTTLE_MS = 50;

/** A scene recall arrives as a Program Change; wait for it to settle before re-reading the mixer. */
const SCENE_REFRESH_DEBOUNCE_MS = 300;

/** Sound pads on both the L6 and the L6max. */
const PAD_COUNT = 4;

const LINK_ENABLED_KEY = 'zoom-l6-editor-link';
const SHOW_EXPERIMENTAL_KEY = 'zoom-l6-show-experimental';

const NUMERIC_ENCODINGS = new Set(['u7', 'u14le', 'u28le']);

function readPersistedBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function persistBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* storage unavailable (private mode) — the setting just does not persist */
  }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

// ── reactive stores (seeded so every registry id is a real key) ────────────────
const values = reactive<Record<string, number | undefined>>({});
const status = reactive<Record<string, ParamStatus>>({});
const errors = reactive<Record<string, string | null>>({});
/** Last value confirmed by the device, used to revert a rejected optimistic write. */
const deviceValues: Record<string, number | undefined> = {};

for (const p of zoomL6ParamList) {
  values[p.id] = undefined;
  status[p.id] = 'idle';
  errors[p.id] = null;
}

const linkEnabled = ref(readPersistedBool(LINK_ENABLED_KEY, true));
// The "Show experimental" UI toggle was removed once every captured setting was verified.
// Unverified registry entries now simply stay hidden. Clear any previously persisted opt-in so
// nobody is left with it stuck on and no control to turn it off.
const showExperimental = ref(false);
try {
  localStorage.removeItem(SHOW_EXPERIMENTAL_KEY);
} catch {
  /* storage unavailable — nothing persisted to clear */
}
const mixerType = ref<MixerType>('l6');
const suspended = ref(false);
const linkError = ref<string | null>(null);
const applyingRemote = ref(false);
const mixerState = reactive<MixerState>({
  layout: null,
  ccMap: null,
  ccMapVerified: false,
  padFiles: [],
  values: {},
  readAt: null,
});

let refCount = 0;
let openInFlight: Promise<boolean> | null = null;
let remoteDepth = 0;
/** Bumped per snapshot (and on reset) so a slow pad-file read can't overwrite a newer one. */
let mixerStateSeq = 0;
/** Pad-file read started by the latest snapshot; `refreshState` awaits it. */
let mixerStateLoad: Promise<void> = Promise.resolve();
let sceneRefreshTimer: ReturnType<typeof setTimeout> | undefined;
/** `openedAt` of the session whose pad files were last read (pad files are read once per open). */
let padFilesOpenedAt: number | null = null;

const editorPortsReady = computed(() => midiService.editorPortsAvailable.value);
const sysexReady = computed(() => midiService.sysexEnabled.value);

const link = computed<DeviceLinkState>(() => {
  if (!sysexReady.value) return 'no-sysex';
  if (!editorPortsReady.value) return 'no-editor-port';
  if (suspended.value) return 'suspended';
  return editorSession.state.value;
});

const firmware = computed<string | null>(() => editorSession.info.value?.identity.firmware ?? null);

const lastError = computed<string | null>(() => linkError.value ?? editorSession.lastError.value);

const heartbeatMisses = computed<number>(() => editorSession.heartbeatMisses.value);

function linkUnavailableMessage(): string {
  switch (link.value) {
    case 'no-sysex':
      return 'System Exclusive is not enabled. Reload the app and allow SysEx when prompted.';
    case 'no-editor-port':
      return 'No Zoom “Editor” MIDI port found. Connect the mixer over USB.';
    case 'suspended':
      return 'The editor link is suspended (USB file transfer). Reconnect the device to resume.';
    default:
      return linkEnabled.value
        ? (lastError.value ?? 'The editor link is not open.')
        : 'Editor link (SysEx) is turned off.';
  }
}

// ── remote-update guard ───────────────────────────────────────────────────────
function withRemote(fn: () => void): void {
  remoteDepth += 1;
  applyingRemote.value = true;
  try {
    fn();
  } finally {
    void nextTick(() => {
      remoteDepth -= 1;
      if (remoteDepth <= 0) {
        remoteDepth = 0;
        applyingRemote.value = false;
      }
    });
  }
}

// ── registry helpers ──────────────────────────────────────────────────────────
function entry(id: ParamId): ParamDef | undefined {
  return zoomL6Params[id] as ParamDef | undefined;
}

function isAvailable(id: ParamId): boolean {
  const def = entry(id);
  if (!def) return false;
  if (!def.models.includes(mixerType.value as ZoomModel)) return false;
  return def.verified || showExperimental.value;
}

function isWritable(id: ParamId): boolean {
  const def = entry(id);
  if (!def || def.readOnly) return false;
  return isAvailable(id) && link.value === 'open';
}

/**
 * Session-command parameters (`31 <id> …`) are write-only: their read encoding is not decoded, so
 * `getValue` would throw. `refresh`/`refreshAll` skip them and leave their status `idle`.
 */
function isReadable(id: ParamId): boolean {
  const def = entry(id);
  return def != null && def.address.scheme !== 'session';
}

// ── session lifecycle ─────────────────────────────────────────────────────────
function canOpen(): boolean {
  return linkEnabled.value && !suspended.value && sysexReady.value && editorPortsReady.value;
}

async function ensureOpen(): Promise<boolean> {
  if (!canOpen()) return false;
  if (editorSession.state.value === 'open') return true;
  const existing = openInFlight;
  if (existing) return existing;

  const attempt: Promise<boolean> = editorSession
    .open()
    .then(() => {
      linkError.value = null;
      return true;
    })
    .catch((e: unknown) => {
      linkError.value = errorText(e);
      return false;
    })
    .finally(() => {
      if (openInFlight === attempt) openInFlight = null;
    });
  openInFlight = attempt;
  return attempt;
}

function close(): void {
  openInFlight = null;
  try {
    editorSession.close();
  } catch (e) {
    linkError.value = errorText(e);
  }
}

function clearValues(): void {
  withRemote(() => {
    for (const p of zoomL6ParamList) {
      values[p.id] = undefined;
      status[p.id] = 'idle';
      errors[p.id] = null;
      deviceValues[p.id] = undefined;
    }
  });
  mixerStateSeq += 1;
  mixerState.layout = null;
  mixerState.ccMap = null;
  mixerState.ccMapVerified = false;
  mixerState.padFiles = [];
  mixerState.values = {};
  mixerState.readAt = null;
  padFilesOpenedAt = null;
}

/** Ref-counted session ownership. Returns the matching `release` for onMounted/onUnmounted. */
function acquire(): () => void {
  refCount += 1;
  if (refCount === 1) void ensureOpen();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

function release(): void {
  if (refCount === 0) return;
  refCount -= 1;
  if (refCount === 0) close();
}

async function suspend(): Promise<void> {
  suspended.value = true;
  close();
  // Let the session's heartbeat timer unwind before the caller starts its own handshake.
  await nextTick();
}

async function resume(): Promise<void> {
  if (!suspended.value) return;
  suspended.value = false;
  if (refCount > 0) await ensureOpen();
}

// ── reads ─────────────────────────────────────────────────────────────────────
async function readOne(id: ParamId): Promise<void> {
  status[id] = 'reading';
  try {
    const value = await editorSession.getValue(id);
    deviceValues[id] = value;
    withRemote(() => {
      values[id] = value;
    });
    status[id] = 'ok';
    errors[id] = null;
  } catch (e) {
    status[id] = 'error';
    errors[id] = errorText(e);
  }
}

async function refresh(ids: ParamId[]): Promise<void> {
  const targets = ids.filter((id) => isAvailable(id) && isReadable(id));
  if (targets.length === 0) return;
  if (!(await ensureOpen())) {
    const message = linkUnavailableMessage();
    for (const id of targets) {
      status[id] = 'error';
      errors[id] = message;
    }
    return;
  }
  for (const id of targets) {
    // Sequential: the session allows one request in flight at a time.
    await readOne(id);
  }
}

function refreshableIds(): ParamId[] {
  return listParams({ model: mixerType.value as ZoomModel })
    .filter((p) => !p.readOnly && isAvailable(p.id) && isReadable(p.id))
    .map((p) => p.id);
}

async function refreshAll(): Promise<void> {
  await refresh(refreshableIds());
}

// ── writes ────────────────────────────────────────────────────────────────────
interface PendingWrite {
  lastRun: number;
  timer?: ReturnType<typeof setTimeout>;
  value?: number;
  verify?: boolean;
}

const pending = new Map<string, PendingWrite>();

function shouldVerify(def: ParamDef, opts?: SetOptions): boolean {
  return opts?.verifyAfterWrite ?? !def.verified;
}

function set(id: ParamId, value: number, opts?: SetOptions): void {
  const def = entry(id);
  if (!def) return;
  if (def.readOnly) {
    status[id] = 'error';
    errors[id] = `${def.label} is read-only.`;
    return;
  }
  if (!isAvailable(id)) {
    status[id] = 'error';
    errors[id] = `${def.label} is not available on this mixer.`;
    return;
  }

  // Optimistic local update — reverted by `flush` if the device rejects the write.
  values[id] = value;
  errors[id] = null;

  const verify = shouldVerify(def, opts);
  if (NUMERIC_ENCODINGS.has(def.encoding.kind)) {
    throttleWrite(id, value, verify);
  } else {
    void flush(id, value, verify);
  }
}

function throttleWrite(id: ParamId, value: number, verify: boolean): void {
  const slot = pending.get(id) ?? { lastRun: 0 };
  pending.set(id, slot);

  const now = Date.now();
  const elapsed = now - slot.lastRun;

  if (slot.timer === undefined && elapsed >= WRITE_THROTTLE_MS) {
    // Leading edge.
    slot.lastRun = now;
    slot.value = undefined;
    void flush(id, value, verify);
    return;
  }

  // Trailing edge: remember the newest value and schedule one write.
  slot.value = value;
  slot.verify = verify;
  if (slot.timer === undefined) {
    slot.timer = setTimeout(() => {
      slot.timer = undefined;
      slot.lastRun = Date.now();
      const queued = slot.value;
      const queuedVerify = slot.verify ?? verify;
      slot.value = undefined;
      if (queued !== undefined) void flush(id, queued, queuedVerify);
    }, Math.max(0, WRITE_THROTTLE_MS - elapsed));
  }
}

async function flush(id: ParamId, value: number, verify: boolean): Promise<void> {
  const def = entry(id);
  if (!def) return;
  status[id] = 'writing';
  try {
    if (!(await ensureOpen())) throw new Error(linkUnavailableMessage());
    await editorSession.setValue(id, value, { force: showExperimental.value });

    if (verify) {
      const actual = await editorSession.getValue(id);
      deviceValues[id] = actual;
      withRemote(() => {
        values[id] = actual;
      });
    } else {
      deviceValues[id] = value;
    }
    status[id] = 'ok';
    errors[id] = null;
  } catch (e) {
    const previous = deviceValues[id];
    withRemote(() => {
      values[id] = previous;
    });
    status[id] = 'error';
    errors[id] = errorText(e);
  }
}

/**
 * Awaitable, unthrottled write. Use when the caller must know the write finished before it
 * releases the editor link — e.g. reverting pad notes on Cancel. Any pending throttled write for
 * the same id is dropped first so a stale trailing value can't land afterwards.
 */
async function setNow(id: ParamId, value: number, opts?: SetOptions): Promise<void> {
  const def = entry(id);
  if (!def) return;
  if (def.readOnly || !isAvailable(id)) {
    // Reuse set()'s error reporting for the not-writable cases.
    set(id, value, opts);
    return;
  }
  const slot = pending.get(id);
  if (slot?.timer !== undefined) {
    clearTimeout(slot.timer);
    slot.timer = undefined;
    slot.value = undefined;
  }
  values[id] = value;
  errors[id] = null;
  await flush(id, value, shouldVerify(def, opts));
}

// ── unsolicited device pushes / replies ───────────────────────────────────────
editorSession.onMessage((m: ParsedZoomL6Message) => {
  if (m.kind !== 'paramValue') return;
  const def = findParamByAddress({ scheme: 'param', group: m.group, index: m.index });
  if (!def) return;
  let decoded: number;
  try {
    decoded = decodeParamValue(def, m.values);
  } catch {
    // Width mismatch: the registry address/encoding is a placeholder or wrong — ignore.
    return;
  }
  deviceValues[def.id] = decoded;
  // Do not fight an in-flight optimistic write (drag in progress).
  if (status[def.id] === 'writing') return;
  withRemote(() => {
    values[def.id] = decoded;
  });
  status[def.id] = 'ok';
  errors[def.id] = null;
});

// ── mixer state snapshot (editor-open `2A` reply) ─────────────────────────────
/** True while a write for `id` is in flight or queued behind the throttle. */
function hasLocalWrite(id: string): boolean {
  return status[id] === 'writing' || pending.get(id)?.timer !== undefined;
}

/**
 * Applies a snapshot to `values`/`deviceValues` (verified slots only) and records the layout and CC
 * map. Ids with a local write in flight keep the user's value: the write is about to change the
 * mixer anyway, and its result is what the UI should show.
 */
function applySnapshot(payload: readonly number[]): void {
  const decoded = decodeSnapshot(payload);
  const applied: Partial<Record<ParamId, number>> = {};
  withRemote(() => {
    for (const [id, value] of Object.entries(decoded.values) as [ParamId, number][]) {
      if (!entry(id) || hasLocalWrite(id)) continue;
      values[id] = value;
      deviceValues[id] = value;
      status[id] = 'ok';
      errors[id] = null;
      applied[id] = value;
    }
  });
  mixerState.layout = decoded.layout;
  mixerState.ccMap = decoded.ccMap;
  mixerState.ccMapVerified = decoded.ccMapVerified;
  mixerState.values = applied;
  // Strictly increasing so watchers fire even for two reads within the same millisecond.
  mixerState.readAt = Math.max(Date.now(), (mixerState.readAt ?? 0) + 1);
}

async function loadPadFiles(seq: number): Promise<void> {
  // Let `open()` finish (state → 'open', heartbeat started) before queueing the reads.
  await Promise.resolve();
  if (seq !== mixerStateSeq) return;
  try {
    const files = await editorSession.readPadFiles(PAD_COUNT);
    if (seq === mixerStateSeq) mixerState.padFiles = files;
  } catch (e) {
    // Closing the link mid-read is routine; anything else only costs the file names.
    if (!(e instanceof SessionClosedError)) console.warn('Could not read sound pad files:', e);
  }
}

// `sync` so `mixerStateLoad` is already set when `editorSession.refreshState()` resolves.
watch(
  editorSession.info,
  (info: SessionInfo | null) => {
    if (!info) return;
    mixerStateSeq += 1;
    applySnapshot(info.editorState.payload);
    // Pad file assignments are global (not part of scenes), so read them once per session open
    // rather than on every refresh (scene recall, Device Settings opened, explorer re-read).
    if (info.openedAt !== padFilesOpenedAt) {
      padFilesOpenedAt = info.openedAt;
      mixerStateLoad = loadPadFiles(mixerStateSeq);
    } else {
      mixerStateLoad = Promise.resolve();
    }
  },
  { flush: 'sync' },
);

/**
 * Re-reads the mixer's state snapshot and pad files. No-op unless the link is open; never throws
 * (a failure lands in `lastError`). Values are applied by the `editorSession.info` watcher above.
 */
async function refreshState(): Promise<void> {
  if (link.value !== 'open') return;
  try {
    await editorSession.refreshState();
    linkError.value = null;
    await mixerStateLoad;
  } catch (e) {
    if (e instanceof SessionClosedError) return;
    linkError.value = errorText(e);
  }
}

/** Scene recall on the hardware (Program Change in): re-read once things settle. */
function onProgramChange(): void {
  if (sceneRefreshTimer !== undefined) clearTimeout(sceneRefreshTimer);
  sceneRefreshTimer = setTimeout(() => {
    sceneRefreshTimer = undefined;
    void refreshState();
  }, SCENE_REFRESH_DEBOUNCE_MS);
}

/**
 * `addProgramChangeListener` needs a connected input and `removeAllListeners` (port change,
 * hot-plug) drops it, so this runs on every (re)connection. Re-adding is a no-op while it's held.
 */
function registerProgramChangeListener(): void {
  if (!midiService.midiInputConnected.value) return;
  midiService.addProgramChangeListener(onProgramChange);
}

// ── watches ───────────────────────────────────────────────────────────────────
watch(linkEnabled, (enabled) => {
  persistBool(LINK_ENABLED_KEY, enabled);
  if (!enabled) {
    close();
  } else if (refCount > 0) {
    void ensureOpen();
  }
});

watch(midiService.connectionState, (connected) => {
  if (!connected) {
    if (sceneRefreshTimer !== undefined) clearTimeout(sceneRefreshTimer);
    sceneRefreshTimer = undefined;
    close();
    clearValues();
    return;
  }
  registerProgramChangeListener();
  // A disconnect/reconnect cycle (e.g. USB mass storage) clears a suspension.
  suspended.value = false;
  if (refCount > 0 && linkEnabled.value) {
    void (async () => {
      if (await ensureOpen()) await refreshAll();
    })();
  }
});

// An input swap or hot-plug can `removeAllListeners` while `connectionState` stays true; `sync` so
// the drop-and-reconnect inside one call (false → true) is still seen.
watch(
  midiService.midiInputConnected,
  (inputConnected) => {
    if (inputConnected) registerProgramChangeListener();
  },
  { flush: 'sync' },
);

watch([sysexReady, editorPortsReady], ([sysex, ports]) => {
  if (sysex && ports && refCount > 0 && linkEnabled.value && !suspended.value) {
    void ensureOpen();
  }
});

export interface DeviceSettingsApi {
  values: Record<string, number | undefined>;
  status: Record<string, ParamStatus>;
  errors: Record<string, string | null>;
  link: ComputedRef<DeviceLinkState>;
  linkEnabled: Ref<boolean>;
  showExperimental: Ref<boolean>;
  mixerType: Ref<MixerType>;
  firmware: ComputedRef<string | null>;
  lastError: ComputedRef<string | null>;
  heartbeatMisses: ComputedRef<number>;
  applyingRemote: Ref<boolean>;
  /** The mixer's last reported state (snapshot + pad files); see {@link MixerState}. */
  mixerState: MixerState;
  entry: (id: ParamId) => ParamDef | undefined;
  isAvailable: (id: ParamId) => boolean;
  isWritable: (id: ParamId) => boolean;
  acquire: () => () => void;
  release: () => void;
  refresh: (ids: ParamId[]) => Promise<void>;
  refreshAll: () => Promise<void>;
  /** Re-reads the mixer's state snapshot and pad files (no-op unless the link is open; never throws). */
  refreshState: () => Promise<void>;
  /**
   * Call after the app itself recalls a scene (sends a Program Change): the mixer doesn't echo it,
   * so this schedules the same debounced re-read an inbound Program Change triggers.
   */
  sceneChanged: () => void;
  set: (id: ParamId, value: number, opts?: SetOptions) => void;
  setNow: (id: ParamId, value: number, opts?: SetOptions) => Promise<void>;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  close: () => void;
}

const api: DeviceSettingsApi = {
  values,
  status,
  errors,
  link,
  linkEnabled,
  showExperimental,
  mixerType,
  firmware,
  lastError,
  heartbeatMisses,
  applyingRemote,
  mixerState,
  entry,
  isAvailable,
  isWritable,
  acquire,
  release,
  refresh,
  refreshAll,
  refreshState,
  sceneChanged: onProgramChange,
  set,
  setNow,
  suspend,
  resume,
  close,
};

/** The singleton device-settings store. */
export function useDeviceSettings(): DeviceSettingsApi {
  return api;
}

/**
 * Component helper: holds the editor session open for the lifetime of the component.
 * Returns the same singleton as `useDeviceSettings()`.
 */
export function useDeviceLink(): DeviceSettingsApi {
  let releaseLink: (() => void) | null = null;
  onMounted(() => {
    releaseLink = acquire();
  });
  onUnmounted(() => {
    releaseLink?.();
    releaseLink = null;
  });
  return api;
}
