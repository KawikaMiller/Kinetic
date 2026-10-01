import { describe, expect, it } from 'vitest';
import {
  ALL_SUSPECTS, bisectComponents, COMMIT_COUNT, commitHash, COMPONENTS, EXPECTED, markCommit, narrow, nextCommit, optimalProbes, OTHER_INPUT,
  probe, runBisect, runPipeline, sameOrder, showValue, START_BISECT, type BisectState,
} from './model';
import { trapRows } from './trap';

const N = COMPONENTS.length;

describe('pipeline', () => {
  it('the healthy pipeline prices 19.99 x 3 with 10% off and 8% tax', () => {
    expect(EXPECTED).toBe('$58.29');
    expect(runPipeline(null).map((o) => Math.round(o.total * 1000) / 1000)).toEqual([0, 0, 0, 5997, 5397.3, 5829.084, 5829, 5829]);
  });

  it.each(COMPONENTS.map((c, k) => [c, k] as const))('a bug in %s: every probe before it is right, every probe from it on is wrong', (_, k) => {
    for (let i = 0; i < N; i++) expect(probe(k, i).ok).toBe(i < k);
    expect(runPipeline(k).at(-1)!.text).not.toBe(EXPECTED);
  });
});

describe('bisecting the components', () => {
  it('finds the culprit for every fault position in at most ceil(log2 8) = 3 probes', () => {
    const probes = COMPONENTS.map((_, k) => {
      const r = bisectComponents(N, (i) => probe(k, i).ok);
      expect(r.culprit).toBe(k);
      return r.probes;
    });
    expect(Math.max(...probes)).toBe(optimalProbes(N));
    expect(optimalProbes(N)).toBe(3);
  });

  it.each([5, 7, 12, 16, 31, 33])('for %i components the worst case is exactly ceil(log2 N)', (n) => {
    const worst = Math.max(
      ...Array.from({ length: n }, (_, k) => {
        const r = bisectComponents(n, (i) => i < k);
        expect(r.culprit).toBe(k);
        return r.probes;
      }),
    );
    expect(worst).toBe(Math.ceil(Math.log2(n)));
  });

  it('probes outside the suspect range teach nothing', () => {
    const s = narrow(ALL_SUSPECTS, 3, true); // suspects 4..7
    expect(narrow(s, 1, true)).toEqual(s);
    expect(narrow(s, 7, false)).toEqual(s);
  });
});

describe('git bisect', () => {
  it('finds the true first bad commit for every position, in at most 4 steps over 16 commits', () => {
    const steps: number[] = [];
    for (let f = 1; f < COMMIT_COUNT; f++) {
      const r = runBisect(COMMIT_COUNT, f);
      expect(r.blamed).toBe(f);
      steps.push(r.steps);
    }
    expect(Math.max(...steps)).toBe(4);
  });

  it('holds for every history length up to 64', () => {
    for (let n = 2; n <= 64; n++) {
      for (let f = 1; f < n; f++) {
        const r = runBisect(n, f);
        expect(r.blamed).toBe(f);
        expect(r.steps).toBeLessThanOrEqual(Math.ceil(Math.log2(n - 1)));
      }
    }
  });

  it('every commit gets a distinct short hash', () => {
    const hashes = Array.from({ length: COMMIT_COUNT }, (_, i) => commitHash(i));
    expect(new Set(hashes).size).toBe(COMMIT_COUNT);
    expect(new Set(hashes.map((h) => h.slice(0, 2))).size).toBeGreaterThan(COMMIT_COUNT / 2);
  });

  it('walks c7 good, c11 bad, c9 bad, c8 good to blame c9', () => {
    let s: BisectState = START_BISECT;
    const seen: [number, string][] = [];
    for (const mark of ['good', 'bad', 'bad', 'good'] as const) {
      seen.push([nextCommit(s), mark]);
      s = markCommit(s, mark);
    }
    expect(seen).toEqual([[7, 'good'], [11, 'bad'], [9, 'bad'], [8, 'good']]);
    expect(s).toEqual({ good: 8, bad: 9 });
  });
});

describe('the two-changes trap', () => {
  it('fixing the real bug alone fixes both orders; adding the second change hides a new bug', () => {
    const rows = trapRows();
    const both = rows.find((r) => r.fix && r.extra)!;
    const fixOnly = rows.find((r) => r.fix && !r.extra)!;
    expect(fixOnly.mainOk && fixOnly.otherOk).toBe(true);
    expect(both.mainOk).toBe(true);
    expect(both.otherOk).toBe(false);
    const extraOnly = rows.find((r) => !r.fix && r.extra)!;
    expect(extraOnly.mainOk).toBe(false);
  });

  it('the healthy pipeline agrees with itself under sameOrder, and a bug never does', () => {
    expect(sameOrder(runPipeline(null, OTHER_INPUT).at(-1)!, runPipeline(null, OTHER_INPUT).at(-1)!)).toBe(true);
    for (let k = 0; k < N; k++) expect(sameOrder(runPipeline(k).at(-1)!, runPipeline(null).at(-1)!)).toBe(false);
  });
});

describe('probe values', () => {
  it('never show float noise, so a bug in normalize reads as one bug', () => {
    COMPONENTS.forEach((c, fault) => {
      runPipeline(fault).forEach((o, i) => expect(showValue(o, i), `${c} broken, after step ${i}`).not.toMatch(/\d\.\d{3,}/));
    });
    const normalize = COMPONENTS.indexOf('normalize');
    expect(showValue(runPipeline(normalize)[normalize], normalize)).toBe('199.9¢ × 3');
  });
});
