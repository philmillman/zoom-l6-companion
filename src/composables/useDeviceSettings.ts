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

/** Leading + trailing throttle window for numeric (knob/slider) writes. */
const WRITE_THROTTLE_MS = 50;

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

let refCount = 0;
let openInFlight: Promise<boolean> | null = null;
let remoteDepth = 0;

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
    close();
    clearValues();
    return;
  }
  // A disconnect/reconnect cycle (e.g. USB mass storage) clears a suspension.
  suspended.value = false;
  if (refCount > 0 && linkEnabled.value) {
    void (async () => {
      if (await ensureOpen()) await refreshAll();
    })();
  }
});

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
  entry: (id: ParamId) => ParamDef | undefined;
  isAvailable: (id: ParamId) => boolean;
  isWritable: (id: ParamId) => boolean;
  acquire: () => () => void;
  release: () => void;
  refresh: (ids: ParamId[]) => Promise<void>;
  refreshAll: () => Promise<void>;
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
  entry,
  isAvailable,
  isWritable,
  acquire,
  release,
  refresh,
  refreshAll,
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
