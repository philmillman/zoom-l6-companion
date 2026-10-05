/**
 * Decoder for the mixer's full-state snapshot: the reply to the editor-open request
 * (`F0 52 00 00 2B F7` -> `F0 52 00 00 2A <payload…> F7`). The official editor calls it the
 * "GlobalSettingDump". It is laid out in write-command-id order (`31 <id>` battery, auto power off,
 * mixer control, recorder, pads, CC map, pad notes, effects, AUX send points, ...).
 *
 * ALL OFFSETS IN THIS FILE ARE PAYLOAD-RELATIVE: `payload` is every byte after the `2A` opcode, as
 * produced by `parseZoomL6()` (`editorOpenState.payload`), so `payload[0]` is the layout byte
 * (0x03 = L6, 0x2E = L6max).
 *
 * Every slot below was derived from real captures (each capture starts with a fresh connect, so its
 * first snapshot reflects exactly what the previous capture left behind) or the live probe. The
 * snapshots they cite are kept as test fixtures in `__tests__/fixtures/`.
 * Slots that could only be inferred (not shown to change with a write) are `verified: false` and are
 * never emitted by `decodeSnapshot`; the UI must not display them.
 *
 * Unknown regions (documented, no slots):
 * - L6    : 1 (always 01), 14-18, 127-132.
 *           (MIDI out mode 19, MIDI channel 20, the pad Not Mapped flags 91-94 and the AUX send
 *           points 115-126 were located with a live probe: __tests__/fixtures/probe-l6-snapshot-diff.jsonl.)
 * - L6max : 1-5 and 7-12 (header), 21-27, 126-129, 152-175 (AUX channels 1-8 likely).
 */
import { decode7bitLE } from './codec';
import { getParam, type ParamId } from './params';

export type SnapshotLayoutId = 'l6' | 'l6max';

export interface SnapshotSlot {
  paramId: ParamId;
  /** Payload-relative offset of the first byte. */
  offset: number;
  /** Bytes occupied in the snapshot (can differ from the write encoding, e.g. pad notes). */
  width: 1 | 2;
  verified: boolean;
  evidence: string;
  /**
   * Pad notes only: offset of the per-pad "Not Mapped" flag byte. When it reads 01 the slot decodes
   * to the param's Not Mapped special value (128) instead of the note byte (which reads 00).
   */
  notMappedFlagOffset?: number;
}

export interface SnapshotLayout {
  id: SnapshotLayoutId;
  /** `payload[0]` for this layout. */
  layoutByte: number;
  /** Expected payload length (bytes after the 2A opcode). */
  payloadLength: number;
  slots: readonly SnapshotSlot[];
  /** The CC# mapping table: `length` consecutive bytes, one CC number per byte, from `offset`. */
  ccMap: { offset: number; length: number; verified: boolean; evidence: string };
}

type PadN = 1 | 2 | 3 | 4;
const PADS: readonly PadN[] = [1, 2, 3, 4];

/** The ten effect params, 2 bytes little-endian each, in snapshot order. */
const FX_ORDER: readonly ParamId[] = [
  'fx.hall.decay',
  'fx.hall.tone',
  'fx.room.decay',
  'fx.room.tone',
  'fx.spring.dwell',
  'fx.spring.tone',
  'fx.delay.time',
  'fx.delay.feedback',
  'fx.echo.time',
  'fx.echo.repeat',
];

function slot(paramId: ParamId, offset: number, width: 1 | 2, verified: boolean, evidence: string): SnapshotSlot {
  return { paramId, offset, width, verified, evidence };
}

function padSlots(
  base: { mode: number; level: number; note: number; noteFlag?: number },
  verified: boolean,
  evidence: { mode: string; level: string; note: string },
): SnapshotSlot[] {
  const out: SnapshotSlot[] = [];
  for (const p of PADS) {
    out.push(slot(`pad${p}.mode` as ParamId, base.mode + p - 1, 1, verified, evidence.mode));
  }
  for (const p of PADS) {
    out.push(slot(`pad${p}.level` as ParamId, base.level + p - 1, 1, verified, evidence.level));
  }
  for (const p of PADS) {
    const noteSlot = slot(`pad${p}.note` as ParamId, base.note + p - 1, 1, verified, evidence.note);
    if (base.noteFlag !== undefined) noteSlot.notMappedFlagOffset = base.noteFlag + p - 1;
    out.push(noteSlot);
  }
  return out;
}

function fxSlots(base: number, verified: boolean, evidence: string): SnapshotSlot[] {
  return FX_ORDER.map((id, i) => slot(id, base + i * 2, 2, verified, evidence));
}

