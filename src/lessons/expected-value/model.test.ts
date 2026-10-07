import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { logCheckpoints, runningStats } from '../../core/stats';
import { captionText as text } from '../../core/testing/captions';
import { drawCaption, exactLines, retryCaption, variableCaption } from './frames';
import lesson from './index';
import {
  DEFAULT_TABLE, canEqual, draw, drawsFor, exactFractions, exactMoments, expectedAttempts, geometricCap, modes,
  pairSummary, parseTable, pmfOf, type Params, type VarId,
} from './model';

const base = (patch: Partial<Params> = {}): Params => ({
  successPct: 30, failPct: 50, cap: 3, custom: pmfOf('die', {} as Params), ...patch,
});

/** Independent reference: E and Var by brute force over the 6 or 36 equally likely dice outcomes. */
function bruteDice(f: (a: number, b: number) => number, two: boolean) {
  const xs: number[] = [];
  for (let a = 1; a <= 6; a++) {
    if (!two) xs.push(f(a, 0));
    else for (let b = 1; b <= 6; b++) xs.push(f(a, b));
  }
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { mean: m, variance: xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length };
}

describe('exact E and Var match closed forms', () => {
  it('a die: 3.5 and 35/12; two dice: 7 and 35/6; top + bottom: 7 and 0', () => {
    const die = exactMoments('die', base());
    expect(die.mean).toBeCloseTo(3.5, 14);
    expect(die.variance).toBeCloseTo(35 / 12, 14);
    expect(exactFractions(pmfOf('die', base()))).toEqual({ mean: '7/2', variance: '35/12' });
    const two = exactMoments('two-dice', base());
    expect(two.mean).toBeCloseTo(7, 14);
    expect(two.variance).toBeCloseTo(35 / 6, 14);
    expect(exactFractions(pmfOf('two-dice', base()))).toEqual({ mean: '7', variance: '35/6' });
    expect(bruteDice((a, b) => a + b, true).variance).toBeCloseTo(two.variance, 12);
    expect(exactMoments('opposite', base())).toEqual({ mean: 7, variance: 0 });
  });

  it('geometric: E = 1/p and Var = (1 − p)/p², and the shown pmf (to its cap) agrees to 0.1%', () => {
    for (let pct = 5; pct <= 90; pct += 5) {
      const p = pct / 100;
      const m = exactMoments('geometric', base({ successPct: pct }));
      expect(m.mean).toBeCloseTo(1 / p, 12);
      expect(m.variance).toBeCloseTo((1 - p) / p ** 2, 12);
      const pmf = pmfOf('geometric', base({ successPct: pct }));
      expect(pmf.probs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(0.999);
      expect(geometricCap(p)).toBeGreaterThan(1 / p);
      expect(modes(pmf)).toEqual([1]);
    }
  });

  it('capped retries: E = Σ qⁱ for i = 0..r, and 0.5 with r = 3 is 1.875', () => {
    for (let q = 0; q <= 95; q += 5) {
      for (let r = 0; r <= 10; r++) {
        const pmf = pmfOf('retries', base({ failPct: q, cap: r }));
        expect(pmf.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        let sum = 0;
        for (let i = 0; i <= r; i++) sum += (q / 100) ** i;
        expect(exactMoments('retries', base({ failPct: q, cap: r })).mean).toBeCloseTo(sum, 12);
        expect(expectedAttempts(q / 100, r)).toBeCloseTo(sum, 12);
      }
    }
    expect(expectedAttempts(0.5, 3)).toBe(1.875);
  });

  it('linearity holds on the dependent pair and variance does not add there; both add when independent', () => {
    const dep = pairSummary(true);
    expect(dep.esum).toBeCloseTo(dep.ex + dep.ey, 12);
    expect(dep.vsum).toBeCloseTo(0, 12);
    expect(dep.vx + dep.vy).toBeCloseTo(35 / 6, 12);
    expect(Math.abs(dep.vsum - (dep.vx + dep.vy))).toBeGreaterThan(1);
    const ind = pairSummary(false);
    expect(ind.esum).toBeCloseTo(7, 12);
    expect(ind.vsum).toBeCloseTo(ind.vx + ind.vy, 12);
  });
});

describe('sampling', () => {
  const ids: VarId[] = ['die', 'two-dice', 'opposite', 'geometric', 'retries', 'custom'];
  it('10,000 seeded draws land within 3 standard errors of E for every variable (fixed seed)', () => {
    for (const id of ids) {
      const prm = base({ custom: (parseTable(DEFAULT_TABLE) as { ok: true; pmf: Params['custom'] }).pmf });
      const m = exactMoments(id, prm);
      const xs = drawsFor(id, prm, 1, 10_000);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(Math.abs(mean - m.mean)).toBeLessThanOrEqual(3 * Math.sqrt(m.variance / 10_000) + 1e-12);
    }
  });

  it('averages of 16 have the same mean and about a sixteenth of the variance', () => {
    const xs = drawsFor('die', base(), 2, 20_000, 16);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean - 3.5)).toBeLessThan(3 * Math.sqrt(35 / 12 / 16 / 20_000));
    expect(v / (35 / 12 / 16)).toBeGreaterThan(0.95);
    expect(v / (35 / 12 / 16)).toBeLessThan(1.05);
  });

  it('every draw is a value the pmf allows', () => {
    const rnd = mulberry32(4);
    for (const id of ids) {
      const pmf = pmfOf(id, base());
      for (let i = 0; i < 500; i++) {
        const x = draw(id, base(), rnd);
        if (id === 'geometric') expect(Number.isInteger(x) && x >= 1).toBe(true);
        else expect(canEqual(pmf, x)).toBe(true);
      }
    }
  });

  it('running stats equal a direct mean and SD at every checkpoint', () => {
    const xs = drawsFor('two-dice', base(), 3, 2000);
    for (const p of runningStats(xs)) {
      const head = xs.slice(0, p.n);
      const m = head.reduce((a, b) => a + b, 0) / p.n;
      expect(p.mean).toBeCloseTo(m, 10);
      expect(p.sd).toBeCloseTo(Math.sqrt(head.reduce((s, x) => s + (x - m) ** 2, 0) / p.n), 9);
    }
    expect(logCheckpoints(3)).toEqual([1, 2, 3]);
  });
});

