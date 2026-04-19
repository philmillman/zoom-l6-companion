import { zoomL6Sysex } from './messages';

export type SysexSender = (message: readonly number[]) => void;

/** When not using `waitForInboundSysex`, delay after identity before editor open (ms). */
export const DEFAULT_PAUSE_AFTER_IDENTITY_MS = 100;

/** When not using `waitForInboundSysex`, delay after editor open before activate/deactivate (ms). */
export const DEFAULT_PAUSE_AFTER_EDITOR_OPEN_MS = 220;

/** Same as `zooml6_fs.py` / README: wait for identity reply (ms). */
export const DEFAULT_IDENTITY_REPLY_TIMEOUT_MS = 2000;

/** Same as `zooml6_fs.py`: wait for editor-open SysEx reply (ms). */
export const DEFAULT_EDITOR_OPEN_REPLY_TIMEOUT_MS = 2000;

/**
 * In file-transfer mode the L6 often ignores `DEACTIVATE_FS` unless an editor-style session is active.
 * The real Zoom app sends heartbeats at ~100 ms; we send this many before deactivate when `enable` is false.
 */
export const DEFAULT_DEACTIVATE_HEARTBEAT_COUNT = 12;

export const DEFAULT_DEACTIVATE_HEARTBEAT_INTERVAL_MS = 100;

/** Let the device finish handling editor-open before the first heartbeat (first deactivate often races here). */
export const DEFAULT_PAUSE_BEFORE_DEACTIVATE_HEARTBEATS_MS = 320;

/** Brief settle after the burst before `DEACTIVATE_FS`. */
export const DEFAULT_PAUSE_AFTER_DEACTIVATE_HEARTBEATS_MS = 260;

/** When using `waitForInboundSysex`, wait for first heartbeat ACK (`… 00 0B F7`). */
export const DEFAULT_FIRST_HEARTBEAT_ACK_TIMEOUT_MS = 450;

/**
 * Pause between the **prime** pass (identity → editor → heartbeats only) and the real deactivate pass.
 * Hardware often behaves like “second try works”; this emulates that without a second button click.
 */
export const DEFAULT_DEACTIVATE_PRIME_TO_DEACTIVATE_GAP_MS = 1000;

export type InboundSysexWait = (timeoutMs: number) => Promise<readonly number[] | null>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ZoomL6FileTransferHandshakeOptions = {
  /**
   * Same delay after identity and after editor open. Used only when `waitForInboundSysex`
   * is omitted (no MIDI input / blind pacing).
   */
  stepDelayMs?: number;
  /** Wait after sending identity request, before editor open (fallback when no inbound wait). */
  pauseAfterIdentityMs?: number;
  /** Wait after sending editor open, before activate/deactivate (fallback when no inbound wait). */
  pauseAfterEditorOpenMs?: number;
  /**
   * If set (typically `midiService.waitForSysexOnce`), mirrors `zooml6_fs.py`: after each outbound
   * SysEx, wait up to `timeoutMs` for the next inbound SysEx (identity reply, editor ACK blob).
   * When omitted, fixed delays above are used instead.
   */
  waitForInboundSysex?: InboundSysexWait;
  identityReplyTimeoutMs?: number;
  editorOpenReplyTimeoutMs?: number;
  /** Override heartbeat count before deactivate (default {@link DEFAULT_DEACTIVATE_HEARTBEAT_COUNT}). */
  deactivateHeartbeatCount?: number;
  /** Override ms between deactivate heartbeats (default {@link DEFAULT_DEACTIVATE_HEARTBEAT_INTERVAL_MS}). */
  deactivateHeartbeatIntervalMs?: number;
  pauseBeforeDeactivateHeartbeatsMs?: number;
  pauseAfterDeactivateHeartbeatsMs?: number;
  firstHeartbeatAckTimeoutMs?: number;
  /**
   * When false, skip the prime-only pass for deactivate (single attempt).
   * @default true
   */
  deactivateUsePrimePass?: boolean;
  /** Gap between prime pass and the pass that sends `DEACTIVATE_FS`. */
  deactivatePrimeToDeactivateGapMs?: number;
};

async function identityThenEditorOpen(
  send: SysexSender,
  wait: InboundSysexWait | undefined,
  identityTimeout: number,
  afterIdentityFallback: number,
  editorTimeout: number,
  afterEditorFallback: number,
): Promise<void> {
  send(zoomL6Sysex.identityRequest);
  if (wait) {
    await wait(identityTimeout);
  } else {
    await delay(afterIdentityFallback);
  }

  send(zoomL6Sysex.editorOpen);
  if (wait) {
    await wait(editorTimeout);
  } else {
    await delay(afterEditorFallback);
  }
}

