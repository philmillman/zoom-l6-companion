import { describe, it, expect } from 'vitest';
import { firstPayload } from '../../midi/sysex/zoomL6/__tests__/captureFixtures';
import { decodeSnapshot } from '../../midi/sysex/zoomL6/stateSnapshot';
import { applyMixerCcMap, ccMapFieldOrder } from '../ccMapping';
import { channelControls, globalControls } from '../midiConfig';
import { channelControlsL6Max, globalControlsL6Max } from '../midiConfigL6Max';

function firstCcMap(prefix: string): number[] {
  return decodeSnapshot(firstPayload(prefix)).ccMap!;
}

describe('ccMapFieldOrder', () => {
  it('has one target per CC table entry', () => {
    expect(ccMapFieldOrder('l6')).toHaveLength(66);
    expect(ccMapFieldOrder('l6max')).toHaveLength(94);
  });

  it('has unique targets', () => {
    for (const layout of ['l6', 'l6max'] as const) {
      const keys = ccMapFieldOrder(layout).map((t) => (t.kind === 'global' ? t.field : `${t.channel}:${t.field}`));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('applyMixerCcMap', () => {
  it('the L6 default table (capture 01) reproduces the shipped defaults', () => {
    const r = applyMixerCcMap(firstCcMap('01-'), 'l6', channelControls, globalControls);
    expect(r.changed).toBe(false);
    expect(r.skipped).toBe(0);
    expect(r.channelControls).toEqual(channelControls);
    expect(r.globalControls).toEqual(globalControls);
  });

  it('the L6max default table (maxA) reproduces the shipped defaults', () => {
    const r = applyMixerCcMap(firstCcMap('maxA-'), 'l6max', channelControlsL6Max, globalControlsL6Max);
    expect(r.changed).toBe(false);
    expect(r.skipped).toBe(0);
    expect(r.channelControls).toEqual(channelControlsL6Max);
    expect(r.globalControls).toEqual(globalControlsL6Max);
  });

  it('applies a modified entry and leaves the inputs untouched', () => {
    const table = firstCcMap('01-').slice();
    table[0] = 20;
    const r = applyMixerCcMap(table, 'l6', channelControls, globalControls);
    expect(r.changed).toBe(true);
    expect(r.skipped).toBe(0);
    expect(r.channelControls[0]!.controls.eq.high.cc).toBe(20);
    expect(r.channelControls[1]!.controls.eq.high.cc).toBe(2);
    expect(channelControls[0]!.controls.eq.high.cc).toBe(1);
    expect(r.channelControls).not.toBe(channelControls);
    expect(r.channelControls[0]).not.toBe(channelControls[0]);
  });

  it('applies the order to the L6max-only and global targets', () => {
    const order = ccMapFieldOrder('l6max');
    const table = firstCcMap('maxA-').slice();
    const subMixCh8 = order.findIndex((t) => t.kind === 'channel' && t.channel === 8 && t.field === 'subMix');
    const comp = order.findIndex((t) => t.kind === 'global' && t.field === 'compressor');
    table[subMixCh8] = 100;
    table[comp] = 101;
    const r = applyMixerCcMap(table, 'l6max', channelControlsL6Max, globalControlsL6Max);
    expect(r.channelControls[7]!.controls.subMix!.cc).toBe(100);
    expect(r.globalControls.compressor.cc).toBe(101);
    expect(r.changed).toBe(true);
  });

  it('skips entries outside 1..119 and keeps the app value', () => {
    const table = firstCcMap('01-').slice();
    table[0] = 0;
    table[1] = 120;
    table[2] = 127;
    const r = applyMixerCcMap(table, 'l6', channelControls, globalControls);
    expect(r.skipped).toBe(3);
    expect(r.changed).toBe(false);
    expect(r.channelControls[0]!.controls.eq.high.cc).toBe(1);
    expect(r.channelControls[1]!.controls.eq.high.cc).toBe(2);
  });

  it('counts missing table entries and absent config targets as skipped', () => {
    const short = applyMixerCcMap(firstCcMap('01-').slice(0, 60), 'l6', channelControls, globalControls);
    expect(short.skipped).toBe(6);
    // L6 configs have no subMix / ch7-8: an L6max table applied to them skips those targets.
    const mismatched = applyMixerCcMap(firstCcMap('maxA-'), 'l6max', channelControls, globalControls);
    expect(mismatched.skipped).toBeGreaterThan(0);
  });
});
