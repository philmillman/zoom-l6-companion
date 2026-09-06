import { describe, it, expect } from 'vitest';
import { parseMidiMonitorText } from '../midiMonitorParser';

describe('parseMidiMonitorText', () => {
  it('parses an Expert-mode row (plain hex), "From" = device->host', () => {
    const text = '12:00:00.000\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 2B F7';
    const events = parseMidiMonitorText(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      line: 1,
      dir: 'device→host',
      port: 'L6 Editor Port',
      bytes: [0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7],
      truncated: false,
    });
  });

  it('parses a normal-mode row with an embedded description cell, "To" = host->device', () => {
    const text = '12:00:00.000\tTo L6 Editor Port\tSysEx\t\tZOOM Corporation 6 bytes\tF0 52 00 00 2B F7';
    const events = parseMidiMonitorText(text);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      dir: 'host→device',
      port: 'L6 Editor Port',
      bytes: [0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7],
    });
  });

  it('marks truncated hex ending in an ellipsis', () => {
    const text = '12:00:00.000\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 45 00 01 …';
    const events = parseMidiMonitorText(text);
    expect(events[0]!.truncated).toBe(true);
    expect(events[0]!.bytes).toEqual([0xf0, 0x52, 0x00, 0x00, 0x45, 0x00, 0x01]);
  });

  it('also accepts an ASCII "..." ellipsis', () => {
    const text = '12:00:00.000\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 45 00 01 ...';
    const events = parseMidiMonitorText(text);
    expect(events[0]!.truncated).toBe(true);
    expect(events[0]!.bytes).toEqual([0xf0, 0x52, 0x00, 0x00, 0x45, 0x00, 0x01]);
  });

  it('handles CRLF line endings and increments line numbers', () => {
    const text = [
      '12:00:00.000\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 00 0B F7',
      '12:00:00.100\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 00 0B F7',
    ].join('\r\n');
    const events = parseMidiMonitorText(text);
    expect(events).toHaveLength(2);
    expect(events[0]!.line).toBe(1);
    expect(events[1]!.line).toBe(2);
  });

  it('skips non-SysEx rows but keeps line numbers for the rows that remain', () => {
    const text = [
      '12:00:00.000\tFrom L6 Editor Port\tNote On\t1\t60 127',
      '12:00:00.100\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 00 0B F7',
    ].join('\n');
    const events = parseMidiMonitorText(text);
    expect(events).toHaveLength(1);
    expect(events[0]!.line).toBe(2);
  });

  it('accepts $-prefixed hex bytes', () => {
    const text = '12:00:00.000\tFrom L6 Editor Port\tSysEx\t\t$F0 $52 $00 $00 $2B $F7';
    const events = parseMidiMonitorText(text);
    expect(events[0]!.bytes).toEqual([0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7]);
  });

  it('falls back to an opcode-based direction guess when there is no From/To prefix', () => {
    const getParamText = '12:00:00.000\tL6 Editor Port\tSysEx\t\tF0 52 00 00 46 00 01 F7';
    expect(parseMidiMonitorText(getParamText)[0]!.dir).toBe('host→device'); // 0x46 GetParam

    const replyText = '12:00:00.000\tL6 Editor Port\tSysEx\t\tF0 52 00 00 2A 03 F7';
    expect(parseMidiMonitorText(replyText)[0]!.dir).toBe('device→host'); // 0x2A EditorOpenReply
  });

  it('ignores blank lines', () => {
    const text = '\n\n12:00:00.000\tFrom L6 Editor Port\tSysEx\t\tF0 52 00 00 00 0B F7\n\n';
    const events = parseMidiMonitorText(text);
    expect(events).toHaveLength(1);
  });

  it('tolerates lines with fewer columns than expected', () => {
    const text = 'too\tfew';
    expect(parseMidiMonitorText(text)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseMidiMonitorText('')).toEqual([]);
  });
});
