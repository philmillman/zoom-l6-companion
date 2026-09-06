import { describe, it, expect } from 'vitest';
import {
  zoomL6Sysex,
  zoomMsg,
  buildGetParam,
  buildSetParam,
  buildSceneInfoRequest,
  buildCapabilitiesSet,
  ZoomCmd,
  SessionCmdId,
} from '../messages';

describe('zoomL6Sysex frozen constants', () => {
  it('identity request', () => {
    expect(zoomL6Sysex.identityRequest).toEqual([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]);
  });

  it('editor open', () => {
    expect(zoomL6Sysex.editorOpen).toEqual([0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7]);
  });

  it('heartbeat', () => {
    expect(zoomL6Sysex.heartbeat).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0b, 0xf7]);
  });

  it('file transfer on', () => {
    expect(zoomL6Sysex.activateFileTransfer).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x01, 0xf7]);
  });

  it('file transfer off', () => {
    expect(zoomL6Sysex.deactivateFileTransfer).toEqual([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x00, 0xf7]);
  });
});

describe('builders', () => {
  it('buildGetParam(0, 1)', () => {
    expect(buildGetParam(0, 1)).toEqual([0xf0, 0x52, 0x00, 0x00, 0x46, 0x00, 0x01, 0xf7]);
  });

  it('buildSetParam matches the SetParam envelope', () => {
    expect(buildSetParam(0, 1, [0x12, 0x34])).toEqual([0xf0, 0x52, 0x00, 0x00, 0x45, 0x00, 0x01, 0x12, 0x34, 0xf7]);
  });

  it('buildSceneInfoRequest defaults to subtype 0x01', () => {
    expect(buildSceneInfoRequest()).toEqual([0xf0, 0x52, 0x00, 0x00, 0x67, 0x01, 0xf7]);
  });

  it('buildCapabilitiesSet reproduces the verbatim capability-set message', () => {
    expect(buildCapabilitiesSet()).toEqual([
      0xf0, 0x52, 0x00, 0x00, 0x45, 0x05, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x27, 0x00, 0xf7,
    ]);
  });

  it('rejects a body byte >= 0x80', () => {
    expect(() => zoomMsg(ZoomCmd.SetParam, 0x05, 0x80)).toThrow(RangeError);
    expect(() => buildSetParam(0, 1, [0x12, 0xff])).toThrow(RangeError);
  });

  it('rejects a command byte >= 0x80', () => {
    expect(() => zoomMsg(0x80)).toThrow(RangeError);
  });
});

describe('SessionCmdId', () => {
  it('matches the observed ids', () => {
    expect(SessionCmdId.StateSync).toBe(0x00);
    expect(SessionCmdId.FileTransfer).toBe(0x09);
    expect(SessionCmdId.Heartbeat).toBe(0x0b);
  });
});
