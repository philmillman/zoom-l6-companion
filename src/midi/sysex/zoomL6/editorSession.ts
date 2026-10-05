/**
 * Zoom L6 / L6max **editor session**: the stateful half of the reverse-engineered editor protocol.
 *
 * Protocol facts this implements (Magicking/L6-MassStorage README + captures, see docs/PROTOCOL.md):
 *
 * - The session starts with a Universal Identity Request (`F0 7E 00 06 01 F7`). The device answers
 *   with `F0 7E 00 06 02 52 …` — manufacturer `0x52` (Zoom) followed by the firmware string.
 * - Then `F0 52 00 00 2B F7` ("editor open"); the device replies `F0 52 00 00 2A 03 <state blob>`,
 *   which carries the capability/state dump.
 * - While the session is open the official editor sends a heartbeat `F0 52 00 00 31 0B F7` about
 *   every 100 ms and the device acks with `F0 52 00 00 00 0B F7`. If heartbeats stop the device
 *   eventually stops answering editor commands, so we track missed acks and go `stale`.
 * - Parameter access is request/response with **no correlation id**: `46 <group> <index>` is
 *   answered by `45 <group> <index> <values…>`, and a write `45 <group> <index> <values…>` by
 *   `00 <code>`. Correlation therefore relies on keeping exactly one request in flight; heartbeats
 *   and their acks are filtered out so they never satisfy a pending matcher.
 * - **No session-close opcode is known.** `close()` simply stops the heartbeat and drops the
 *   listener; the device times the session out on its own. (Capture scenario 16 in the plan is
 *   meant to find out whether the official editor sends something on quit.)
 *
 * The transport is injected so this file is pure and unit-testable with fake timers; the wiring to
 * WebMIDI lives in `src/services/editorSessionService.ts`.
 */
import { ref, shallowRef, type Ref } from 'vue';
import {
  SessionCmdId,
  buildGetParam,
  buildSessionCmd,
  buildSetParam,
  zoomL6Sysex,
} from './messages';
import {
  parseZoomL6,
  type ParsedZoomL6Message,
  type ZoomL6Message,
  type ZoomL6MessageKind,
} from './parse';
import { getParam as getParamDef, type ParamDef, type ParamId } from './params';
import { decodeParamValue, encodeParamValue } from './codec';
import { bytesToHex } from './hex';
import { decodePadAssigned, decodePadFileName, type PadFileInfo } from './stateSnapshot';

/** Minimal transport contract: send raw SysEx, subscribe to inbound SysEx. */
export interface SysexTransport {
  send(bytes: readonly number[]): void;
  /** Returns an unsubscribe function. */
  subscribe(cb: (bytes: readonly number[]) => void): () => void;
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

export interface EditorSessionOptions {
  /** Heartbeat cadence; the official editor uses ~100 ms. */
  heartbeatIntervalMs?: number;
  /** Default per-request timeout. */
  requestTimeoutMs?: number;
  /** Timeout for the identity reply during `open()`. */
  identityTimeoutMs?: number;
  /** Timeout for the `2A` editor-open state blob during `open()`. */
  editorOpenTimeoutMs?: number;
  /** Consecutive heartbeat intervals without an ack before the session is considered `stale`. */
  staleAfterMissedHeartbeats?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
}

export type SessionState = 'closed' | 'opening' | 'open' | 'stale' | 'error';

export interface SessionInfo {
  identity: Extract<ZoomL6Message, { kind: 'identityReply' }>;
  editorState: Extract<ZoomL6Message, { kind: 'editorOpenState' }>;
  openedAt: number;
}

/**
 * `Extract<ParsedZoomL6Message, {kind: K}>` does not narrow, because `ParsedZoomL6Message` is an
 * intersection (`union & {raw}`) and conditional types do not distribute over intersections.
 */
export type ParsedMessageOfKind<K extends ZoomL6MessageKind> = Extract<ZoomL6Message, { kind: K }> & {
  raw: number[];
};

export type MessageMatcher = (m: ParsedZoomL6Message) => boolean;

export class RequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export class SessionClosedError extends Error {
  constructor(message = 'Editor session is closed') {
    super(message);
    this.name = 'SessionClosedError';
  }
}

export class UnverifiedParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnverifiedParamError';
  }
}

/**
 * Thrown by {@link ZoomL6EditorSession.getValue} for a `session`-scheme parameter: those are written
 * with `31 <id> …` but the matching read encoding (`46 …`) is not yet decoded, so they are
 * write-only. Callers (e.g. `useDeviceSettings`) skip these instead of surfacing an error.
 */
