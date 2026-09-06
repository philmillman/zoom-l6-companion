import { describe, it, expect } from 'vitest';
import {
  encode7bitLE,
  decode7bitLE,
  encodeParamValue,
  decodeParamValue,
  decodeAscii,
  ParamWidthMismatch,
  NotSupported,
} from '../codec';
import { getParam, type ParamDef } from '../params';

describe('encode7bitLE / decode7bitLE', () => {
  it('round-trips width 1 (0..127)', () => {
    for (const v of [0, 1, 64, 127]) {
      const bytes = encode7bitLE(v, 1);
      expect(bytes).toHaveLength(1);
      expect(decode7bitLE(bytes)).toBe(v);
    }
  });

  it('round-trips width 2 (0..16383)', () => {
    for (const v of [0, 1, 200, 16383]) {
      const bytes = encode7bitLE(v, 2);
      expect(bytes).toHaveLength(2);
      expect(decode7bitLE(bytes)).toBe(v);
    }
  });

  it('round-trips width 4', () => {
    const max28 = 2 ** 28 - 1;
    for (const v of [0, 1, 1_000_000, max28]) {
      const bytes = encode7bitLE(v, 4);
      expect(bytes).toHaveLength(4);
      expect(decode7bitLE(bytes)).toBe(v);
    }
  });

  it('is little-endian (LSB first)', () => {
    expect(encode7bitLE(1, 2)).toEqual([1, 0]);
    expect(encode7bitLE(128, 2)).toEqual([0, 1]);
  });

  it('throws when the value overflows the given width', () => {
    expect(() => encode7bitLE(128, 1)).toThrow(RangeError);
    expect(() => encode7bitLE(16384, 2)).toThrow(RangeError);
  });

  it('throws on negative or non-integer values', () => {
    expect(() => encode7bitLE(-1, 1)).toThrow(RangeError);
    expect(() => encode7bitLE(1.5, 1)).toThrow(RangeError);
  });

  it('decode7bitLE tolerates any byte-array length', () => {
    expect(decode7bitLE([])).toBe(0);
    expect(decode7bitLE([5])).toBe(5);
  });
});

describe('encodeParamValue / decodeParamValue', () => {
  // midiChannel: range 1..16, deviceOffset -1, encoding u7 — a real registry entry.
  const midiChannel = getParam('midiChannel');

  it('applies deviceOffset in both directions', () => {
    const bytes = encodeParamValue(midiChannel, 5);
    expect(bytes).toEqual([4]);
    expect(decodeParamValue(midiChannel, bytes)).toBe(5);
  });

  it('clamps to range before applying the offset', () => {
    expect(encodeParamValue(midiChannel, 999)).toEqual([15]); // clamp to 16, then -1
    expect(encodeParamValue(midiChannel, -50)).toEqual([0]); // clamp to 1, then -1
  });

  it('bypasses clamping for special values', () => {
    const def: ParamDef = {
      id: 'midiChannel',
      label: 'test special value',
      category: 'system',
      address: { scheme: 'param', group: 0x7f, index: 200 },
      encoding: { kind: 'u7' },
      range: { min: 0, max: 10 },
      specialValues: { 127: 'Off' },
      models: ['l6'],
      verified: false,
    };
    // 127 is well outside range {0,10} but is a special value, so it must not be clamped.
    expect(encodeParamValue(def, 127)).toEqual([127]);
    expect(decodeParamValue(def, [127])).toBe(127);
    // Ordinary values still clamp normally.
    expect(encodeParamValue(def, 999)).toEqual([10]);
  });

  it('round-trips u14le and u28le widths', () => {
    const def14: ParamDef = {
      id: 'midiChannel',
      label: 'u14le test',
      category: 'system',
      address: { scheme: 'param', group: 0x7f, index: 201 },
      encoding: { kind: 'u14le' },
      range: { min: 0, max: 16383 },
      models: ['l6'],
      verified: false,
    };
    expect(decodeParamValue(def14, encodeParamValue(def14, 12345))).toBe(12345);

    const def28: ParamDef = {
      id: 'midiChannel',
      label: 'u28le test',
      category: 'system',
      address: { scheme: 'param', group: 0x7f, index: 202 },
      encoding: { kind: 'u28le' },
      range: { min: 0, max: 2 ** 28 - 1 },
      models: ['l6'],
      verified: false,
    };
    expect(decodeParamValue(def28, encodeParamValue(def28, 987654))).toBe(987654);
  });

  it('encodes bool and enum as single bytes', () => {
    const boolDef: ParamDef = {
      id: 'midiChannel',
      label: 'bool test',
      category: 'system',
      address: { scheme: 'param', group: 0x7f, index: 203 },
      encoding: { kind: 'bool' },
      range: { min: 0, max: 1 },
      models: ['l6'],
      verified: false,
    };
    expect(encodeParamValue(boolDef, 1)).toEqual([1]);
    expect(decodeParamValue(boolDef, [0])).toBe(0);
  });

  it('throws ParamWidthMismatch when the byte count is wrong', () => {
    expect(() => decodeParamValue(midiChannel, [1, 2])).toThrow(ParamWidthMismatch);
    try {
      decodeParamValue(midiChannel, [1, 2]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParamWidthMismatch);
      expect((e as ParamWidthMismatch).expected).toBe(1);
      expect((e as ParamWidthMismatch).actual).toBe(2);
    }
  });

  it('throws NotSupported for ascii encodings', () => {
    const asciiDef: ParamDef = {
      id: 'midiChannel',
      label: 'ascii test',
      category: 'info',
      address: { scheme: 'identity' },
      encoding: { kind: 'ascii', length: 4 },
      range: { min: 0, max: 0 },
      models: ['l6'],
      verified: true,
      evidence: 'test fixture',
    };
    expect(() => encodeParamValue(asciiDef, 5)).toThrow(NotSupported);
    expect(() => decodeParamValue(asciiDef, [0x31, 0x2e, 0x31, 0x30])).toThrow(NotSupported);
  });
});

describe('decodeAscii', () => {
  it('drops trailing NUL padding', () => {
    expect(decodeAscii([0x31, 0x2e, 0x31, 0x30, 0, 0])).toBe('1.10');
  });

  it('handles strings with no padding', () => {
    expect(decodeAscii([0x41, 0x42])).toBe('AB');
  });

  it('handles all-NUL input', () => {
    expect(decodeAscii([0, 0, 0])).toBe('');
  });
});
