import { describe, it, expect } from 'vitest';
import {
  zoomL6ParamList,
  addressKey,
  getParam,
  listParams,
  findParamByAddress,
  EFFECT_PARAM_IDS,
  PLACEHOLDER_GROUP,
} from '../params';

function isPlaceholderAddress(p: (typeof zoomL6ParamList)[number]): boolean {
  return p.address.scheme === 'param' && p.address.group === PLACEHOLDER_GROUP;
}

describe('zoomL6ParamList', () => {
  it('is non-empty', () => {
    expect(zoomL6ParamList.length).toBeGreaterThan(0);
  });

  it('every parameter has a unique address', () => {
    const keys = zoomL6ParamList.map((p) => addressKey(p.address));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every verified entry documents its evidence', () => {
    for (const p of zoomL6ParamList) {
      if (p.verified) {
        expect(p.evidence, `param "${p.id}" is verified but has no evidence`).toBeTruthy();
      }
    }
  });

  it('every non-placeholder entry is verified, or explains itself', () => {
    for (const p of zoomL6ParamList) {
      if (!isPlaceholderAddress(p)) {
        const explains = p.verified || Boolean(p.evidence) || Boolean(p.description);
        expect(explains, `param "${p.id}" has a real address but is unverified with no explanation`).toBe(true);
      }
    }
  });

  it('every parameter declares at least one supported model', () => {
    for (const p of zoomL6ParamList) {
      expect(p.models.length).toBeGreaterThan(0);
    }
  });

  it('findParamByAddress resolves the firmwareVersion identity address', () => {
    const found = findParamByAddress({ scheme: 'identity' });
    expect(found?.id).toBe('firmwareVersion');
  });

  it('listParams filters by model', () => {
    const l6max = listParams({ model: 'l6max' });
    expect(l6max.length).toBeGreaterThan(0);
    expect(l6max.every((p) => p.models.includes('l6max'))).toBe(true);
  });

  it('listParams filters by verifiedOnly', () => {
    const verified = listParams({ verifiedOnly: true });
    expect(verified.every((p) => p.verified)).toBe(true);
    expect(verified.some((p) => p.id === 'firmwareVersion')).toBe(true);
  });
});

describe('EFFECT_PARAM_IDS', () => {
  it('references two real, existing parameters per effect type', () => {
    for (const ids of Object.values(EFFECT_PARAM_IDS)) {
      expect(ids).toHaveLength(2);
      for (const id of ids) {
        expect(() => getParam(id)).not.toThrow();
      }
    }
  });
});

describe('getParam', () => {
  it('throws for an unknown id', () => {
    // @ts-expect-error deliberately invalid id
    expect(() => getParam('not-a-real-param')).toThrow();
  });
});

describe('verified session-command entries', () => {
  /** Expected fixed-argument-prefix length per session command id (excludes the encoded value). */
  const EXPECTED_PREFIX_LEN: Record<number, number> = {
    0x01: 0, // battery type
    0x02: 0, // auto power off
    0x03: 0, // mixer control via MIDI
    0x04: 0, // recorder mode
    0x06: 1, // pad mode      → [pad]
    0x07: 1, // pad level     → [pad]
    0x0c: 0, // MIDI out mode
    0x0d: 0, // MIDI channel
    0x0f: 1, // pad note      → [pad]
    0x13: 2, // effect param  → [effect, param]
    0x14: 2, // AUX send point → [ch, aux]
    0x15: 0, // USB mix minus (L6max)
    0x17: 1, // pad clock sync (L6max) → [pad]
    0x18: 0, // USB audio mode (L6max)
    0x19: 0, // monitor point (L6max)
    0x1a: 0, // sub-out point (L6max)
  };

  const verifiedSession = zoomL6ParamList.filter(
    (p) => p.verified && p.address.scheme === 'session',
  );

  it('covers every documented setting', () => {
    // L6 (captures 02-14): 3 MIDI + 3 system/recorder + 10 fx + 12 aux (ch1-6 × 2)
    //   + 12 pads (mode/level/note × 4) = 40.
    // L6max (captures maxB-maxG): 4 monitor/USB + 4 aux (ch7-8 × 2) + 4 pad clock sync = 12.
    expect(verifiedSession).toHaveLength(52);
  });

  it('each has a prefix length consistent with its command id and an evidence string', () => {
    for (const p of verifiedSession) {
      if (p.address.scheme !== 'session') continue;
      const expected = EXPECTED_PREFIX_LEN[p.address.id];
      expect(expected, `unexpected session id 0x${p.address.id.toString(16)} for "${p.id}"`).toBeDefined();
      const prefixLen = p.address.prefix?.length ?? 0;
      expect(prefixLen, `param "${p.id}" prefix length`).toBe(expected);
      for (const b of p.address.prefix ?? []) {
        expect(Number.isInteger(b) && b >= 0 && b <= 0x7f, `param "${p.id}" prefix byte ${b}`).toBe(true);
      }
      expect(p.evidence, `param "${p.id}" evidence`).toBeTruthy();
    }
  });
});
