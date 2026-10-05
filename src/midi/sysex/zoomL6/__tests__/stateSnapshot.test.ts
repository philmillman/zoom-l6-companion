import { describe, it, expect } from 'vitest';
import { firstPayload, loadCapture, loadProbe } from './captureFixtures';
import {
  SNAPSHOT_LAYOUTS,
  decodePadAssigned,
  decodePadFileName,
  decodeSnapshot,
  snapshotLayoutFor,
} from '../stateSnapshot';

function paramValues(prefix: string, group: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const m of loadCapture(prefix)) {
    if (m.kind === 'paramValue' && m.group === group) out.set(m.index, m.values);
  }
  return out;
}

describe('snapshot layouts', () => {
  it('selects the layout from the layout byte', () => {
    expect(snapshotLayoutFor(firstPayload('01-'))?.id).toBe('l6');
    expect(snapshotLayoutFor(firstPayload('maxA-'))?.id).toBe('l6max');
  });

  it('returns null for an unknown layout byte or a too-short payload', () => {
    expect(snapshotLayoutFor([0x7e, 1, 2, 3])).toBeNull();
    expect(snapshotLayoutFor(firstPayload('01-').slice(0, 100))).toBeNull();
    expect(snapshotLayoutFor([])).toBeNull();
  });

  it('keeps every slot and the CC map inside the payload without overlap', () => {
    for (const layout of Object.values(SNAPSHOT_LAYOUTS)) {
      const used = new Set<number>();
      const mark = (from: number, len: number) => {
        for (let o = from; o < from + len; o++) {
          expect(used.has(o), `${layout.id} offset ${o} used twice`).toBe(false);
          used.add(o);
        }
      };
      for (const s of layout.slots) mark(s.offset, s.width);
      mark(layout.ccMap.offset, layout.ccMap.length);
      expect(Math.max(...used)).toBeLessThan(layout.payloadLength);
    }
  });

  it('decodes an unknown layout to nothing', () => {
    expect(decodeSnapshot([0x7e, 0, 0, 0])).toEqual({ layout: null, values: {}, ccMap: null, ccMapVerified: false });
  });
});

describe('decodeSnapshot (L6 captures)', () => {
  it('reads mixerControlViaMidi left ON by capture 03 (capture 04 start)', () => {
    expect(decodeSnapshot(firstPayload('03-')).values.mixerControlViaMidi).toBe(0);
    expect(decodeSnapshot(firstPayload('04-')).values.mixerControlViaMidi).toBe(1);
  });

  it('reads battery Alkaline after capture 12 (capture 13 start)', () => {
    expect(decodeSnapshot(firstPayload('12-')).values.batteryType).toBe(1);
    expect(decodeSnapshot(firstPayload('13-')).values.batteryType).toBe(0);
  });

  it('reads pad modes, levels and notes', () => {
    expect(decodeSnapshot(firstPayload('11-')).values['pad1.mode']).toBe(1);
    const v = decodeSnapshot(firstPayload('12-')).values;
    expect(v['pad1.mode']).toBe(2);
    expect(v['pad2.mode']).toBe(1);
    expect(v['pad3.mode']).toBe(1);
    expect(v['pad4.mode']).toBe(1);
    for (const p of [1, 2, 3, 4]) expect(v[`pad${p}.level` as 'pad1.level']).toBe(0x31);
    expect([1, 2, 3, 4].map((p) => v[`pad${p}.note` as 'pad1.note'])).toEqual([60, 62, 64, 65]);
  });

  it('reads the ten effect params', () => {
    const room = decodeSnapshot(firstPayload('06-')).values;
    expect(room['fx.hall.decay']).toBe(100);
    expect(room['fx.hall.tone']).toBe(100);
    expect(room['fx.room.decay']).toBe(50);

    const echo = decodeSnapshot(firstPayload('10-')).values;
    expect(echo['fx.delay.time']).toBe(2000);
    expect(echo['fx.delay.feedback']).toBe(100);
    expect(echo['fx.echo.time']).toBe(2000);
    expect(echo['fx.echo.repeat']).toBe(100);

    const fresh = decodeSnapshot(firstPayload('01-')).values;
    expect(fresh['fx.hall.decay']).toBe(40);
    expect(fresh['fx.hall.tone']).toBe(50);
    expect(fresh['fx.spring.dwell']).toBe(90);
    expect(fresh['fx.spring.tone']).toBe(30);
  });

  it('never emits params outside the L6 layout', () => {
    const v = decodeSnapshot(firstPayload('13-')).values;
    // L6max-only params have no L6 slot.
    for (const id of ['monitorPoint', 'subOutPoint', 'usbAudioMode', 'aux1SendPoint.ch7', 'pad1.clockSync']) {
      expect(v).not.toHaveProperty(id);
    }
  });

  it('returns the raw CC table and flags it verified', () => {
    const d = decodeSnapshot(firstPayload('01-'));
    expect(d.layout).toBe('l6');
    expect(d.ccMap).toHaveLength(66);
    expect(d.ccMap!.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.ccMap![65]).toBe(119);
    expect(d.ccMapVerified).toBe(true);
  });
});

