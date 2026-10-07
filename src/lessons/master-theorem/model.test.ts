import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { binarySearchProbes, karatsuba, mergeSortWrites, strassen } from './algorithms';
import { bruteClosest, closestPair, seededPoints } from './closest';
import { A_VALUES, B_VALUES, classify, critical, F, F_IDS, fAt, PRESETS, thetaAt, treeLevels, treeSum, type FId } from './master';

/** n = b^K for every K whose n lies in [lo, hi]. */
const ks = (b: number, lo: number, hi: number) => {
  const out: number[] = [];
  for (let K = 1; b ** K <= hi; K++) if (b ** K >= lo) out.push(K);
  return out;
};
const ratios = (a: number, b: number, f: FId, Ks: number[]) => {
  const t = classify(a, b, f).theta;
  return Ks.map((K) => treeSum(a, b, f, K) / thetaAt(t, b ** K));
};

describe('recursion tree sums', () => {
  it('sums each level as a^k · f(n / b^k), with a^K leaves of T(1) = 1', () => {
    const lv = treeLevels(3, 2, 'n', 3); // n = 8
    expect(lv.map((l) => [l.nodes, l.size, l.total])).toEqual([[1, 8, 8], [3, 4, 12], [9, 2, 18], [27, 1, 27]]);
    expect(treeSum(3, 2, 'n', 3)).toBe(65);
  });

  it('matches the recurrence evaluated directly by recursion', () => {
    const T = (a: number, b: number, f: FId, n: number): number => (n === 1 ? 1 : a * T(a, b, f, n / b) + (n ** (F[f].p2 / 2)) * Math.log2(n) ** F[f].q);
    for (const a of [1, 2, 3, 5]) for (const b of B_VALUES) for (const f of F_IDS) {
      const K = b === 2 ? 8 : 4;
      expect(treeSum(a, b, f, K)).toBeCloseTo(T(a, b, f, b ** K), 6);
    }
  });
});

describe('master theorem classifier', () => {
  it("Θ matches the summed tree for every (a, b, f) offered: the ratio stays in a constant band for n = 2¹⁰ … 2²⁰", () => {
    for (const a of A_VALUES) for (const b of B_VALUES) for (const f of F_IDS) {
      const r = ratios(a, b, f, ks(b, 2 ** 10, 2 ** 20));
      expect(Math.max(...r) / Math.min(...r), `a=${a} b=${b} f=${f}`).toBeLessThan(2);
    }
  });

  it('and the ratio converges as n grows to about 2⁶⁰, while a bound off by one log factor keeps drifting', () => {
    for (const a of A_VALUES) for (const b of B_VALUES) for (const f of F_IDS) {
      const K = ks(b, 2 ** 50, 2 ** 62);
      const r = ratios(a, b, f, K);
      const drift = Math.abs(r.at(-1)! - r.at(-2)!) / r.at(-1)!;
      expect(drift, `a=${a} b=${b} f=${f}`).toBeLessThan(0.02);
      // The same check against Θ · log n fails: that ratio still moves by ~1/K per level.
      const off = K.map((k, i) => r[i] / Math.log2(b ** k));
      expect(Math.abs(off.at(-1)! - off.at(-2)!) / off.at(-1)!).toBeGreaterThan(0.015);
    }
  });

  it('decides case 2 by exact integer equality, never by comparing floats', () => {
    expect(classify(2, 4, 'sqrt').kind).toBe(2); // log₄ 2 = 0.5 exactly
    expect(classify(4, 2, 'n2').kind).toBe(2);
    expect(classify(1, 3, 'one').kind).toBe(2);
    expect(classify(3, 3, 'n').kind).toBe(2);
    expect(classify(2, 2, 'nlogn')).toMatchObject({ kind: 2, k: 1, theta: { q: 2 } }); // extended case 2: n log² n
    const equal = A_VALUES.flatMap((a) => B_VALUES.flatMap((b) => F_IDS.filter((f) => classify(a, b, f).kind === 2 || classify(a, b, f).kind === 'gap').map((f) => [a, b, f])));
    for (const [a, b, f] of equal) expect(Math.abs(critical(a as number, b as number) - F[f as FId].p2 / 2)).toBeLessThan(1e-12);
  });

  it('gives case 3 a regularity constant c < 1 that really bounds a·f(n/b) ≤ c·f(n)', () => {
    for (const a of A_VALUES) for (const b of B_VALUES) for (const f of F_IDS) {
      const c = classify(a, b, f);
      if (c.kind !== 3) continue;
      expect(c.regularity.c).toBeLessThan(1);
      for (let K = 2; K <= 30; K++) {
        const n = b ** K;
        const lhs = a * fAt(f, n / b);
        const fn = fAt(f, n);
        if (c.regularity.exact) expect(lhs).toBeLessThanOrEqual(c.regularity.c * fn * (1 + 1e-12));
        else if (K >= 20) expect(lhs).toBeLessThan(fn); // n / log n: some c < 1 works once n is large
      }
    }
  });

  it('classifies the presets as the lesson says, with Karatsuba at log₂ 3 to 3 places', () => {
    const at = (id: string) => {
      const p = PRESETS.find((x) => x.id === id)!;
      return classify(p.a, p.b, p.f);
    };
    expect(at('binary')).toMatchObject({ kind: 2, theta: { p: 0, q: 1 } });
    expect(at('merge')).toMatchObject({ kind: 2, theta: { p: 1, q: 1 } });
    expect(at('karatsuba').kind).toBe(1);
    expect(at('karatsuba').theta.p.toFixed(3)).toBe(Math.log2(3).toFixed(3));
    expect(at('karatsuba').theta.p.toFixed(3)).toBe('1.585');
    expect(at('strassen').kind).toBe(1);
    expect(at('strassen').theta.p.toFixed(3)).toBe('2.807');
    expect(at('degenerate')).toMatchObject({ kind: 3, theta: { p: 1, q: 0 } });
    expect(at('gap')).toMatchObject({ kind: 'gap', theta: { loglog: true } });
  });

  it('the "doesn\'t fit" tree sums to n · H(log₂ n), so it grows like n log log n', () => {
    for (let K = 10; K <= 60; K += 10) {
      let h = 0;
      for (let m = 1; m <= K; m++) h += 1 / m;
      expect(treeSum(2, 2, 'nOverLog', K) / 2 ** K).toBeCloseTo(h + 1, 9); // + 1: the n leaves
    }
    // Not Θ(n log n) either: the ratio to n log n keeps shrinking.
    expect(treeSum(2, 2, 'nOverLog', 60) / (2 ** 60 * 60)).toBeLessThan(0.5 * (treeSum(2, 2, 'nOverLog', 10) / (2 ** 10 * 10)));
    // Not Θ(n): the ratio to n alone keeps growing.
    // T(n) / n = H(K) + 1 grows from 3.93 at 2¹⁰ to 5.68 at 2⁶⁰: slowly, the way log log n does.
    expect(treeSum(2, 2, 'nOverLog', 60) / 2 ** 60).toBeGreaterThan(1.4 * (treeSum(2, 2, 'nOverLog', 10) / 2 ** 10));
  });
});

