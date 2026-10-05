import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequestTimeoutError,
  SessionClosedError,
  SessionReadUnsupportedError,
  UnverifiedParamError,
  ZoomL6EditorSession,
  type SysexTransport,
} from '../editorSession';
import { buildGetParam, buildSessionCmd, zoomL6Sysex } from '../messages';
import { bytesToHex } from '../hex';

/** `F0 7E 00 06 02 52 72 00 0B 00 '1' '.' '1' '0' F7` — Zoom identity reply with firmware "1.10". */
const IDENTITY_REPLY = [
  0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x72, 0x00, 0x0b, 0x00,
  0x31, 0x2e, 0x31, 0x30, 0xf7,
];
/** Same shape but manufacturer 0x41 (Roland) — must be rejected. */
const FOREIGN_IDENTITY_REPLY = [
  0xf0, 0x7e, 0x00, 0x06, 0x02, 0x41, 0x72, 0x00, 0x0b, 0x00,
  0x31, 0x2e, 0x30, 0x30, 0xf7,
];
/** `F0 52 00 00 2A 03 <blob> F7` — editor-open state reply (blob shortened for the test). */
const EDITOR_OPEN_REPLY = [
  0xf0, 0x52, 0x00, 0x00, 0x2a, 0x03,
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
  0x10, 0x11, 0x12, 0x00, 0x00, 0x7f,
  0xf7,
];
const HEARTBEAT_ACK = [0xf0, 0x52, 0x00, 0x00, 0x00, 0x0b, 0xf7];
const HEARTBEAT_OUT = [...zoomL6Sysex.heartbeat];

const paramValue = (group: number, index: number, values: number[]) => [
  0xf0, 0x52, 0x00, 0x00, 0x45, group, index, ...values, 0xf7,
];
const ack = (code: number) => [0xf0, 0x52, 0x00, 0x00, 0x00, code, 0xf7];

class FakeTransport implements SysexTransport {
  sent: number[][] = [];
  subscribers = new Set<(bytes: readonly number[]) => void>();
  /** Set to true to make `send` throw (simulates a dead MIDI port). */
  failSend = false;

  send(bytes: readonly number[]): void {
    if (this.failSend) throw new Error('port closed');
    this.sent.push([...bytes]);
  }

  subscribe(cb: (bytes: readonly number[]) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /** Simulates the device answering. */
  receive(bytes: readonly number[]): void {
    for (const cb of [...this.subscribers]) cb(bytes);
  }

  get hex(): string[] {
    return this.sent.map((b) => bytesToHex(b));
  }

  /** Outbound messages that are not heartbeats. */
  get commands(): number[][] {
    return this.sent.filter((b) => bytesToHex(b) !== bytesToHex(HEARTBEAT_OUT));
  }

  get heartbeatCount(): number {
    return this.sent.length - this.commands.length;
  }
}

function makeSession(opts: ConstructorParameters<typeof ZoomL6EditorSession>[1] = {}) {
  const transport = new FakeTransport();
  const session = new ZoomL6EditorSession(transport, opts);
  return { transport, session };
}

/** Drives the two-step handshake, answering each request as soon as it has been sent. */
async function openSession(
  transport: FakeTransport,
  session: ZoomL6EditorSession,
  identityReply = IDENTITY_REPLY,
) {
  const promise = session.open();
  await vi.advanceTimersByTimeAsync(0);
  transport.receive(identityReply);
  await vi.advanceTimersByTimeAsync(0);
  transport.receive(EDITOR_OPEN_REPLY);
  return promise;
}

describe('ZoomL6EditorSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('open()', () => {
    it('sends the identity request first and only opens the editor after the reply', async () => {
      const { transport, session } = makeSession();
      expect(session.state.value).toBe('closed');

      const promise = session.open();
      await vi.advanceTimersByTimeAsync(0);
      expect(session.state.value).toBe('opening');
      expect(transport.sent).toEqual([[...zoomL6Sysex.identityRequest]]);

      // Editor open must not be sent before the identity reply arrives.
      await vi.advanceTimersByTimeAsync(500);
      expect(transport.sent).toHaveLength(1);

      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.sent[1]).toEqual([...zoomL6Sysex.editorOpen]);

      transport.receive(EDITOR_OPEN_REPLY);
      const info = await promise;

      expect(session.state.value).toBe('open');
      expect(info.identity.firmware).toBe('1.10');
      expect(info.editorState.subtype).toBe(0x03);
      expect(session.info.value).toBe(info);
      expect(session.getFirmware()).toBe('1.10');
    });