const L6_SLOTS: SnapshotSlot[] = [
  slot('batteryType', 2, 1, true, 'captures/12-device-settings -> 13-recorder-mode: 01 -> 00 after battery set to Alkaline'),
  slot('autoPowerOff', 3, 1, true, '__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00): 31 02 00 -> [3] 01->00, 31 02 01 -> back to 01'),
  slot('mixerControlViaMidi', 4, 1, true, 'captures/03-mixer-control-via-midi -> 04-midi-channel: 00 -> 01 after it was left ON'),
  slot('recorderMode', 5, 1, true, '__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00): 31 04 01 -> [5] 00->01, 31 04 00 -> back to 00'),
  slot('midiOutMode', 19, 1, true, '__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00): 31 0C 01 (Thru) -> [19] 00->01, 31 0C 00 (Out) -> back to 00'),
  slot('midiChannel', 20, 1, true, '__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00): 31 0D 04 (CH5) -> [20] 00->04, 31 0D 00 (CH1) -> back to 00; value = channel - 1'),
  ...padSlots(
    { mode: 6, level: 10, note: 87, noteFlag: 91 },
    true,
    {
      mode: 'pad 1: captures/11-sound-pad -> 12-device-settings 01 -> 02 (Hold); pads 2-4 = Loop, matching the official editor display',
      level: 'matches the official editor display (all pads 0 dB = 0x31)',
      note: 'matches the official editor display (C3 D3 E3 F3 = 60 62 64 65); 1 byte in the snapshot although the write encoding is u14le. Not Mapped (__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00)): pad 1 -> [87] 00 + flag [91] 01, pad 4 -> [90] 00 + flag [94] 01',
    },
  ),
  ...fxSlots(95, true, 'captures/05-fx-hall -> 10-aux-send-point: each effect value jumped to 100 (delay/echo time 2000 = 50 0F) after being set to max'),
  // AUX send points, AUX-major: AUX1 ch1-6 at 115-120, AUX2 ch1-6 at 121-126 (00 Pre / 01 Post).
  ...([1, 2] as const).flatMap((aux) =>
    [1, 2, 3, 4, 5, 6].map((ch) =>
      slot(
        `aux${aux}SendPoint.ch${ch}` as ParamId,
        115 + (aux - 1) * 6 + (ch - 1),
        1,
        true,
        `__tests__/fixtures/probe-l6-snapshot-diff.jsonl (live L6, fw 1.00): 31 14 0${ch - 1} 0${aux - 1} 00 (Pre) flipped only this byte 01->00`,
      ),
    ),
  ),
];

const L6MAX_SLOTS: SnapshotSlot[] = [
  slot(
    'usbAudioMode',
    6,
    1,
    true,
    'captures/maxE-usb-audio-mode: snapshot byte 6 follows 31 18 00 (Stereo mix) / 31 18 01 (Multi Track): 01 -> 00 -> 01',
  ),
  ...padSlots(
    { mode: 13, level: 17, note: 122 },
    false,
    {
      mode: 'unverified: offsets inferred from the write-id order; no capture changed a pad mode on the L6max',
      level: 'unverified: offsets inferred from the write-id order; no capture changed a pad level on the L6max',
      note: 'unverified: offsets inferred from the write-id order; no capture changed a pad note on the L6max',
    },
  ),
  ...fxSlots(
    130,
    false,
    'unverified: captures/maxI-fx-sanity wrote Hall Tone = 100 but the next snapshot (maxJ) still shows 50 at 132-133',
  ),
  slot('monitorPoint', 150, 1, true, 'captures/maxB-monitor-point -> maxC-subout-point: 01 -> 00 after Monitor Point set to Pre'),
  slot('subOutPoint', 151, 1, true, 'captures/maxC-subout-point -> maxD-usb-mix-minus: 01 -> 00 after Sub-Out Point set to Pre'),
];

export const SNAPSHOT_LAYOUTS: Readonly<Record<SnapshotLayoutId, SnapshotLayout>> = Object.freeze({
  l6: {
    id: 'l6',
    layoutByte: 0x03,
    payloadLength: 133,
    slots: L6_SLOTS,
    ccMap: {
      offset: 21,
      length: 66,
      verified: true,
      evidence:
        'captures/01-connect: the 66 bytes equal the shipped L6 defaults in the order given by ccMapFieldOrder("l6") (src/config/ccMapping.ts)',
    },
  },
  l6max: {
    id: 'l6max',
    layoutByte: 0x2e,
    payloadLength: 176,
    slots: L6MAX_SLOTS,
    ccMap: {
      offset: 28,
      length: 94,
      verified: true,
      evidence:
        'captures/maxA-connect: the 94 bytes equal src/config/midiConfigL6Max.ts in the order given by ccMapFieldOrder("l6max") (src/config/ccMapping.ts)',
    },
  },
});