describe('the learner\'s table', () => {
  it('normalises weights and keeps exact fractions for whole-number weights', () => {
    const p = parseTable('0, 90\n100, 9\n10000, 1');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.pmf.probs).toEqual([0.9, 0.09, 0.01]);
    expect(exactMoments('custom', base({ custom: p.pmf })).mean).toBeCloseTo(109, 10);
    const dec = parseTable('1 0.5\n2 1.5');
    expect(dec.ok && dec.pmf.probs).toEqual([0.25, 0.75]);
    expect(dec.ok && dec.pmf.weights).toBe(undefined);
  });

  it('refuses hostile input with a message, never silently', () => {
    const refused = [
      '', '   ', '1, 0\n2, 0', '12345678901234567890123, 1', '-1, -1', '1e400, 1', '1, 1e3', '🙂, 1', '<b>1</b>, 1', '1,,2', '1, 2, 3',
      'Infinity, 1', '5', '1, 2000000',
    ];
    for (const t of refused) {
      const p = parseTable(t);
      expect(p.ok, t).toBe(false);
      if (!p.ok) expect(p.errors.length).toBeGreaterThan(0);
    }
    expect(parseTable(Array.from({ length: 13 }, (_, i) => `${i}, 1`).join('\n')).ok).toBe(false);
    expect(parseTable('−3, 1\n\n4, 1').ok).toBe(true);
    const bad = parseTable('1, 1\nx, 2\n3, -1');
    expect(bad.ok ? [] : bad.errors.map((e) => e.line)).toEqual([2, 3]);
  });
});

describe('captions, the exact panel and the quiz', () => {
  it('a die never shows its mean; the geometric mode is 1 while E = 1/p', () => {
    expect(text(variableCaption('die', base(), 'One die'))).toContain('X never actually equals 3.5');
    const g = text(variableCaption('geometric', base({ successPct: 25 }), 'Attempts'));
    expect(g).toContain('E[X] = 4 and the most likely value is 1');
    expect(g).not.toContain('never actually equals');
    expect(text(variableCaption('two-dice', base(), 'Two dice'))).toContain('the mean is also a likely value');
  });

  it('the exact panel writes the sum out and gives the fractions', () => {
    expect(exactLines('die', base())).toEqual([
      'E[X] = Σ x·P(x)',
      '     = 1·1/6 + 2·1/6 + 3·1/6 + 4·1/6 + 5·1/6 + 6·1/6',
      '     = 3.5 (exactly 7/2)',
      'Var(X) = Σ (x − E[X])²·P(x) = 2.917 (exactly 35/12)',
      'SD = √Var = 1.708',
    ]);
    expect(exactLines('geometric', base({ successPct: 25 }))[2]).toBe('     = 1/p = 1/0.25 = 4');
  });

  it('draw and retry captions are computed', () => {
    expect(text(drawCaption(100, 1, 3.5, 3.5, 35 / 12))).toContain('under 0.1 standard errors');
    expect(text(drawCaption(10, 1, 7, 7, 0))).toContain('every draw is exactly the mean');
    expect(text(retryCaption(0.5, 3))).toContain('= 1.875×');
    expect(text(retryCaption(0.8, 3))).toContain('more than double');
  });

  it('quiz numbers come from the model', () => {
    const q = lesson.quiz;
    expect(q[2].options[q[2].answer]).toBe(String(exactMoments('geometric', base({ successPct: 25 })).mean));
    expect(q[3].options[q[3].answer]).toContain(`${expectedAttempts(0.5, 3)}×`);
    expect(0.5 ** 3).toBe(1 / 8);
  });
});
