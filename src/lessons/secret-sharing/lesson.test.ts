import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { BAD_SOURCE_CASE, BYTE_PRIME, HAND_COEFFS, HAND_SECRET, SOURCE_SUPPORT, consistentCounts, interpolateAnyway, makeShares, possibleSecrets, rebuild, reconstructChecked, shareBytes, signed } from './shamir';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared between scenes', () => {
    const els = sceneElements('secret-sharing');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('secret-sharing')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: default GF(7), k = 3, secret 2, coefficients 3 and 1: shares 1 and 2 leave seven equal bars, share 3 as well leaves one bar for the secret 2', () => {
    const shares = makeShares(7n, 2n, [3n, 1n], [1n, 2n, 3n]);
    expect(consistentCounts(7, 3, shares.slice(0, 2))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(consistentCounts(7, 3, shares)).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(lesson.tryThis[0]).toContain('seven equal ones');
  });

  it('try-this 2: shares 1, 2, 3 give 42 with coefficients 3, -3, 1; 2, 4, 5 also 42; only 1 and 2 interpolate to 185', () => {
    const s = shareBytes([HAND_SECRET], 3, 5, [[...HAND_COEFFS]]);
    const a = rebuild(s, [1, 2, 3]);
    expect(a.ok && a.basis.map((b) => signed(b, BigInt(BYTE_PRIME)))).toEqual([3n, -3n, 1n]);
    expect(rebuild(s, [2, 4, 5])).toMatchObject({ ok: true, secretBytes: [42] });
    expect(interpolateAnyway(s, [1, 2])).toEqual([185]);
    expect(lesson.tryThis[1]).toContain('3, -3, 1');
    expect(lesson.tryThis[1]).toContain('185, not 42');
  });

  it('try-this 3: share 3 changed from 84 to 85 rebuilds 43 with no error; x = 0 is refused', () => {
    const shares = makeShares(BigInt(BYTE_PRIME), 42n, [...HAND_COEFFS], [1n, 2n, 3n]);
    expect(shares[2].y).toBe(84n);
    expect(reconstructChecked([shares[0], shares[1], { x: 3n, y: 85n }])).toEqual({ ok: true, secret: 43n });
    expect(reconstructChecked([{ x: 0n, y: 5n }, shares[1], shares[2]]).ok).toBe(false);
    expect(lesson.tryThis[2]).toContain('rebuilt secret is 43 with no error');
  });

  it('try-this 4: the 0-or-1 source leaves 1 of 7 secrets, the uniform source 7 of 7', () => {
    const shares = makeShares(7n, 2n, [...BAD_SOURCE_CASE.coeffs], [...BAD_SOURCE_CASE.xs]);
    expect(possibleSecrets(7, shares, SOURCE_SUPPORT['zero-or-one'](7))).toHaveLength(1);
    expect(possibleSecrets(7, shares, SOURCE_SUPPORT.uniform(7))).toHaveLength(7);
    expect(lesson.tryThis[3]).toContain('1 of 7 secrets stay possible, against 7 of 7');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas quote the exhaustive count and the hand numbers', () => {
    expect(FACTS.pairs).toBe('735');
    expect(FACTS.checks).toBe('5,145');
    expect(lesson.keyIdeas[0]).toContain('735 pairs');
    expect(lesson.keyIdeas[2]).toContain('43 instead of 42');
  });
});