/** Picks the layout from `payload[0]`; null when the layout byte is unknown or the payload is too short. */
export function snapshotLayoutFor(payload: readonly number[]): SnapshotLayout | null {
  for (const layout of Object.values(SNAPSHOT_LAYOUTS)) {
    if (payload[0] === layout.layoutByte) {
      return payload.length >= layout.payloadLength ? layout : null;
    }
  }
  return null;
}

export interface DecodedSnapshot {
  layout: SnapshotLayoutId | null;
  /** Verified slots only, in the UI value domain (the param's `deviceOffset` is undone). */
  values: Partial<Record<ParamId, number>>;
  /** The raw CC# table (one CC number per entry, not range-checked), or null for an unknown layout. */
  ccMap: number[] | null;
  ccMapVerified: boolean;
}

/**
 * Decodes an editor-open snapshot payload (see the file header). Only verified slots are emitted.
 * A slot whose decoded value falls outside the registry range (and isn't a registry special value)
 * is dropped rather than shown, so an unexpected byte can't surface as a bogus setting.
 */
export function decodeSnapshot(payload: readonly number[]): DecodedSnapshot {
  const layout = snapshotLayoutFor(payload);
  if (!layout) return { layout: null, values: {}, ccMap: null, ccMapVerified: false };

  const values: Partial<Record<ParamId, number>> = {};
  for (const s of layout.slots) {
    if (!s.verified) continue;
    const def = getParam(s.paramId);
    if (s.notMappedFlagOffset !== undefined && payload[s.notMappedFlagOffset] === 0x01) {
      // Pad set to "Not Mapped": surface the registry's special value (128) rather than the 00 note byte.
      const notMapped = Object.keys(def.specialValues ?? {}).map(Number).find((v) => def.specialValues?.[v] === 'Not Mapped');
      if (notMapped !== undefined) values[s.paramId] = notMapped;
      continue;
    }
    const raw = decode7bitLE(payload.slice(s.offset, s.offset + s.width));
    const value = raw - (def.deviceOffset ?? 0);
    const inRange = value >= def.range.min && value <= def.range.max;
    const special = def.specialValues != null && Object.prototype.hasOwnProperty.call(def.specialValues, value);
    if (inRange || special) values[s.paramId] = value;
  }

  const { offset, length, verified } = layout.ccMap;
  return {
    layout: layout.id,
    values,
    ccMap: payload.slice(offset, offset + length),
    ccMapVerified: verified,
  };
}

// ── Sound pad files (separate GET reads, not part of the snapshot) ────────────────────────────

export interface PadFileInfo {
  assigned: boolean;
  fileName: string | null;
}

/**
 * `46 00 <pad>` reply values (`45 00 <pad> <v0> <v1>`): `[00 01]` = a file is assigned, `[00 00]` = none.
 */
export function decodePadAssigned(values: readonly number[]): boolean {
  return values.length >= 2 && decode7bitLE(values.slice(0, 2)) !== 0;
}

/**
 * `46 02 <pad>` reply values (`45 02 <pad> <values…>`): the assigned file name, or null if none.
 *
 * Format (decoded from captures/02-midi-out-mode.txt, ground truth `260303_190013.WAV` /
 * `260303_190137.WAV`): a 4-byte header `[h0 h1 lenLo lenHi]` where `len` (7-bit LE) is the number of
 * packed bytes that follow; `7F 7F 00 00` = no file. The packed bytes are the usual 8-to-7-bit
 * packing: groups of one MSB byte followed by up to 7 data bytes. After unpacking, the bytes are
 * UTF-16LE text.
 *
 * ASSUMPTION: the MSB bit order is unconfirmed (only ASCII has been seen, so every MSB byte was 0).
 * We assume bit k of the MSB byte is the high bit of data byte k (the Korg-style convention).
 */
export function decodePadFileName(values: readonly number[]): string | null {
  if (values.length < 4) return null;
  if (values[0] === 0x7f && values[1] === 0x7f) return null;

  const len = decode7bitLE(values.slice(2, 4));
  const packed = values.slice(4, 4 + len);

  const unpacked: number[] = [];
  for (let i = 0; i < packed.length; i += 8) {
    const msb = packed[i]!;
    const group = packed.slice(i + 1, i + 8);
    for (let k = 0; k < group.length; k++) {
      unpacked.push((group[k]! & 0x7f) | (((msb >> k) & 1) << 7));
    }
  }

  let name = '';
  for (let i = 0; i + 1 < unpacked.length; i += 2) {
    name += String.fromCharCode(unpacked[i]! | (unpacked[i + 1]! << 8));
  }
  name = name.replace(/\0+$/, '');
  return name.length > 0 ? name : null;
}
