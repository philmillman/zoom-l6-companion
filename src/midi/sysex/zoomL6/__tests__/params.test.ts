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
