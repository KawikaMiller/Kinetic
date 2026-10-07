import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { CHIPS, MAPPINGS, placementFeedback, REGION_NAMES, SCENARIOS, type Region } from './classes';
import {
  createSolver, dpCells, dpSolve, inputDigits, maskToChosen, MAX_DIGITS, parseNumbers, seededInstance, trapInstance, TRAP_N, verify,
} from './subset';

/** Independent reference: does any subset hit the target? Plain recursion, no Gray code, no table. */
const anySubset = (xs: readonly number[], t: number, i = 0): boolean => (i === xs.length ? t === 0 : anySubset(xs, t - xs[i], i + 1) || anySubset(xs, t, i + 1));

describe('brute force and DP', () => {
  it('agree with each other and with plain recursion on 500 seeded instances (n ≤ 16)', () => {
    const rnd = mulberry32(42);
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rnd() * 16);
      const numbers = Array.from({ length: n }, () => Math.floor(rnd() * 30));
      const target = Math.floor(rnd() * 120);
      const solver = createSolver(numbers, target);
      const end = solver.advance(Infinity);
      const dp = dpSolve(numbers, target);
      expect(end.hits > 0).toBe(dp.possible);
      expect(dp.possible).toBe(anySubset(numbers, target));
      if (end.first !== null) expect(verify(numbers, maskToChosen(end.first, n), target).ok).toBe(true);
      expect(dp.cells).toBe((n + 1) * (target + 1));
    }
  });

  it('tries exactly 2ⁿ subsets, each once, when it runs to the end (stepping one at a time)', () => {
    for (const n of [0, 1, 5, 10, 16]) {
      const numbers = Array.from({ length: n }, (_, i) => 2 ** i); // distinct sums: each subset is its own sum
      const solver = createSolver(numbers, -1);
      const seen = new Set<number>([solver.state().sum]);
      let s = solver.state();
      while (!s.done) {
        s = solver.advance(1);
        seen.add(s.sum);
      }
      expect(s.tried).toBe(2 ** n);
      expect(seen.size).toBe(2 ** n);
      expect(s.hits).toBe(0);
      // Chunked runs end in the same place.
      const chunked = createSolver(numbers, -1);
      let c = chunked.state();
      while (!c.done) c = chunked.advance(7);
      expect(c.tried).toBe(2 ** n);
    }
  });

  it('counts every subset that hits the target, and the solver handles negative numbers', () => {
    const numbers = [3, -2, 5, -3, 2];
    let expected = 0;
    for (let m = 0; m < 32; m++) if (numbers.reduce((s, v, i) => s + ((m >> i) & 1 ? v : 0), 0) === 0) expected++;
    expect(createSolver(numbers, 0).advance(Infinity).hits).toBe(expected);
    expect(() => dpSolve(numbers, 0)).toThrow(RangeError);
  });

  it('seeded instances always have a solution', () => {
    for (let s = 1; s <= 50; s++) {
      const inst = seededInstance(s, 10);
      expect(anySubset(inst.numbers, inst.target)).toBe(true);
    }
  });
});

describe('verifier', () => {
  it('accepts exactly the subsets whose sum equals the target, in n steps, on every subset of small instances', () => {
    const rnd = mulberry32(9);
    for (let k = 0; k < 40; k++) {
      const n = 1 + Math.floor(rnd() * 8);
      const numbers = Array.from({ length: n }, () => Math.floor(rnd() * 21) - 10);
      const target = Math.floor(rnd() * 21) - 10;
      for (let m = 0; m < 2 ** n; m++) {
        const chosen = maskToChosen(m, n);
        const sum = numbers.reduce((s, v, i) => s + (chosen[i] ? v : 0), 0);
        const v = verify(numbers, chosen, target);
        expect(v.ok).toBe(sum === target);
        expect(v.steps).toBe(n);
      }
    }
  });
});

describe('the pseudo-polynomial trap', () => {
  it('keeps n fixed while the table grows about 10× per digit, and the table still answers correctly where it can run', () => {
    let prev = 0;
    for (let d = 1; d <= MAX_DIGITS; d++) {
      const inst = trapInstance(d);
      expect(inst.numbers).toHaveLength(TRAP_N);
      expect(inst.numbers.every((v) => String(v).length === d)).toBe(true);
      const cells = dpCells(TRAP_N, inst.target);
      if (prev) expect(cells / prev).toBeGreaterThan(5);
      prev = cells;
      if (d <= 4) expect(dpSolve(inst.numbers, inst.target).possible).toBe(anySubset(inst.numbers, inst.target));
      // The input itself grows only linearly in d.
      expect(inputDigits(inst)).toBeLessThanOrEqual((TRAP_N + 1) * (d + 1));
    }
  });
});

describe('typed numbers', () => {
  it('accepts commas and spaces, and refuses the hostile cases with a message', () => {
    expect(parseNumbers(' 3, 5 ,8  13')).toEqual({ ok: true, value: [3, 5, 8, 13] });
    expect(parseNumbers('-7 -0 1000000')).toEqual({ ok: true, value: [-7, 0, 1_000_000] });
    const refused = ['', '   ', '1,,2', '1e400', '3.5', '😀', '<b>1</b>', '1000001', '-1000001', '12345678901234567890123', Array.from({ length: 25 }, () => '1').join(' ')];
    for (const t of refused) {
      const r = parseNumbers(t);
      expect(r.ok, JSON.stringify(t)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
    expect(parseNumbers(Array.from({ length: 24 }, () => '1').join(' ')).ok).toBe(true);
  });
});

describe('class diagram and scenarios', () => {
  it('gives each chip exactly one correct region, matching the fixed answer table', () => {
    const table: Record<string, Region> = { sorting: 'P', path: 'P', subset: 'NPC', sat: 'NPC', colour: 'NPC', tsp: 'NPC', halting: 'NPH' };
    for (const chip of CHIPS) {
      expect(chip.region).toBe(table[chip.id]);
      const right = (Object.keys(REGION_NAMES) as Region[]).filter((r) => placementFeedback(chip, r).correct);
      expect(right).toEqual([table[chip.id]]);
      for (const r of Object.keys(REGION_NAMES) as Region[]) expect(placementFeedback(chip, r).text.length).toBeGreaterThan(20);
    }
    expect(Object.keys(table)).toEqual(CHIPS.map((c) => c.id));
  });

  it('maps each scenario to one of the offered problems, each a different one', () => {
    for (const s of SCENARIOS) expect(MAPPINGS).toContain(s.maps);
    expect(new Set(SCENARIOS.map((s) => s.maps)).size).toBe(SCENARIOS.length);
  });
});

describe('try-this claims', () => {
  it('the default n = 24 instance needs only a few thousand DP cells, against 16,777,216 subsets', () => {
    const inst = seededInstance(1, 24);
    const cells = dpCells(24, inst.target);
    expect(cells).toBeGreaterThan(1000);
    expect(cells).toBeLessThan(10_000);
    expect(2 ** 24).toBe(16_777_216);
  });
});

describe('placement feedback', () => {
  it('explains the near misses specifically', () => {
    const subset = CHIPS.find((c) => c.id === 'subset')!;
    expect(placementFeedback(subset, 'NP').text).toContain('dashed overlap: NP-complete');
    expect(placementFeedback(subset, 'NPH').text).toContain('also in NP');
    expect(placementFeedback(subset, 'P').text).toContain('would settle P vs NP');
    expect(placementFeedback(CHIPS.find((c) => c.id === 'sorting')!, 'NP').text).toContain('also in P');
  });
});