export class SessionReadUnsupportedError extends Error {
  constructor(id: string) {
    super(`Parameter "${id}" uses a session command (write-only); it cannot be read back yet`);
    this.name = 'SessionReadUnsupportedError';
  }
}

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 100;
export const DEFAULT_REQUEST_TIMEOUT_MS = 1000;
export const DEFAULT_IDENTITY_TIMEOUT_MS = 2000;
export const DEFAULT_EDITOR_OPEN_TIMEOUT_MS = 2000;
export const DEFAULT_STALE_AFTER_MISSED_HEARTBEATS = 10;
/** The device drops USB as soon as it acks file-transfer ON, so we do not insist on the ack. */
export const FILE_TRANSFER_ACK_TIMEOUT_MS = 500;

/** Zoom's SysEx manufacturer id; an identity reply from anything else is not our device. */
const ZOOM_MANUFACTURER_ID = 0x52;

interface PendingRequest {
  bytes: readonly number[];
  match: MessageMatcher;
  timeoutMs: number;
  label: string;
  resolve: (m: ParsedZoomL6Message) => void;
  reject: (error: unknown) => void;
  timer: TimerHandle | null;
}

export class ZoomL6EditorSession {
  readonly state: Ref<SessionState> = ref<SessionState>('closed');
  /** `shallowRef`: the identity/state blob is inert data and must stay reference-identical. */
  readonly info: Ref<SessionInfo | null> = shallowRef<SessionInfo | null>(null);
  readonly lastError: Ref<string | null> = ref<string | null>(null);
  readonly heartbeatMisses: Ref<number> = ref(0);
  readonly lastAckAt: Ref<number | null> = ref<number | null>(null);

  private readonly transport: SysexTransport;
  private readonly heartbeatIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly identityTimeoutMs: number;
  private readonly editorOpenTimeoutMs: number;
  private readonly staleAfterMissedHeartbeats: number;
  private readonly now: () => number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => IntervalHandle;
  private readonly clearIntervalFn: (handle: IntervalHandle) => void;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;

  private unsubscribe: (() => void) | null = null;
  private queue: PendingRequest[] = [];
  private inFlight: PendingRequest | null = null;
  private heartbeatTimer: IntervalHandle | null = null;
  private awaitingHeartbeatAck = false;
  private openPromise: Promise<SessionInfo> | null = null;
  private refreshPromise: Promise<SessionInfo> | null = null;
  private messageListeners: Set<(m: ParsedZoomL6Message) => void> = new Set();