    it('starts a 100 ms heartbeat once open and clears misses on each ack', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      expect(transport.heartbeatCount).toBe(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(transport.heartbeatCount).toBe(1);
      expect(transport.sent.at(-1)).toEqual(HEARTBEAT_OUT);
      transport.receive(HEARTBEAT_ACK);
      expect(session.heartbeatMisses.value).toBe(0);
      expect(session.lastAckAt.value).not.toBeNull();

      await vi.advanceTimersByTimeAsync(300);
      expect(transport.heartbeatCount).toBe(4);
    });

    it('rejects an identity reply from another manufacturer', async () => {
      const { transport, session } = makeSession();
      await expect(openSession(transport, session, FOREIGN_IDENTITY_REPLY)).rejects.toThrow(/not from a Zoom device/);
      expect(session.state.value).toBe('error');
      expect(session.lastError.value).toMatch(/0x41/);
      // No editor open was sent.
      expect(transport.sent).toEqual([[...zoomL6Sysex.identityRequest]]);
    });

    it('is idempotent and shares one promise between concurrent callers', async () => {
      const { transport, session } = makeSession();
      const a = session.open();
      const b = session.open();
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(EDITOR_OPEN_REPLY);
      const [infoA, infoB] = await Promise.all([a, b]);

      expect(infoA).toBe(infoB);
      expect(transport.commands).toHaveLength(2);

      // Already open: no further traffic.
      const again = await session.open();
      expect(again).toBe(infoA);
      expect(transport.commands).toHaveLength(2);
    });
  });

  describe('request()', () => {
    it('rejects with SessionClosedError while closed', async () => {
      const { transport, session } = makeSession();
      await expect(session.request(buildGetParam(0, 1), 'paramValue')).rejects.toBeInstanceOf(SessionClosedError);
      expect(transport.sent).toHaveLength(0);
    });

    it('keeps one request in flight and preserves FIFO order', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const first = session.getParam(0x00, 0x01);
      const second = session.getParam(0x00, 0x02);
      await vi.advanceTimersByTimeAsync(0);

      expect(transport.commands).toEqual([buildGetParam(0x00, 0x01)]);

      transport.receive(paramValue(0x00, 0x01, [0x11, 0x22]));
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands).toEqual([buildGetParam(0x00, 0x01), buildGetParam(0x00, 0x02)]);

      transport.receive(paramValue(0x00, 0x02, [0x33, 0x44]));
      await expect(first).resolves.toEqual([0x11, 0x22]);
      await expect(second).resolves.toEqual([0x33, 0x44]);
    });

    it('rejects with RequestTimeoutError when the device stays silent', async () => {
      const { transport, session } = makeSession({ requestTimeoutMs: 1000 });
      await openSession(transport, session);

      const pending = session.getParam(0x00, 0x01);
      const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    });

    it('never lets a heartbeat ack satisfy a pending request', async () => {
      const { transport, session } = makeSession({ requestTimeoutMs: 1000 });
      await openSession(transport, session);

      const pending = session.getParam(0x00, 0x01);
      await vi.advanceTimersByTimeAsync(0);

      // A heartbeat ack (`00 0B`) looks like a generic ack but must be ignored for correlation.
      transport.receive(HEARTBEAT_ACK);
      await vi.advanceTimersByTimeAsync(200);
      let settled = false;
      void pending.then(
        () => (settled = true),
        () => (settled = true),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);

      transport.receive(paramValue(0x00, 0x01, [0x07]));
      await expect(pending).resolves.toEqual([0x07]);
    });

    it('setParam resolves with the ack code', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);

      const pending = session.setParam(0x00, 0x01, [0x05, 0x00]);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x45, 0x00, 0x01, 0x05, 0x00, 0xf7]);

      transport.receive(ack(0x45));
      await expect(pending).resolves.toBe(0x45);
    });
  });

  describe('onMessage()', () => {
    it('receives unsolicited pushes that match no pending request', async () => {
      const { transport, session } = makeSession();
      const seen: string[] = [];
      session.onMessage((m) => seen.push(m.kind));
      await openSession(transport, session);

      transport.receive(paramValue(0x02, 0x03, [0x01, 0x00, 0x00, 0x00]));
      expect(seen).toEqual(['identityReply', 'editorOpenState', 'paramValue']);
    });
  });

  describe('staleness', () => {
    it('goes stale after N intervals without an ack and stops sending', async () => {
      const { transport, session } = makeSession({ staleAfterMissedHeartbeats: 3 });
      await openSession(transport, session);

      await vi.advanceTimersByTimeAsync(100 * 4);
      expect(session.state.value).toBe('stale');
      expect(session.heartbeatMisses.value).toBe(3);

      const sentWhenStale = transport.sent.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.sent).toHaveLength(sentWhenStale);
    });

    it('reopens the session on the next request', async () => {
      const { transport, session } = makeSession({ staleAfterMissedHeartbeats: 3 });
      await openSession(transport, session);
      await vi.advanceTimersByTimeAsync(100 * 4);
      expect(session.state.value).toBe('stale');
      transport.sent.length = 0;

      const pending = session.getParam(0x00, 0x01);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands).toEqual([[...zoomL6Sysex.identityRequest]]);

      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(EDITOR_OPEN_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.state.value).toBe('open');
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x00, 0x01));

      transport.receive(paramValue(0x00, 0x01, [0x02]));
      await expect(pending).resolves.toEqual([0x02]);
    });
  });

  describe('close()', () => {
    it('rejects pending requests, stops heartbeats and unsubscribes', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);

      const pending = session.getParam(0x00, 0x01);
      const queued = session.getParam(0x00, 0x02);
      const assertions = Promise.all([
        expect(pending).rejects.toBeInstanceOf(SessionClosedError),
        expect(queued).rejects.toBeInstanceOf(SessionClosedError),
      ]);
      await vi.advanceTimersByTimeAsync(0);

      session.close();
      await assertions;

      expect(session.state.value).toBe('closed');
      expect(session.info.value).toBeNull();
      expect(transport.subscribers.size).toBe(0);

      const sentAtClose = transport.sent.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.sent).toHaveLength(sentAtClose);
    });
  });

  describe('registry access', () => {
    it('refuses to write an unverified parameter without force', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      // `dateTime` is the remaining unverified placeholder (its read/write encoding isn't decoded).
      await expect(session.setValue('dateTime', 0)).rejects.toBeInstanceOf(UnverifiedParamError);
      expect(transport.commands).toHaveLength(0);
    });

    it('force bypasses the unverified gate', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      // No unverified *numeric* param remains (all captured settings are now verified), so prove the
      // gate itself: forcing an unverified param gets past the verified check — any rejection that
      // follows comes from a later stage (its placeholder encoding), never UnverifiedParamError.
      const err = await session.setValue('dateTime', 0, { force: true }).catch((e) => e);
      expect(err).not.toBeInstanceOf(UnverifiedParamError);
    });

    it('reads firmware through the identity address scheme', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      await expect(session.getValue('firmwareVersion')).resolves.toBeCloseTo(1.1);
    });

    it('rejects reading a write-only session parameter', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      await expect(session.getValue('midiOutMode')).rejects.toBeInstanceOf(SessionReadUnsupportedError);
    });
  });

  describe('session-command writes', () => {
    /** Drives a verified `setValue` and returns the exact non-heartbeat bytes it put on the wire. */
    async function writeAndCapture(id: Parameters<ZoomL6EditorSession['setValue']>[0], value: number) {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.setValue(id, value);
      await vi.advanceTimersByTimeAsync(0);
      const sent = transport.commands.at(-1)!;
      // Every verified session write is acked with `00 <id>` echoing the command id.
      const cmdId = sent[5]!;
      transport.receive(ack(cmdId));
      await expect(pending).resolves.toBeUndefined();
      return sent;
    }

    it('midiOutMode Thru → 31 0C 01', async () => {
      expect(await writeAndCapture('midiOutMode', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0c, 0x01, 0xf7]);
    });

    it('midiChannel 16 → 31 0D 0F (deviceOffset -1)', async () => {
      expect(await writeAndCapture('midiChannel', 16)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0d, 0x0f, 0xf7]);
    });

    it('mixerControlViaMidi on → 31 03 01', async () => {
      expect(await writeAndCapture('mixerControlViaMidi', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x03, 0x01, 0xf7]);
    });

    it('batteryType Lithium → 31 01 02', async () => {
      expect(await writeAndCapture('batteryType', 2)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x01, 0x02, 0xf7]);
    });

    it('recorderMode Master Only → 31 04 01', async () => {
      expect(await writeAndCapture('recorderMode', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x04, 0x01, 0xf7]);
    });

    it('pad2.mode Loop → 31 06 01 01', async () => {
      expect(await writeAndCapture('pad2.mode', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x06, 0x01, 0x01, 0xf7]);
    });

    it('pad1.level max → 31 07 00 3B', async () => {
      expect(await writeAndCapture('pad1.level', 0x3b)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x07, 0x00, 0x3b, 0xf7]);
    });

    it('pad1.note 60 → 31 0F 00 3C 00 (mapped)', async () => {
      expect(await writeAndCapture('pad1.note', 60)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0f, 0x00, 0x3c, 0x00, 0xf7]);
    });

    it('pad1.note "Not Mapped" sentinel 128 → 31 0F 00 00 01', async () => {
      expect(await writeAndCapture('pad1.note', 128)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0f, 0x00, 0x00, 0x01, 0xf7]);
    });

    it('aux2SendPoint.ch6 Post → 31 14 05 01 01', async () => {
      expect(await writeAndCapture('aux2SendPoint.ch6', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x14, 0x05, 0x01, 0x01, 0xf7]);
    });

    it('fx.delay.time 915 → 31 13 03 00 13 07 (u14le)', async () => {
      expect(await writeAndCapture('fx.delay.time', 915)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x13, 0x03, 0x00, 0x13, 0x07, 0xf7]);
    });

    it('fx.hall.decay 100 → 31 13 00 00 64 00 (0-100 still sent as 2 bytes)', async () => {
      expect(await writeAndCapture('fx.hall.decay', 100)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x13, 0x00, 0x00, 0x64, 0x00, 0xf7]);
    });

    // L6max-only settings (captures/maxB-maxG)
    it('monitorPoint Post → 31 19 02', async () => {
      expect(await writeAndCapture('monitorPoint', 2)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x19, 0x02, 0xf7]);
    });

    it('subOutPoint Pre+Comp → 31 1A 01', async () => {
      expect(await writeAndCapture('subOutPoint', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x1a, 0x01, 0xf7]);
    });

    it('usbMixMinus on → 31 15 01', async () => {
      expect(await writeAndCapture('usbMixMinus', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x15, 0x01, 0xf7]);
    });

    it('usbAudioMode Multi Track → 31 18 01', async () => {
      expect(await writeAndCapture('usbAudioMode', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x18, 0x01, 0xf7]);
    });

    it('aux1SendPoint.ch7 Post → 31 14 06 00 01', async () => {
      expect(await writeAndCapture('aux1SendPoint.ch7', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x14, 0x06, 0x00, 0x01, 0xf7]);
    });

    it('pad1.clockSync on → 31 17 00 01', async () => {
      expect(await writeAndCapture('pad1.clockSync', 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x17, 0x00, 0x01, 0xf7]);
    });

    it('only accepts the ack whose code echoes the command id', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.setValue('midiOutMode', 1);
      await vi.advanceTimersByTimeAsync(0);

      // A generic ack for a different id must not satisfy this write.
      transport.receive(ack(0x45));
      let settled = false;
      void pending.then(() => (settled = true), () => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);

      transport.receive(ack(0x0c));
      await expect(pending).resolves.toBeUndefined();
    });
  });

  describe('setFileTransfer()', () => {
    it('resolves on the ack and closes the session', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.setFileTransfer(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual(buildSessionCmd(0x09, 0x01));

      transport.receive(ack(0x09));
      await expect(pending).resolves.toBeUndefined();
      expect(session.state.value).toBe('closed');
    });

    it('resolves anyway when the device disconnects before acking', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);

      const pending = session.setFileTransfer(false);
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toBeUndefined();
      expect(session.state.value).toBe('closed');
    });
  });

  describe('refreshState()', () => {
    /** Same shape as EDITOR_OPEN_REPLY with a different last payload byte, so a re-read is visible. */
    const EDITOR_OPEN_REPLY_2 = [...EDITOR_OPEN_REPLY.slice(0, -2), 0x55, 0xf7];

    it('re-sends identity then editor open and replaces info with a new object', async () => {
      const { transport, session } = makeSession();
      const first = await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.refreshState();
      await vi.advanceTimersByTimeAsync(0);
      // Mirrors the official editor: identity request first, editor open only after its reply.
      expect(transport.commands).toEqual([[...zoomL6Sysex.identityRequest]]);

      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands).toEqual([[...zoomL6Sysex.identityRequest], [...zoomL6Sysex.editorOpen]]);

      transport.receive(EDITOR_OPEN_REPLY_2);
      const info = await pending;

      expect(info).not.toBe(first);
      expect(session.info.value).toBe(info);
      expect(info.editorState.payload.at(-1)).toBe(0x55);
      expect(info.identity.firmware).toBe('1.10');
      expect(info.openedAt).toBe(first.openedAt);
      expect(session.state.value).toBe('open');
    });

    it('keeps the heartbeat running while the refresh is in flight', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);

      const pending = session.refreshState();
      await vi.advanceTimersByTimeAsync(0);
      const before = transport.heartbeatCount;
      // Heartbeat acks arrive meanwhile and must not satisfy the identity matcher.
      await vi.advanceTimersByTimeAsync(300);
      transport.receive(HEARTBEAT_ACK);
      expect(transport.heartbeatCount).toBe(before + 3);

      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(EDITOR_OPEN_REPLY);
      await pending;

      await vi.advanceTimersByTimeAsync(100);
      expect(transport.heartbeatCount).toBe(before + 4);
      expect(session.state.value).toBe('open');
    });

    it('shares one attempt between concurrent callers', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const a = session.refreshState();
      const b = session.refreshState();
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(IDENTITY_REPLY);
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(EDITOR_OPEN_REPLY);
      const [infoA, infoB] = await Promise.all([a, b]);
      expect(infoA).toBe(infoB);
      expect(transport.commands).toHaveLength(2);
    });

    it('rejects with SessionClosedError while closed and sends nothing', async () => {
      const { transport, session } = makeSession();
      await expect(session.refreshState()).rejects.toBeInstanceOf(SessionClosedError);
      expect(transport.sent).toHaveLength(0);
    });

    it('rejects on timeout and leaves the session and info untouched', async () => {
      const { transport, session } = makeSession({ editorOpenTimeoutMs: 2000 });
      const first = await openSession(transport, session);

      const pending = session.refreshState();
      const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(IDENTITY_REPLY);
      // Keep acking heartbeats so the session doesn't go stale while the editor open times out.
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(100);
        transport.receive(HEARTBEAT_ACK);
      }
      await assertion;

      expect(session.state.value).toBe('open');
      expect(session.info.value).toBe(first);
    });

    it('rejects with SessionClosedError when the session closes mid-refresh', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);

      const pending = session.refreshState();
      const assertion = expect(pending).rejects.toBeInstanceOf(SessionClosedError);
      await vi.advanceTimersByTimeAsync(0);
      session.close();
      await assertion;
      expect(session.info.value).toBeNull();
    });
  });

  describe('readPadFiles()', () => {
    /** `45 02 <pad>` reply for "260303_190013.WAV" (captures/02-midi-out-mode.txt). */
    const PAD1_NAME = [
      0x00, 0x00, 0x27, 0x00, 0x00, 0x32, 0x00, 0x36, 0x00, 0x30, 0x00, 0x33, 0x00, 0x00, 0x30, 0x00,
      0x33, 0x00, 0x5f, 0x00, 0x00, 0x31, 0x00, 0x39, 0x00, 0x30, 0x00, 0x30, 0x00, 0x00, 0x31, 0x00,
      0x33, 0x00, 0x2e, 0x00, 0x00, 0x57, 0x00, 0x41, 0x00, 0x56, 0x00,
    ];
    const NO_NAME = [0x7f, 0x7f, 0x00, 0x00];

    it('reads 46 00 then 46 02 per pad, sequentially, and decodes them', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.readPadFiles(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands).toEqual([buildGetParam(0x00, 0x00)]);

      transport.receive(paramValue(0x00, 0x00, [0x00, 0x01]));
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x02, 0x00));
      transport.receive(paramValue(0x02, 0x00, PAD1_NAME));
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x00, 0x01));
      transport.receive(paramValue(0x00, 0x01, [0x00, 0x00]));
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x02, 0x01));
      transport.receive(paramValue(0x02, 0x01, NO_NAME));

      await expect(pending).resolves.toEqual([
        { assigned: true, fileName: '260303_190013.WAV' },
        { assigned: false, fileName: null },
      ]);
      expect(transport.commands.map((b) => bytesToHex(b))).toEqual([
        bytesToHex(buildGetParam(0x00, 0x00)),
        bytesToHex(buildGetParam(0x02, 0x00)),
        bytesToHex(buildGetParam(0x00, 0x01)),
        bytesToHex(buildGetParam(0x02, 0x01)),
      ]);
    });

    it('rejects with SessionClosedError while closed', async () => {
      const { session } = makeSession();
      await expect(session.readPadFiles()).rejects.toBeInstanceOf(SessionClosedError);
    });

    it('returns null for a pad whose read times out and still reads the others', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.readPadFiles(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x00, 0x00));
      // Pad 1 never answers: its first read times out.
      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.commands.at(-1)).toEqual(buildGetParam(0x00, 0x01));
      transport.receive(paramValue(0x00, 0x01, [0x00, 0x01]));
      await vi.advanceTimersByTimeAsync(0);
      transport.receive(paramValue(0x02, 0x01, PAD1_NAME));

      await expect(pending).resolves.toEqual([null, { assigned: true, fileName: '260303_190013.WAV' }]);
    });
  });

  describe('sendRaw()', () => {
    it('goes through the transport so the debugger logs it', () => {
      const { transport, session } = makeSession();
      session.sendRaw([0xf0, 0x52, 0x00, 0x00, 0x67, 0x01, 0xf7]);
      expect(transport.sent).toEqual([[0xf0, 0x52, 0x00, 0x00, 0x67, 0x01, 0xf7]]);
    });
  });
});