async function deactivateEditorSessionHeartbeats(
  send: SysexSender,
  wait: InboundSysexWait | undefined,
  options?: ZoomL6FileTransferHandshakeOptions,
): Promise<void> {
  const pauseBeforeHb =
    options?.pauseBeforeDeactivateHeartbeatsMs ?? DEFAULT_PAUSE_BEFORE_DEACTIVATE_HEARTBEATS_MS;
  const pauseAfterHb =
    options?.pauseAfterDeactivateHeartbeatsMs ?? DEFAULT_PAUSE_AFTER_DEACTIVATE_HEARTBEATS_MS;
  const hbCount = options?.deactivateHeartbeatCount ?? DEFAULT_DEACTIVATE_HEARTBEAT_COUNT;
  const hbIntervalMs =
    options?.deactivateHeartbeatIntervalMs ?? DEFAULT_DEACTIVATE_HEARTBEAT_INTERVAL_MS;
  const firstAckTimeout =
    options?.firstHeartbeatAckTimeoutMs ?? DEFAULT_FIRST_HEARTBEAT_ACK_TIMEOUT_MS;

  await delay(pauseBeforeHb);

  for (let i = 0; i < hbCount; i++) {
    send(zoomL6Sysex.heartbeat);
    if (wait && i === 0) {
      await wait(firstAckTimeout);
    } else {
      await delay(hbIntervalMs);
    }
  }

  await delay(pauseAfterHb);
}

/**
 * Minimal sequence from [L6-MassStorage](https://github.com/Magicking/L6-MassStorage):
 * identity → editor open → activate/deactivate file transfer. Payloads match `zooml6_fs.py`
 * (mido adds F0/F7 around the same byte lists).
 *
 * With `waitForInboundSysex`, pacing matches the Python script (send, then wait for reply).
 * Without it, uses short fixed delays (works only if the host cannot read replies).
 *
 * **Deactivate (`enable === false`):** runs a **prime** pass (identity → editor → heartbeats only),
 * waits {@link DEFAULT_DEACTIVATE_PRIME_TO_DEACTIVATE_GAP_MS}, then runs the same again and sends
 * `DEACTIVATE_FS`. Many L6 units only leave file-transfer mode on the “second” full editor session
 * unless the desktop editor is running; this matches that behaviour in one user action.
 */
export async function runZoomL6FileTransferHandshake(
  send: SysexSender,
  enable: boolean,
  options?: ZoomL6FileTransferHandshakeOptions,
): Promise<void> {
  const wait = options?.waitForInboundSysex;
  const identityTimeout = options?.identityReplyTimeoutMs ?? DEFAULT_IDENTITY_REPLY_TIMEOUT_MS;
  const editorTimeout = options?.editorOpenReplyTimeoutMs ?? DEFAULT_EDITOR_OPEN_REPLY_TIMEOUT_MS;

  const uniform = options?.stepDelayMs;
  const afterIdentityFallback =
    options?.pauseAfterIdentityMs ?? uniform ?? DEFAULT_PAUSE_AFTER_IDENTITY_MS;
  const afterEditorFallback =
    options?.pauseAfterEditorOpenMs ?? uniform ?? DEFAULT_PAUSE_AFTER_EDITOR_OPEN_MS;

  if (!enable) {
    const usePrime = options?.deactivateUsePrimePass ?? true;
    const primeGap =
      options?.deactivatePrimeToDeactivateGapMs ?? DEFAULT_DEACTIVATE_PRIME_TO_DEACTIVATE_GAP_MS;

    if (usePrime) {
      await identityThenEditorOpen(
        send,
        wait,
        identityTimeout,
        afterIdentityFallback,
        editorTimeout,
        afterEditorFallback,
      );
      await deactivateEditorSessionHeartbeats(send, wait, options);
      await delay(primeGap);
    }

    await identityThenEditorOpen(
      send,
      wait,
      identityTimeout,
      afterIdentityFallback,
      editorTimeout,
      afterEditorFallback,
    );
    await deactivateEditorSessionHeartbeats(send, wait, options);
    send(zoomL6Sysex.deactivateFileTransfer);
    return;
  }

  await identityThenEditorOpen(
    send,
    wait,
    identityTimeout,
    afterIdentityFallback,
    editorTimeout,
    afterEditorFallback,
  );
  send(zoomL6Sysex.activateFileTransfer);
}
