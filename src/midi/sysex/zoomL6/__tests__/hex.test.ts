import { describe, it, expect } from 'vitest';
import { bytesToHex, hexToBytes } from '../hex';

describe('bytesToHex', () => {
  it('formats bytes as uppercase, space-separated hex', () => {
    expect(bytesToHex([0xf0, 0x52, 0x00])).toBe('F0 52 00');
  });

  it('pads single hex digits', () => {
    expect(bytesToHex([0, 1, 15])).toBe('00 01 0F');
  });

  it('returns an empty string for no bytes', () => {
    expect(bytesToHex([])).toBe('');
  });
});

describe('hexToBytes', () => {
  it('parses space-separated hex', () => {
    expect(hexToBytes('F0 52 00')).toEqual([0xf0, 0x52, 0x00]);
  });

  it('parses a contiguous hex run', () => {
    expect(hexToBytes('f05200')).toEqual([0xf0, 0x52, 0x00]);
  });

  it('parses $-prefixed comma-separated hex', () => {
    expect(hexToBytes('$F0,$52')).toEqual([0xf0, 0x52]);
  });

  it('parses 0x-prefixed hex', () => {
    expect(hexToBytes('0xF0 0x52')).toEqual([0xf0, 0x52]);
  });

  it('tolerates newlines and tabs as separators', () => {
    expect(hexToBytes('F0\n52\t00')).toEqual([0xf0, 0x52, 0x00]);
  });

  it('returns an empty array for empty input', () => {
    expect(hexToBytes('')).toEqual([]);
    expect(hexToBytes('   ')).toEqual([]);
  });

  it('throws on an odd number of hex digits', () => {
    expect(() => hexToBytes('F05')).toThrow(RangeError);
  });

  it('throws on non-hex input', () => {
    expect(() => hexToBytes('ZZ')).toThrow(RangeError);
  });

  it('round-trips with bytesToHex', () => {
    const bytes = [0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7];
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });
});