  constructor(transport: SysexTransport, opts: EditorSessionOptions = {}) {
    this.transport = transport;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.identityTimeoutMs = opts.identityTimeoutMs ?? DEFAULT_IDENTITY_TIMEOUT_MS;
    this.editorOpenTimeoutMs = opts.editorOpenTimeoutMs ?? DEFAULT_EDITOR_OPEN_TIMEOUT_MS;
    this.staleAfterMissedHeartbeats =
      opts.staleAfterMissedHeartbeats ?? DEFAULT_STALE_AFTER_MISSED_HEARTBEATS;
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((handle) => globalThis.clearInterval(handle));
    this.setTimeoutFn = opts.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle));
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Identity request → editor open → heartbeat interval. Idempotent while already open, and
   * concurrent callers share a single in-flight attempt.
   */
  open(opts: { signal?: AbortSignal } = {}): Promise<SessionInfo> {
    if (this.state.value === 'open' && this.info.value) {
      return Promise.resolve(this.info.value);
    }
    if (this.openPromise) return this.openPromise;
    const attempt = this.runOpen(opts.signal);
    this.openPromise = attempt;
    attempt.catch(() => undefined).then(() => {
      if (this.openPromise === attempt) this.openPromise = null;
    });
    return attempt;
  }

  private async runOpen(signal?: AbortSignal): Promise<SessionInfo> {
    this.ensureSubscribed();
    this.state.value = 'opening';
    this.lastError.value = null;
    try {
      throwIfAborted(signal);
      const identity = (await this.withAbort(
        this.enqueue(zoomL6Sysex.identityRequest, (m) => m.kind === 'identityReply', this.identityTimeoutMs, 'identity request'),
        signal,
      )) as ParsedMessageOfKind<'identityReply'>;
      if (identity.manufacturer !== ZOOM_MANUFACTURER_ID) {
        throw new Error(
          `Identity reply is not from a Zoom device (manufacturer 0x${identity.manufacturer
            .toString(16)
            .padStart(2, '0')}, expected 0x52)`,
        );
      }

      throwIfAborted(signal);
      const editorState = (await this.withAbort(
        this.enqueue(zoomL6Sysex.editorOpen, (m) => m.kind === 'editorOpenState', this.editorOpenTimeoutMs, 'editor open'),
        signal,
      )) as ParsedMessageOfKind<'editorOpenState'>;

      const info: SessionInfo = { identity, editorState, openedAt: this.now() };
      this.info.value = info;
      this.heartbeatMisses.value = 0;
      this.lastAckAt.value = null;
      this.state.value = 'open';
      this.startHeartbeat();
      return info;
    } catch (error) {
      if (error instanceof SessionClosedError) {
        // close() already reset the state; do not clobber it with 'error'.
        throw error;
      }
      this.state.value = signal?.aborted ? 'closed' : 'error';
      this.lastError.value = errorMessage(error);
      this.stopHeartbeat();
      throw error;
    }
  }

  /**
   * Re-reads the full settings snapshot mid-session, mirroring the official editor
   * (captures/maxE-usb-audio-mode): Universal Identity Request → `identityReply`, then editor open
   * `2B` → `2A` snapshot. The heartbeat keeps running throughout (its traffic never satisfies a
   * matcher), and both requests go through the normal one-in-flight queue.
   *
   * On success `info` is replaced with a **new object** (fresh identity + editorState, original
   * `openedAt`) so watchers fire. Rejects with {@link SessionClosedError} when the session isn't
   * open (or closes meanwhile) and with {@link RequestTimeoutError} if the mixer stays silent; a
   * failed refresh leaves `info` and the session untouched. A `stale` session is re-opened instead
   * (the handshake reads a fresh snapshot anyway). Concurrent callers share one attempt.
   */
  refreshState(): Promise<SessionInfo> {
    if (this.refreshPromise) return this.refreshPromise;
    const attempt = this.runRefresh();
    this.refreshPromise = attempt;
    attempt.catch(() => undefined).then(() => {
      if (this.refreshPromise === attempt) this.refreshPromise = null;
    });
    return attempt;
  }

  private async runRefresh(): Promise<SessionInfo> {
    if (this.state.value === 'opening' && this.openPromise) return this.openPromise;
    if (this.state.value === 'stale') return this.open();
    const previous = this.info.value;
    if (this.state.value !== 'open' || !previous) {
      throw new SessionClosedError(`Editor session is ${this.state.value}; call open() before refreshState()`);
    }
    const identity = await this.request<'identityReply'>(
      zoomL6Sysex.identityRequest,
      'identityReply',
      this.identityTimeoutMs,
    );
    if (identity.manufacturer !== ZOOM_MANUFACTURER_ID) {
      throw new Error(
        `Identity reply is not from a Zoom device (manufacturer 0x${identity.manufacturer
          .toString(16)
          .padStart(2, '0')}, expected 0x52)`,
      );
    }
    const editorState = await this.request<'editorOpenState'>(
      zoomL6Sysex.editorOpen,
      'editorOpenState',
      this.editorOpenTimeoutMs,
    );
    if (this.state.value !== 'open') throw new SessionClosedError();
    const info: SessionInfo = {
      identity,
      editorState,
      openedAt: this.info.value?.openedAt ?? previous.openedAt,
    };
    this.info.value = info;
    return info;
  }

  /**
   * Reads each sound pad's assigned file: `46 00 <pad>` (assigned flag) then `46 02 <pad>` (file
   * name), sequentially for pads `0 … padCount-1`. A pad whose reads fail (e.g. a timeout) comes
   * back as `null` so the other pads still show; a closed session aborts the whole read with
   * {@link SessionClosedError}.
   */
  async readPadFiles(padCount = 4): Promise<Array<PadFileInfo | null>> {
    const files: Array<PadFileInfo | null> = [];
    for (let pad = 0; pad < padCount; pad++) {
      try {
        const assigned = decodePadAssigned(await this.getParam(0x00, pad));
        const fileName = decodePadFileName(await this.getParam(0x02, pad));
        files.push({ assigned, fileName });
      } catch (error) {
        if (error instanceof SessionClosedError) throw error;
        files.push(null);
      }
    }
    return files;
  }

  /**
   * Stops the heartbeat, fails everything queued with {@link SessionClosedError} and unsubscribes
   * from the transport. No close opcode is known for this protocol, so nothing is sent.
   *
   * `onMessage` callbacks stay registered; delivery resumes on the next `open()`.
   */
  close(): void {
    this.stopHeartbeat();
    this.openPromise = null;
    this.refreshPromise = null;
    const pending = this.inFlight ? [this.inFlight, ...this.queue] : [...this.queue];
    this.inFlight = null;
    this.queue = [];
    const error = new SessionClosedError();
    for (const request of pending) {
      if (request.timer !== null) this.clearTimeoutFn(request.timer);
      request.reject(error);
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.info.value = null;
    this.heartbeatMisses.value = 0;
    this.state.value = 'closed';
  }

  /** Every inbound parsed message, including unsolicited device pushes. Returns an unsubscribe. */
  onMessage(cb: (m: ParsedZoomL6Message) => void): () => void {
    this.messageListeners.add(cb);
    this.ensureSubscribed();
    return () => {
      this.messageListeners.delete(cb);
    };
  }

  /** Fire-and-forget send (explorer "raw hex"); still goes through the transport so it is logged. */
  sendRaw(bytes: readonly number[]): void {
    this.transport.send(bytes);
  }

  // ── request/response ──────────────────────────────────────────────────────

  /**
   * Sends `bytes` and resolves with the first inbound message satisfying `expect`.
   *
   * Requests are FIFO with exactly one in flight, because the protocol has no correlation id.
   * Heartbeats and heartbeat acks are never handed to a matcher.
   */
  async request<K extends ZoomL6MessageKind>(
    bytes: readonly number[],
    expect: K | MessageMatcher,
    timeoutMs?: number,
  ): Promise<ParsedMessageOfKind<K>> {
    if (this.state.value === 'stale') {
      // Heartbeats fell behind (backgrounded tab, device asleep): re-run the handshake first.
      await this.open();
    } else if (this.state.value === 'closed' || this.state.value === 'error') {
      throw new SessionClosedError(
        `Editor session is ${this.state.value}; call open() before sending requests`,
      );
    }
    const match: MessageMatcher =
      typeof expect === 'function' ? expect : (m) => m.kind === expect;
    const label = typeof expect === 'function' ? 'matcher' : expect;
    const result = await this.enqueue(bytes, match, timeoutMs ?? this.requestTimeoutMs, label);
    return result as unknown as ParsedMessageOfKind<K>;
  }

  /** `46 <group> <index>` → the value bytes from the matching `45 <group> <index> …` reply. */
  async getParam(group: number, index: number, timeoutMs?: number): Promise<number[]> {
    const reply = await this.request<'paramValue'>(
      buildGetParam(group, index),
      (m) => m.kind === 'paramValue' && m.group === group && m.index === index,
      timeoutMs,
    );
    return reply.values;
  }

  /** `45 <group> <index> <values…>` → the ack code from `00 <code>`. */
  async setParam(group: number, index: number, values: readonly number[]): Promise<number> {
    const ack = await this.request(buildSetParam(group, index, values), 'genericAck');
    return ack.code;
  }

  // ── registry-driven access ────────────────────────────────────────────────

  /** Firmware string from the identity reply (`null` until the session has been opened). */
  getFirmware(): string | null {
    return this.info.value?.identity.firmware ?? null;
  }

  /**
   * Reads a registry parameter and decodes it.
   *
   * `identity`-scheme entries (currently only `firmwareVersion`) come from the identity reply and
   * are textual; this returns the numeric interpretation — use {@link getFirmware} for the string.
   */
  async getValue(id: ParamId): Promise<number> {
    const def = getParamDef(id);
    if (def.address.scheme === 'identity') {
      const info = this.info.value ?? (await this.open());
      const value = Number.parseFloat(info.identity.firmware);
      if (!Number.isFinite(value)) {
        throw new Error(`Parameter "${id}" is textual ("${info.identity.firmware}"); use getFirmware()`);
      }
      return value;
    }
    if (def.address.scheme === 'session') {
      throw new SessionReadUnsupportedError(id);
    }
    const bytes = await this.getParam(def.address.group, def.address.index);
    // `decodeParamValue` already undoes `def.deviceOffset`.
    return decodeParamValue(def, bytes);
  }

  /**
   * Writes a registry parameter.
   *
   * Refuses entries whose address is still a reverse-engineering placeholder (`verified: false`)
   * unless `force` is passed — the SysEx explorer is the only caller that should force.
   */
  async setValue(id: ParamId, value: number, opts: { force?: boolean } = {}): Promise<void> {
    const def = getParamDef(id);
    if (def.readOnly) {
      throw new Error(`Parameter "${id}" is read-only`);
    }
    if (!def.verified && !opts.force) {
      throw new UnverifiedParamError(
        `Parameter "${id}" has an unverified address; pass { force: true } to write it anyway`,
      );
    }
    if (def.address.scheme === 'identity') {
      throw new Error(`Parameter "${id}" is derived from the identity reply and cannot be written`);
    }
    // `encodeParamValue` clamps to `def.range` and applies `def.deviceOffset`.
    const values = encodeParamValue(def, value);
    if (def.address.scheme === 'session') {
      const { id: cmdId, prefix = [] } = def.address;
      // The device acks a session write with `00 <id>` echoing the command id.
      await this.request(
        buildSessionCmd(cmdId, ...prefix, ...values),
        (m) => m.kind === 'genericAck' && m.code === cmdId,
      );
      return;
    }
    await this.setParam(def.address.group, def.address.index, values);
  }

  /**
   * Toggles USB mass-storage (file transfer) mode: `31 09 01|00`.
   *
   * The device drops off the USB bus almost immediately after acking, so this resolves on the ack
   * **or** after {@link FILE_TRANSFER_ACK_TIMEOUT_MS}, then closes the session (its ports are about
   * to be re-enumerated). The hardware-proven bring-up sequence stays in `fileTransferMode.ts`.
   */
  async setFileTransfer(enable: boolean): Promise<void> {
    if (this.state.value !== 'open') {
      await this.open();
    }
    try {
      await this.request<'genericAck'>(
        buildSessionCmd(SessionCmdId.FileTransfer, enable ? 0x01 : 0x00),
        (m) => m.kind === 'genericAck' && m.code === SessionCmdId.FileTransfer,
        FILE_TRANSFER_ACK_TIMEOUT_MS,
      );
    } catch (error) {
      if (!(error instanceof RequestTimeoutError)) {
        this.close();
        throw error;
      }
    }
    this.close();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private ensureSubscribed(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.transport.subscribe((bytes) => this.handleInbound(bytes));
  }

  private handleInbound(bytes: readonly number[]): void {
    const message = parseZoomL6(bytes);

    if (message.kind === 'heartbeatAck') {
      this.awaitingHeartbeatAck = false;
      this.heartbeatMisses.value = 0;
      this.lastAckAt.value = this.now();
    }

    // Heartbeat traffic must never satisfy a pending request matcher.
    const correlatable = message.kind !== 'heartbeat' && message.kind !== 'heartbeatAck';
    const pending = this.inFlight;
    if (correlatable && pending && pending.match(message)) {
      this.inFlight = null;
      if (pending.timer !== null) this.clearTimeoutFn(pending.timer);
      pending.resolve(message);
      this.pump();
    }

    this.messageListeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in editor session message listener:', error);
      }
    });
  }

  private enqueue(
    bytes: readonly number[],
    match: MessageMatcher,
    timeoutMs: number,
    label: string,
  ): Promise<ParsedZoomL6Message> {
    this.ensureSubscribed();
    return new Promise<ParsedZoomL6Message>((resolve, reject) => {
      this.queue.push({ bytes, match, timeoutMs, label, resolve, reject, timer: null });
      this.pump();
    });
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return;
    const request = this.queue.shift()!;
    this.inFlight = request;
    request.timer = this.setTimeoutFn(() => {
      if (this.inFlight !== request) return;
      this.inFlight = null;
      request.reject(
        new RequestTimeoutError(
          `No reply to ${request.label} within ${request.timeoutMs} ms (sent ${bytesToHex(request.bytes)})`,
        ),
      );
      this.pump();
    }, request.timeoutMs);
    try {
      this.transport.send(request.bytes);
    } catch (error) {
      if (this.inFlight === request) this.inFlight = null;
      if (request.timer !== null) this.clearTimeoutFn(request.timer);
      request.reject(error);
      this.pump();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.awaitingHeartbeatAck = false;
    this.heartbeatTimer = this.setIntervalFn(() => this.onHeartbeatTick(), this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.awaitingHeartbeatAck = false;
  }

  private onHeartbeatTick(): void {
    if (this.state.value !== 'open') return;
    if (this.awaitingHeartbeatAck) {
      this.heartbeatMisses.value += 1;
      if (this.heartbeatMisses.value >= this.staleAfterMissedHeartbeats) {
        // Tab throttled or device gone: stop talking; the next request() reopens the session.
        this.stopHeartbeat();
        this.state.value = 'stale';
        this.lastError.value = `No heartbeat ack after ${this.heartbeatMisses.value} intervals`;
        return;
      }
    }
    this.awaitingHeartbeatAck = true;
    try {
      this.transport.send(zoomL6Sysex.heartbeat);
    } catch (error) {
      this.stopHeartbeat();
      this.state.value = 'error';
      this.lastError.value = errorMessage(error);
    }
  }

  private withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError(signal));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortError(signal: AbortSignal): Error {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const error = new Error('Editor session open aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

/** Re-exported for consumers that build UI from the registry without importing params.ts. */
export type { ParamDef, ParamId };
