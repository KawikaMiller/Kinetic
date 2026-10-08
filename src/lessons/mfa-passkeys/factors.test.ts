import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { factorsCaption, pathsCaption, skewAdvice } from './captions';
import { FACTORS, FACTOR_PRESETS, PATHS, STRENGTH_RANK, isMultiFactor, kindsOf, weakestOf, type Strength } from './factors';

const subsets = <T,>(xs: readonly T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);

describe('factors', () => {
  it('multi-factor means at least two different kinds, for all 32 subsets', () => {
    for (const ids of subsets(FACTORS.map((f) => f.id))) {
      const distinct = new Set(ids.map((id) => FACTORS.find((f) => f.id === id)!.kind)).size;
      expect(isMultiFactor(ids)).toBe(distinct >= 2);
      expect(kindsOf(ids).length).toBe(distinct);
    }
  });

  it('presets: password + security question is two of one kind; the others are two kinds', () => {
    const verdicts = Object.fromEntries(FACTOR_PRESETS.map((p) => [p.id, isMultiFactor(p.ids)]));
    expect(verdicts).toEqual({ 'two-know': false, app: true, key: true });
  });

  it('the default preset (the first) shows the misconception', () => {
    expect(isMultiFactor(FACTOR_PRESETS[0].ids)).toBe(false);
  });

  it('captions agree with the verdict for every subset', () => {
    for (const ids of subsets(FACTORS.map((f) => f.id))) {
      const text = expectCaption(factorsCaption(ids));
      if (ids.length) expect(text.startsWith(isMultiFactor(ids) ? 'Multi-factor' : 'Not multi-factor')).toBe(true);
    }
  });
});

describe('the weakest way in sets the strength, over every subset of the 7 paths', () => {
  const order: Strength[] = ['weak', 'phishable', 'resistant'];

  it('equals the lowest-ranked enabled path, found by sorting', () => {
    for (const ids of subsets(PATHS.map((p) => p.id))) {
      const enabled = PATHS.filter((p) => ids.includes(p.id)).sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]);
      expect(weakestOf(ids)).toBe(enabled.length ? enabled[0].strength : null);
    }
  });

  it('adding a path never raises the strength', () => {
    for (const ids of subsets(PATHS.map((p) => p.id))) {
      for (const p of PATHS) {
        const before = weakestOf(ids);
        const after = weakestOf([...new Set([...ids, p.id])]);
        if (before && after) expect(order.indexOf(after)).toBeLessThanOrEqual(order.indexOf(before));
      }
    }
  });

  it('a passkey with only an SMS fallback is as weak as SMS', () => {
    expect(weakestOf(['passkey', 'sms'])).toBe('weak');
    expect(weakestOf(['passkey', 'second-passkey'])).toBe('resistant');
    expect(weakestOf(['passkey', 'backup-codes'])).toBe('phishable');
    expect(weakestOf([])).toBeNull();
  });

  it('captions name the weakest enabled paths', () => {
    for (const ids of subsets(PATHS.map((p) => p.id))) {
      const text = expectCaption(pathsCaption(ids));
      const w = weakestOf(ids);
      if (w === null) expect(text).toContain('no way in');
      else for (const p of PATHS.filter((x) => ids.includes(x.id) && x.strength === w)) expect(text).toContain(p.label);
    }
  });
});

describe('skew captions', () => {
  it('say always / sometimes / refused where the model does', () => {
    for (let s = -120; s <= 120; s += 5) {
      const text = expectCaption(skewAdvice(s));
      const a = Math.abs(s);
      if (s === 0) expect(text).toContain('agree');
      else if (a <= 30) expect(text).toContain('always accepted');
      else if (a >= 60) expect(text).toContain('refused');
      else expect(text).toContain('sometimes accepted');
    }
  });
});
