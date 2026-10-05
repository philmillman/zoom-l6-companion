import { describe, it, expect } from 'vitest';
import { parseZoomL6, isZoomL6 } from '../parse';

describe('parseZoomL6 — universal identity', () => {
  it('parses an identity reply', () => {
    const bytes = [0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x72, 0x00, 0x0b, 0x00, 0x31, 0x2e, 0x31, 0x30, 0xf7];
    const msg = parseZoomL6(bytes);
    expect(msg.kind).toBe('identityReply');
    if (msg.kind !== 'identityReply') throw new Error('unreachable');
    expect(msg.firmware).toBe('1.10');
    expect(msg.family).toEqual([0x72, 0x00]);
    expect(msg.member).toEqual([0x0b, 0x00]);
    expect(msg.manufacturer).toBe(0x52);
  });

  it('parses an identity request', () => {
    const msg = parseZoomL6([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]);
    expect(msg.kind).toBe('identityRequest');
  });
});

describe('parseZoomL6 — session / acks', () => {
  it('parses a heartbeat ack', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x00, 0x0b, 0xf7]);
    expect(msg.kind).toBe('heartbeatAck');
  });

  it('parses a generic ack with a code', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x00, 0x09, 0xf7]);
    expect(msg.kind).toBe('genericAck');
    if (msg.kind !== 'genericAck') throw new Error('unreachable');
    expect(msg.code).toBe(0x09);
  });

  it('parses a heartbeat', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0b, 0xf7]);
    expect(msg.kind).toBe('heartbeat');
  });

  it('parses file transfer on/off', () => {
    const on = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x01, 0xf7]);
    const off = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x00, 0xf7]);
    expect(on.kind).toBe('fileTransfer');
    expect(off.kind).toBe('fileTransfer');
    if (on.kind !== 'fileTransfer' || off.kind !== 'fileTransfer') throw new Error('unreachable');
    expect(on.enable).toBe(true);
    expect(off.enable).toBe(false);
  });

  it('parses an editor open request', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7]);
    expect(msg.kind).toBe('editorOpen');
  });
});

describe('parseZoomL6 — params', () => {
  it('parses a getParam request', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x46, 0x00, 0x01, 0xf7]);
    expect(msg.kind).toBe('getParam');
    if (msg.kind !== 'getParam') throw new Error('unreachable');
    expect(msg.group).toBe(0);
    expect(msg.index).toBe(1);
  });

  it('parses a paramValue (device reply to getParam)', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x45, 0x00, 0x01, 0x12, 0x34, 0xf7]);
    expect(msg.kind).toBe('paramValue');
    if (msg.kind !== 'paramValue') throw new Error('unreachable');
    expect(msg.group).toBe(0);
    expect(msg.index).toBe(1);
    expect(msg.values).toEqual([0x12, 0x34]);
  });
});

describe('parseZoomL6 — editor open state (2A reply)', () => {
  it('extracts subtype, flags, supportedIds and tail', () => {
    const subtype = 0x03;
    const flags = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const ids = [0x10, 0x11, 0x12];
    const terminator = [0x00, 0x00];
    const trailing = [0x99, 0xaa];
    const payload = [subtype, ...flags, ...ids, ...terminator, ...trailing];
    const bytes = [0xf0, 0x52, 0x00, 0x00, 0x2a, ...payload, 0xf7];

    const msg = parseZoomL6(bytes);
    expect(msg.kind).toBe('editorOpenState');
    if (msg.kind !== 'editorOpenState') throw new Error('unreachable');
    expect(msg.subtype).toBe(subtype);
    expect(msg.flags).toEqual(flags);
    expect(msg.supportedIds).toEqual(ids);
    expect(msg.tail).toEqual([...terminator, ...trailing]);
    expect(msg.payload).toEqual(payload);
  });

  it('finds the real capability id run past an interior zero block (real capture)', () => {
    // From captures/01-connect.txt: the ascending id list sits AFTER an interior run of zeros,
    // so a "stop at first 00 00" scan would wrongly return the leading 31 31 31 31 bytes.
    const payload = [
      0x03, 0x01, 0x01, 0x01, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x31, 0x31, 0x31, 0x31, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0b, 0x0c, 0x0d,
      0x00, 0x00, 0x28, 0x00,
    ];
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x2a, ...payload, 0xf7]);
    expect(msg.kind).toBe('editorOpenState');
    if (msg.kind !== 'editorOpenState') throw new Error('unreachable');
    expect(msg.supportedIds.slice(0, 7)).toEqual([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0b]);
    expect(msg.supportedIds).not.toEqual([0x31, 0x31, 0x31, 0x31]);
  });
});

describe('parseZoomL6 — edge cases', () => {
  it('classifies an unknown Zoom command', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x50, 0x01, 0x02, 0xf7]);
    expect(msg.kind).toBe('unknownZoom');
    if (msg.kind !== 'unknownZoom') throw new Error('unreachable');
    expect(msg.cmd).toBe(0x50);
    expect(msg.body).toEqual([0x01, 0x02]);
  });

  it('classifies non-Zoom sysex as notZoom', () => {
    const msg = parseZoomL6([0xf0, 0x41, 0x00, 0x00, 0xf7]);
    expect(msg.kind).toBe('notZoom');
    expect(isZoomL6([0xf0, 0x41, 0x00, 0x00, 0xf7])).toBe(false);
  });

  it('parses a message even without a trailing F7', () => {
    const msg = parseZoomL6([0xf0, 0x52, 0x00, 0x00, 0x00, 0x0b]);
    expect(msg.kind).toBe('heartbeatAck');
  });

  it('isZoomL6 recognizes the Zoom header', () => {
    expect(isZoomL6([0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7])).toBe(true);
  });
});
