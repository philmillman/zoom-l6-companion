import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequestTimeoutError,
  SessionClosedError,
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

      await expect(session.setValue('midiOutMode', 1)).rejects.toBeInstanceOf(UnverifiedParamError);
      expect(transport.commands).toHaveLength(0);
    });

    it('writes an unverified parameter when forced', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      transport.sent.length = 0;

      const pending = session.setValue('midiOutMode', 1, { force: true });
      await vi.advanceTimersByTimeAsync(0);
      const sent = transport.commands.at(-1)!;
      expect(sent[4]).toBe(0x45); // SetParam
      expect(sent.at(-2)).toBe(1); // encoded enum value

      transport.receive(ack(0x45));
      await expect(pending).resolves.toBeUndefined();
    });

    it('reads firmware through the identity address scheme', async () => {
      const { transport, session } = makeSession();
      await openSession(transport, session);
      await expect(session.getValue('firmwareVersion')).resolves.toBeCloseTo(1.1);
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

  describe('sendRaw()', () => {
    it('goes through the transport so the debugger logs it', () => {
      const { transport, session } = makeSession();
      session.sendRaw([0xf0, 0x52, 0x00, 0x00, 0x67, 0x01, 0xf7]);
      expect(transport.sent).toEqual([[0xf0, 0x52, 0x00, 0x00, 0x67, 0x01, 0xf7]]);
    });
  });
});