describe('real algorithms agree with their presets', () => {
  it('binary search probes log₂ n + 1 times in the worst case', () => {
    for (let K = 1; K <= 16; K++) expect(binarySearchProbes(2 ** K)).toBe(K + 1);
  });

  it('merge sort writes n · log₂ n elements and really sorts', () => {
    const rnd = mulberry32(7);
    for (let K = 1; K <= 12; K++) {
      const xs = Array.from({ length: 2 ** K }, () => Math.floor(rnd() * 1000));
      const { writes, sorted } = mergeSortWrites(xs);
      expect(writes).toBe(2 ** K * K);
      expect(sorted).toEqual([...xs].sort((a, b) => a - b));
    }
  });

  it('Karatsuba makes 3^K base products for 2^K digits and gets the right product', () => {
    const rnd = mulberry32(3);
    for (let K = 0; K <= 7; K++) {
      const digits = () => Array.from({ length: 2 ** K }, () => Math.floor(rnd() * 10));
      const x = digits();
      const y = digits();
      const big = (d: number[]) => BigInt(d.slice().reverse().join('') || '0');
      const r = karatsuba(x, y);
      expect(r.mults).toBe(3 ** K);
      expect(r.product).toBe(big(x) * big(y));
    }
  });

  it('Strassen makes 7^K scalar products for 2^K × 2^K matrices and matches the naive product', () => {
    const rnd = mulberry32(5);
    for (let K = 0; K <= 4; K++) {
      const n = 2 ** K;
      const m = () => Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 10) - 5));
      const A = m();
      const B = m();
      const naive = A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
      const r = strassen(A, B);
      expect(r.mults).toBe(7 ** K);
      expect(r.C).toEqual(naive);
    }
  });
});

describe('closest pair', () => {
  it('matches brute force on 300 seeded point sets', () => {
    for (let s = 0; s < 300; s++) {
      const pts = seededPoints(s + 1, 2 + (s % 63));
      const run = closestPair(pts);
      expect(run.best.d).toBeCloseTo(bruteClosest(pts), 10);
    }
  });

  it('makes at most 7 strip checks per point at every level: linear work per level', () => {
    for (let s = 0; s < 100; s++) {
      const pts = seededPoints(1000 + s, 64);
      const run = closestPair(pts);
      for (const c of run.stripChecks) expect(c).toBeLessThanOrEqual(7 * pts.length);
      for (const step of run.steps) expect(step.checks).toBeLessThanOrEqual(7 * step.strip.length);
    }
  });
});
