import { describe, expect, it } from 'vitest';
import {
  LOGNORMAL, alwaysOverlap, canGather, expectedKthFastest, failuresTolerated, intersection, kthSmallest, missProbability, missingPairs, simulateKthFastest, waitByQuorum,
} from './quorum';

const subsetsOf = (n: number, size: number): number[][] => {
  const out: number[][] = [];
  const go = (start: number, picked: number[]) => {
    if (picked.length === size) return void out.push(picked);
    for (let i = start; i < n; i++) go(i + 1, [...picked, i]);
  };
  go(0, []);
  return out;
};

describe('the disjoint-pairs formula against brute-force enumeration of every pair of subsets', () => {
  it('matches for every N from 3 to 7 and every W and R from 1 to N, and is zero exactly when R + W > N', () => {
    let cases = 0;
    for (let n = 3; n <= 7; n++) {
      for (let w = 1; w <= n; w++) {
        for (let r = 1; r <= n; r++) {
          const writes = subsetsOf(n, w);
          const reads = subsetsOf(n, r);
          let missing = 0;
          let smallest = Infinity;
          for (const ws of writes) {
            for (const rs of reads) {
              const shared = intersection(ws, rs).length;
              if (shared === 0) missing++;
              smallest = Math.min(smallest, shared);
            }
          }
          const f = missingPairs({ n, w, r });
          expect(f.missing, `N=${n} W=${w} R=${r}`).toBe(BigInt(missing));
          expect(f.total).toBe(BigInt(writes.length * reads.length));
          expect(f.missing === 0n, `N=${n} W=${w} R=${r}`).toBe(r + w > n);
          expect(alwaysOverlap({ n, w, r })).toBe(r + w > n);
          expect(smallest).toBe(Math.max(0, w + r - n));
          expect(missProbability({ n, w, r })).toBeCloseTo(missing / (writes.length * reads.length), 12);
          cases++;
        }
      }
    }
    expect(cases).toBe(3 * 3 + 4 * 4 + 5 * 5 + 6 * 6 + 7 * 7);
  });

  it('a worked case: N = 5, W = 2, R = 2 misses in C(5,2) x C(3,2) = 30 of 100 pairs, probability C(3,2) / C(5,2) = 0.3', () => {
    expect(missingPairs({ n: 5, w: 2, r: 2 })).toEqual({ missing: 30n, total: 100n });
    expect(missProbability({ n: 5, w: 2, r: 2 })).toBeCloseTo(0.3, 12);
  });
});

describe('availability arithmetic', () => {
  it('a write survives N - W failures and a read N - R, and W = N is blocked by one crash', () => {
    expect(failuresTolerated(5, 3)).toBe(2);
    expect(canGather(5, 2, 3)).toBe(true);
    expect(canGather(5, 3, 3)).toBe(false);
    expect(canGather(5, 0, 5)).toBe(true);
    expect(canGather(5, 1, 5)).toBe(false);
  });
});

describe('the order statistics of reply latency', () => {
  it('the k-th fastest of 5 exponential latencies has expectation (1/λ) Σ 1/(N - i): k = 3 gives 1/5 + 1/4 + 1/3 = 0.783', () => {
    expect(expectedKthFastest(5, 3)).toBeCloseTo(1 / 5 + 1 / 4 + 1 / 3, 12);
    expect(expectedKthFastest(5, 3)).toBeCloseTo(0.7833, 4);
    expect(expectedKthFastest(5, 3, 2)).toBeCloseTo(0.7833 / 2, 4);
  });
  it('matches simulation within 3 standard errors for k = 1 to 5 at N = 5, and for another N', () => {
    for (const [n, ks] of [[5, [1, 2, 3, 4, 5]], [3, [1, 2, 3]], [7, [1, 4, 7]]] as const) {
      for (const k of ks) {
        const sim = simulateKthFastest(n, k, 20_000, 100 + n * 10 + k);
        expect(Math.abs(sim.mean - expectedKthFastest(n, k)), `N=${n} k=${k}`).toBeLessThanOrEqual(3 * sim.se);
      }
    }
  });
  it('kthSmallest picks the right element', () => {
    expect(kthSmallest([5, 1, 4, 2, 3], 1)).toBe(1);
    expect(kthSmallest([5, 1, 4, 2, 3], 3)).toBe(3);
    expect(kthSmallest([5, 1, 4, 2, 3], 5)).toBe(5);
  });
  it('p50 and p99 of the W-th fastest rise with W, and the median of the median of three is the median of one reply', () => {
    for (const n of [3, 5, 7]) {
      const rows = waitByQuorum(n);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].p50).toBeGreaterThan(rows[i - 1].p50);
        expect(rows[i].p99).toBeGreaterThan(rows[i - 1].p99);
      }
    }
    const three = waitByQuorum(3);
    expect(Math.abs(three[1].p50 - Math.exp(LOGNORMAL.mu)) / Math.exp(LOGNORMAL.mu)).toBeLessThan(0.04);
  });
});
