import { describe, expect, it } from 'vitest';
import { leastSquares } from '../../core/fit';
import {
  DISTANCE_SHARES, FITTS_TRIALS, LAYOUTS, designBasis, predictLayouts, MENU_ITEMS, MENU_SIZES, MIN_TRIALS, SYNTH_FITTS, TARGET_WIDTHS, choiceBits, fitTrials, fittsSchedule,
  hickSchedule, hitsTarget, indexOfDifficulty, layoutId, predict, rSquared, syntheticFitts, syntheticHick,
  type Trial,
} from './model';

const trial = (bits: number, ms: number | null, miss = false): Trial => ({ bits, ms, input: 'mouse', miss });

describe('index of difficulty', () => {
  it('is the Shannon formulation log₂(D/W + 1), checked against hand-worked values', () => {
    expect(indexOfDifficulty(0, 10)).toBe(0);
    expect(indexOfDifficulty(10, 10)).toBe(1);
    expect(indexOfDifficulty(30, 10)).toBe(2);
    expect(indexOfDifficulty(70, 10)).toBe(3);
    expect(indexOfDifficulty(600, 16)).toBeCloseTo(Math.log2(38.5), 12);
    // Not Fitts's original log₂(2D/W), which gives log₂ 6 ≈ 2.585 for D = 30, W = 10.
    expect(indexOfDifficulty(30, 10)).not.toBeCloseTo(Math.log2((2 * 30) / 10), 3);
  });

  it('refuses a zero or negative width and a negative distance with NaN', () => {
    expect(indexOfDifficulty(10, 0)).toBeNaN();
    expect(indexOfDifficulty(10, -2)).toBeNaN();
    expect(indexOfDifficulty(-1, 10)).toBeNaN();
  });

  it('Hick uses log₂(n + 1)', () => {
    expect(choiceBits(1)).toBe(1);
    expect(choiceBits(3)).toBe(2);
    expect(choiceBits(7)).toBe(3);
    expect(choiceBits(32)).toBeCloseTo(Math.log2(33), 12);
    expect(choiceBits(0)).toBeNaN();
  });
});

describe('fitTrials', () => {
  it('matches core/fit leastSquares on the recorded data, and an independent closed form', () => {
    const trials = [trial(1, 400), trial(2, 520), trial(3, 690), trial(4, 820), trial(2.5, 640)];
    const f = fitTrials(trials);
    if (!f.ok) throw new Error(f.reason);
    const ls = leastSquares(trials.map((t) => t.bits), trials.map((t) => t.ms!), 1)!;
    expect(f.a).toBeCloseTo(ls.coeffs[0], 9);
    expect(f.b).toBeCloseTo(ls.coeffs[1], 9);
    // Closed form: b = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)², a = ȳ − b·x̄.
    const xs = trials.map((t) => t.bits);
    const ys = trials.map((t) => t.ms!);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    const my = ys.reduce((s, y) => s + y, 0) / ys.length;
    const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    expect(f.b).toBeCloseTo(b, 9);
    expect(f.a).toBeCloseTo(my - b * mx, 9);
  });

  it('a perfect line has R² = 1, and R² matches 1 − SS_res/SS_tot by hand', () => {
    const f = fitTrials([trial(1, 300), trial(2, 450), trial(3, 600)]);
    expect(f.ok && f.r2).toBeCloseTo(1, 12);
    // y = 1, 3, 2 at x = 0, 1, 2: fit y = 1.5 + 0.5x, SS_res = 1.5, SS_tot = 2 → R² = 0.25.
    expect(rSquared([0, 1, 2], [1, 3, 2], 1.5, 0.5)).toBeCloseTo(0.25, 12);
    expect(rSquared([0, 1], [5, 5], 5, 0)).toBeNull();
  });

  it('mis-clicks never enter the fit, however extreme their times', () => {
    const clean = [trial(1, 400), trial(2, 550), trial(3, 700)];
    const withMisses = [...clean, trial(4, null, true), { ...trial(0.5, 99999), miss: true }];
    const a = fitTrials(clean);
    const b = fitTrials(withMisses);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.a).toBe(a.a);
    expect(b.b).toBe(a.b);
    expect(b.misses).toBe(2);
    expect(b.n).toBe(3);
  });

  it('with fewer than 3 valid trials it says "need at least 3 trials" instead of fitting', () => {
    expect(MIN_TRIALS).toBe(3);
    expect(fitTrials([])).toMatchObject({ ok: false, reason: 'need at least 3 trials', n: 0 });
    expect(fitTrials([trial(1, 300), trial(2, 400), trial(3, null, true)])).toMatchObject({ ok: false, reason: 'need at least 3 trials', n: 2, misses: 1 });
  });

  it('refuses when every valid trial has the same difficulty', () => {
    expect(fitTrials([trial(2, 300), trial(2, 400), trial(2, 500)])).toMatchObject({ ok: false, reason: 'need trials at two or more different difficulties' });
  });
});