describe('decodeSnapshot (L6max captures)', () => {
  it('reads monitorPoint and subOutPoint', () => {
    const b = decodeSnapshot(firstPayload('maxB-')).values;
    expect(b.monitorPoint).toBe(1);
    expect(b.subOutPoint).toBe(1);
    expect(decodeSnapshot(firstPayload('maxC-')).values.monitorPoint).toBe(0);
    expect(decodeSnapshot(firstPayload('maxD-')).values.subOutPoint).toBe(0);
  });

  it('follows usbAudioMode across the maxE reconnects', () => {
    const modes = loadCapture('maxE-')
      .filter((m) => m.kind === 'editorOpenState')
      .map((m) => (m.kind === 'editorOpenState' ? decodeSnapshot(m.payload).values.usbAudioMode : undefined));
    expect(modes).toEqual([1, 1, 0, 1]);
  });

  it('does not emit the unverified pad and effect slots', () => {
    const d = decodeSnapshot(firstPayload('maxJ-'));
    expect(d.layout).toBe('l6max');
    const ids = Object.keys(d.values);
    expect(ids.filter((id) => id.startsWith('pad') || id.startsWith('fx.'))).toEqual([]);
    expect(ids.sort()).toEqual(['monitorPoint', 'subOutPoint', 'usbAudioMode']);
  });

  it('returns the raw 94-entry CC table', () => {
    const d = decodeSnapshot(firstPayload('maxA-'));
    expect(d.ccMap).toHaveLength(94);
    expect(d.ccMap![0]).toBe(1);
    expect(d.ccMap![93]).toBe(119);
    expect(d.ccMapVerified).toBe(true);
  });
});

describe('sound pad file reads (capture 02-midi-out-mode)', () => {
  it('decodes assigned flags', () => {
    const assigned = paramValues('02-', 0);
    expect(decodePadAssigned(assigned.get(0)!)).toBe(true);
    expect(decodePadAssigned(assigned.get(1)!)).toBe(true);
    expect(decodePadAssigned(assigned.get(2)!)).toBe(false);
    expect(decodePadAssigned(assigned.get(3)!)).toBe(false);
    expect(decodePadAssigned([0, 1])).toBe(true);
    expect(decodePadAssigned([0, 0])).toBe(false);
    expect(decodePadAssigned([])).toBe(false);
  });

  it('decodes file names, and none -> null', () => {
    const names = paramValues('02-', 2);
    expect(decodePadFileName(names.get(0)!)).toBe('260303_190013.WAV');
    expect(decodePadFileName(names.get(1)!)).toBe('260303_190137.WAV');
    expect(decodePadFileName(names.get(2)!)).toBeNull();
    expect(decodePadFileName(names.get(3)!)).toBeNull();
  });

  it('is tolerant of truncated / empty input', () => {
    expect(decodePadFileName([])).toBeNull();
    expect(decodePadFileName([0x7f, 0x7f, 0, 0])).toBeNull();
    expect(decodePadFileName([0, 0, 0, 0])).toBeNull();
  });

  it('applies the assumed MSB bit order to non-ASCII bytes', () => {
    // 'é' (U+00E9) as UTF-16LE = E9 00; bit 0 of the MSB byte carries the high bit of data byte 0.
    expect(decodePadFileName([0, 0, 3, 0, 0b0000001, 0x69, 0x00])).toBe('é');
  });
});


// Live probe of a real L6 (fixtures/probe-l6-snapshot-diff.jsonl): each step wrote one setting with a
// verified `31 <id>` command and re-read the snapshot, then put the setting back.
describe('decodeSnapshot (live L6 probe)', () => {
  const probe = loadProbe();
  const at = (label: string) => {
    const payload = probe.get(label);
    if (!payload) throw new Error(`probe step missing: ${label}`);
    return decodeSnapshot(payload).values;
  };

  it('reads the original state', () => {
    const v = at('S0');
    expect(v.midiOutMode).toBe(0);
    expect(v.midiChannel).toBe(1);
    expect(v.autoPowerOff).toBe(1);
    expect(v.recorderMode).toBe(0);
    for (let ch = 1; ch <= 6; ch++) {
      expect(v[`aux1SendPoint.ch${ch}` as keyof typeof v]).toBe(1);
      expect(v[`aux2SendPoint.ch${ch}` as keyof typeof v]).toBe(1);
    }
    expect([v['pad1.note'], v['pad2.note'], v['pad3.note'], v['pad4.note']]).toEqual([60, 62, 64, 65]);
  });

  it('tracks MIDI out mode, MIDI channel, auto power off and recorder mode', () => {
    expect(at('out=Thru').midiOutMode).toBe(1);
    expect(at('ch=5').midiChannel).toBe(5);
    expect(at('apo=10h').autoPowerOff).toBe(0);
    expect(at('rec=MasterOnly').recorderMode).toBe(1);
  });

  it('maps every AUX send point to its own byte (AUX-major)', () => {
    for (const aux of [1, 2]) {
      for (let ch = 1; ch <= 6; ch++) {
        const v = at(`AUX${aux} ch${ch}=Pre`);
        expect(v[`aux${aux}SendPoint.ch${ch}` as keyof typeof v]).toBe(0);
        // Every other AUX point is still Post.
        for (const a of [1, 2]) {
          for (let c = 1; c <= 6; c++) {
            if (a === aux && c === ch) continue;
            expect(v[`aux${a}SendPoint.ch${c}` as keyof typeof v]).toBe(1);
          }
        }
      }
    }
  });

  it('decodes a Not Mapped pad as the special value 128', () => {
    expect(at('pad4=NotMapped')['pad4.note']).toBe(128);
    expect(at('pad1=NotMapped')['pad1.note']).toBe(128);
    expect(at('pad4=F3(65)')['pad4.note']).toBe(65);
    expect(at('pad1=C3(60)')['pad1.note']).toBe(60);
  });
});
