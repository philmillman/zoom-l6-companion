/**
 * Numeric <-> byte codec for the Zoom L6 parameter registry (`params.ts`).
 *
 * All multi-byte parameter values are little-endian streams of 7-bit bytes (matching other
 * Zoom gear, e.g. the MS-50G `31 nn pp vvLSB vvMSB` pattern).
 */
import { encodingWidth, type ParamDef } from './params';

/** Thrown by `decodeParamValue` when the byte count doesn't match the encoding's expected width.
 * This mismatch is the SysEx explorer's signal that a placeholder group/index guess is wrong. */
export class ParamWidthMismatch extends Error {
  expected: number;
  actual: number;

  constructor(expected: number, actual: number) {
    super(`Expected ${expected} byte(s), got ${actual}`);
    this.name = 'ParamWidthMismatch';
    this.expected = expected;
    this.actual = actual;
  }
}

/** Thrown when a numeric codec is asked to handle an encoding it cannot represent (e.g. ascii). */
export class NotSupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotSupported';
  }
}

/** Encodes a non-negative integer as `width` 7-bit bytes, least-significant byte first. */
export function encode7bitLE(value: number, width: 1 | 2 | 4): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`encode7bitLE: value must be a non-negative integer, got ${value}`);
  }
  const maxValue = 2 ** (width * 7) - 1;
  if (value > maxValue) {
    throw new RangeError(`encode7bitLE: value ${value} does not fit in ${width} byte(s) (max ${maxValue})`);
  }
  const bytes: number[] = [];
  let remaining = value;
  for (let i = 0; i < width; i++) {
    bytes.push(remaining & 0x7f);
    remaining = Math.floor(remaining / 128);
  }
  return bytes;
}

/** Decodes a little-endian stream of 7-bit bytes (any length) back to an integer. */
export function decode7bitLE(bytes: readonly number[]): number {
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value += (bytes[i]! & 0x7f) * 128 ** i;
  }
  return value;
}

function isSpecialValue(def: ParamDef, value: number): boolean {
  return def.specialValues != null && Object.prototype.hasOwnProperty.call(def.specialValues, value);
}

/**
 * Encodes a UI-facing numeric value into device bytes: clamps to `def.range` (unless `value` is
 * one of `def.specialValues`), applies `def.deviceOffset`, then packs per `def.encoding`.
 * Throws `NotSupported` for `ascii` encodings — those hold text, not numbers (see `decodeAscii`).
 */
export function encodeParamValue(def: ParamDef, value: number): number[] {
  if (def.encoding.kind === 'ascii') {
    throw new NotSupported(`encodeParamValue: "${def.id}" uses ascii encoding; numeric values are not supported`);
  }
  const clamped = isSpecialValue(def, value)
    ? value
    : Math.min(def.range.max, Math.max(def.range.min, value));
  const deviceValue = clamped + (def.deviceOffset ?? 0);
  const width = encodingWidth(def.encoding) as 1 | 2 | 4;
  return encode7bitLE(deviceValue, width);
}

/**
 * Decodes device bytes into the UI-facing numeric value (inverse of `encodeParamValue`).
 * Throws `ParamWidthMismatch` when `bytes.length` doesn't match `encodingWidth(def.encoding)` —
 * the SysEx explorer relies on this to flag a wrong placeholder address.
 */
export function decodeParamValue(def: ParamDef, bytes: readonly number[]): number {
  if (def.encoding.kind === 'ascii') {
    throw new NotSupported(`decodeParamValue: "${def.id}" uses ascii encoding; use decodeAscii`);
  }
  const expected = encodingWidth(def.encoding);
  if (bytes.length !== expected) {
    throw new ParamWidthMismatch(expected, bytes.length);
  }
  const deviceValue = decode7bitLE(bytes);
  return deviceValue - (def.deviceOffset ?? 0);
}

/** Decodes fixed-length ASCII bytes to a string, dropping trailing NUL padding. */
export function decodeAscii(bytes: readonly number[]): string {
  const trimmed = Array.from(bytes);
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === 0) trimmed.pop();
  return String.fromCharCode(...trimmed);
}