describe('design panel', () => {
  it('predicted times use the fitted a and b exactly', () => {
    const fit = { a: 123, b: 87 };
    for (const l of LAYOUTS) expect(predict(fit, layoutId(l))).toBe(123 + 87 * layoutId(l));
  });

  it('the far tiny icons are harder than the big near buttons; the edge target is the law\'s limit of 0 bits', () => {
    const [far, near, edge] = LAYOUTS;
    expect(layoutId(far)).toBeCloseTo(Math.log2(600 / 16 + 1), 12);
    expect(layoutId(near)).toBeCloseTo(Math.log2(150 / 48 + 1), 12);
    expect(layoutId(far)).toBeGreaterThan(layoutId(near));
    expect(layoutId(edge)).toBe(0);
  });
});

describe('Fitts schedule', () => {
  it('24 trials, every distance × width pair exactly twice, all inside the arena, alternating direction', () => {
    for (const width of [340, 600, 900]) {
      const s = fittsSchedule(5, width);
      expect(s).toHaveLength(FITTS_TRIALS);
      const counts = new Map<string, number>();
      s.forEach((t, i) => {
        const half = Math.max(...TARGET_WIDTHS) / 2;
        expect(Math.min(t.start, t.target) - half).toBeGreaterThanOrEqual(0);
        expect(Math.max(t.start, t.target) + half).toBeLessThanOrEqual(width);
        expect(Math.abs(t.target - t.start)).toBe(t.distance);
        expect(t.id).toBeCloseTo(indexOfDifficulty(t.distance, t.width), 12);
        expect(t.target > t.start).toBe(i % 2 === 0);
        counts.set(`${t.distance}:${t.width}`, (counts.get(`${t.distance}:${t.width}`) ?? 0) + 1);
      });
      expect(counts.size).toBe(DISTANCE_SHARES.length * TARGET_WIDTHS.length);
      expect([...counts.values()].every((c) => c === 2)).toBe(true);
    }
    expect(fittsSchedule(5, 600)).toEqual(fittsSchedule(5, 600));
  });

  it('a click hits the target only within half its width of the centre', () => {
    const t = { start: 0, target: 100, width: 24, distance: 100, id: 0 };
    expect(hitsTarget(t, 112)).toBe(true);
    expect(hitsTarget(t, 88)).toBe(true);
    expect(hitsTarget(t, 112.5)).toBe(false);
  });
});

describe('Hick schedule', () => {
  it('each menu size three times; the target is always on its menu; alphabetical menus are sorted', () => {
    for (const alpha of [false, true]) {
      const s = hickSchedule(3, alpha);
      expect(s).toHaveLength(MENU_SIZES.length * 3);
      for (const n of MENU_SIZES) expect(s.filter((r) => r.n === n)).toHaveLength(3);
      s.forEach((r) => {
        expect(r.items).toHaveLength(r.n);
        expect(new Set(r.items).size).toBe(r.n);
        expect(r.items).toContain(r.target);
        r.items.forEach((x) => expect(MENU_ITEMS).toContain(x));
        if (alpha) expect(r.items).toEqual([...r.items].sort());
      });
    }
  });
});

describe('synthetic participant', () => {
  it('is seeded, and its fit recovers roughly the illustrative constants it was generated from', () => {
    expect(syntheticFitts()).toEqual(syntheticFitts());
    const f = fitTrials(syntheticFitts());
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(Math.abs(f.b - SYNTH_FITTS.b)).toBeLessThan(60);
    const h = fitTrials(syntheticHick());
    expect(h.ok && h.b > 0).toBe(true);
  });
});

describe('design panel basis (review repro: MT = −60 + 210·ID)', () => {
  const ok = (a: number, b: number) => ({ ok: true as const, a, b, r2: 0.9, n: 10, misses: 0 });

  it('uses the learner’s own line only when b > 0 and a ≥ 0', () => {
    expect(designBasis(ok(100, 150))).toEqual({ source: 'own' });
    expect(designBasis(ok(0, 150))).toEqual({ source: 'own' });
    expect(designBasis(ok(-60, 210))).toEqual({ source: 'synthetic', why: 'intercept' });
    expect(designBasis(ok(300, -5))).toEqual({ source: 'synthetic', why: 'slope' });
    expect(designBasis(fitTrials([]))).toEqual({ source: 'synthetic', why: 'no-fit' });
  });

  it('whatever line is chosen, no layout is ever predicted below 0 ms', () => {
    for (const [a, b] of [[-60, 210], [-500, 400], [300, -5], [100, 150]]) {
      const basis = designBasis(ok(a, b));
      const synth = fitTrials(syntheticFitts());
      const line = basis.source === 'own' ? { a, b } : synth.ok ? synth : null;
      predictLayouts(line!, syntheticFitts()).forEach((p) => expect(p.ms).toBeGreaterThanOrEqual(0));
    }
  });

  it('flags layouts whose ID lies outside the range of the fitted trials as extrapolations', () => {
    const trials = [trial(1, 300), trial(2, 450), trial(3, 600)];
    const preds = predictLayouts({ a: 150, b: 150 }, trials);
    const byId = Object.fromEntries(preds.map((p) => [p.layout.id, p]));
    expect(byId.far.extrapolated).toBe(byId.far.id > 3);
    expect(byId.near.extrapolated).toBe(false);
    expect(byId.edge.extrapolated).toBe(true);
    expect(byId.near.ms).toBe(150 + 150 * byId.near.id);
  });
});
