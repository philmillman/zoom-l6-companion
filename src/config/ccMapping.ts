/**
 * Maps the mixer's CC# table (from the state snapshot, see `midi/sysex/zoomL6/stateSnapshot.ts`) onto
 * the app's CC configs (`ChannelControls[]` / `GlobalControls`).
 *
 * The snapshot stores one CC number per byte, in a fixed order. `ccMapFieldOrder` is that order,
 * verified by the real captures: the default table equals the shipped defaults in
 * `midiConfig.ts` (L6, captures/01-connect) and `midiConfigL6Max.ts` (L6max, captures/maxA-connect).
 *
 * The caller must pass configs that belong to the same layout (L6 configs with 'l6', L6max configs
 * with 'l6max'); the order only means something for the matching mixer.
 */
import type { ChannelControls, GlobalControls, MIDIControl } from './midiConfig';
import type { SnapshotLayoutId } from '../midi/sysex/zoomL6/stateSnapshot';

export type ChannelCcField =
  | 'eq.high'
  | 'eq.midFreq'
  | 'eq.mid'
  | 'eq.low'
  | 'subMix'
  | 'aux1'
  | 'aux2'
  | 'efxSend'
  | 'pan'
  | 'volume'
  | 'mute'
  | 'monoX2'
  | 'usb12'
  | 'usb34';

export type CcMapTarget =
  | { kind: 'channel'; channel: number; field: ChannelCcField }
  | { kind: 'global'; field: 'efxType' | 'compressor' };

/** Smallest / largest CC number accepted from the mixer; anything else is treated as "not mapped / unknown". */
const CC_MIN = 1;
const CC_MAX = 119;

const L6_BANK_FIELDS: readonly ChannelCcField[] = [
  'eq.high', 'eq.midFreq', 'eq.mid', 'eq.low', 'aux1', 'aux2', 'efxSend', 'pan', 'volume', 'mute',
];
const L6MAX_BANK_FIELDS: readonly ChannelCcField[] = [
  'eq.high', 'eq.midFreq', 'eq.mid', 'eq.low', 'subMix', 'aux1', 'aux2', 'efxSend', 'pan', 'volume', 'mute',
];

function channelTargets(fields: readonly ChannelCcField[], channels: number): CcMapTarget[] {
  const out: CcMapTarget[] = [];
  for (const field of fields) {
    for (let channel = 1; channel <= channels; channel++) out.push({ kind: 'channel', channel, field });
  }
  return out;
}

const ORDERS: Readonly<Record<SnapshotLayoutId, readonly CcMapTarget[]>> = {
  // 66 entries: [eq.high, eq.midFreq, eq.mid, eq.low, aux1, aux2, efxSend, pan, volume, mute] x ch1..6,
  // monoX2 ch3/ch4, usb12 (ch5), usb34 (ch6), efxType, compressor.
  l6: [
    ...channelTargets(L6_BANK_FIELDS, 6),
    { kind: 'channel', channel: 3, field: 'monoX2' },
    { kind: 'channel', channel: 4, field: 'monoX2' },
    { kind: 'channel', channel: 5, field: 'usb12' },
    { kind: 'channel', channel: 6, field: 'usb34' },
    { kind: 'global', field: 'efxType' },
    { kind: 'global', field: 'compressor' },
  ],
  // 94 entries: [eq.high, eq.midFreq, eq.mid, eq.low, subMix, aux1, aux2, efxSend, pan, volume, mute] x ch1..8,
  // monoX2 ch5/ch6, usb12 (ch7), usb34 (ch8), efxType, compressor.
  l6max: [
    ...channelTargets(L6MAX_BANK_FIELDS, 8),
    { kind: 'channel', channel: 5, field: 'monoX2' },
    { kind: 'channel', channel: 6, field: 'monoX2' },
    { kind: 'channel', channel: 7, field: 'usb12' },
    { kind: 'channel', channel: 8, field: 'usb34' },
    { kind: 'global', field: 'efxType' },
    { kind: 'global', field: 'compressor' },
  ],
};

/** The app-config target each CC table entry maps to, in snapshot order (entry i -> result[i]). */
export function ccMapFieldOrder(layout: SnapshotLayoutId): readonly CcMapTarget[] {
  return ORDERS[layout];
}

function findControl(
  target: CcMapTarget,
  channelControls: ChannelControls[],
  globalControls: GlobalControls,
): MIDIControl | undefined {
  if (target.kind === 'global') return globalControls[target.field];
  const strip = channelControls.find((c) => c.channel === target.channel);
  if (!strip) return undefined;
  switch (target.field) {
    case 'eq.high': return strip.controls.eq.high;
    case 'eq.midFreq': return strip.controls.eq.midFreq;
    case 'eq.mid': return strip.controls.eq.mid;
    case 'eq.low': return strip.controls.eq.low;
    default: return strip.controls[target.field];
  }
}

/**
 * Returns deep copies of the configs with the mixer's CC numbers applied. Entries outside 1..119
 * ("Not Mapped" or otherwise unknown), missing entries and targets absent from the app config are
 * skipped (the app's value is kept) and counted in `skipped`. `changed` is true if any CC number
 * differed from the app's.
 */
export function applyMixerCcMap(
  ccMap: readonly number[],
  layout: SnapshotLayoutId,
  channelControls: ChannelControls[],
  globalControls: GlobalControls,
): { channelControls: ChannelControls[]; globalControls: GlobalControls; changed: boolean; skipped: number } {
  const nextChannels = structuredClone(channelControls);
  const nextGlobals = structuredClone(globalControls);
  let changed = false;
  let skipped = 0;

  const order = ccMapFieldOrder(layout);
  for (let i = 0; i < order.length; i++) {
    const cc = ccMap[i];
    const control = findControl(order[i]!, nextChannels, nextGlobals);
    if (cc === undefined || !Number.isInteger(cc) || cc < CC_MIN || cc > CC_MAX || !control) {
      skipped++;
      continue;
    }
    if (control.cc !== cc) {
      control.cc = cc;
      changed = true;
    }
  }

  return { channelControls: nextChannels, globalControls: nextGlobals, changed, skipped };
}
