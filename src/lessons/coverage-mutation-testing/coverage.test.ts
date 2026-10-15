import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { coverageOf, trace } from './coverage';
import { BUGGY, COST, DOMAIN, WEIGHT_MAX, type Input } from './program';

const at = (weight: number, express: boolean): Input => ({ weight, express });

/** Reference: which of the six executable lines a call runs, read straight off the JavaScript conditions. */
function referenceLines(input: Input): boolean[] {
  return [
    true, // const base = express
    input.express, // ? 12
    !input.express, // : 5;
    true, // return weight > 10
    input.weight > 10, // ? base + ...
    !(input.weight > 10), // : base;
  ];
}

describe('the tracer against hand-counted tables', () => {
  // [inputs, lines covered of 6, branches covered of 4]
  const table: [string, Input[], number, number][] = [
    ['one call, weight 5, standard', [at(5, false)], 4, 2],
    ['one call, weight 15, standard', [at(15, false)], 4, 2],
    ['one call, weight 15, express', [at(15, true)], 4, 2],
    ['the two-call walk-everything suite', [at(5, false), at(15, true)], 6, 4],
    ['two calls that leave a branch out', [at(5, false), at(8, false)], 4, 2],
    ['no calls', [], 0, 0],
  ];

  for (const [name, inputs, lines, branches] of table) {
    it(`counts ${lines} of 6 lines and ${branches} of 4 branches for ${name}`, () => {
      const cov = coverageOf(COST, inputs);
      expect(cov.lineCount).toBe(6);
      expect(cov.branchCount).toBe(4);
      expect(cov.linesCovered).toBe(lines);
      expect(cov.branchesCovered).toBe(branches);
    });
  }

  it('marks the right lines for one call: weight 5, standard runs the 5 and the base lines only', () => {
    const cov = coverageOf(COST, [at(5, false)]);
    expect(cov.lines.map((l) => (l.counts ? l.covered : null))).toEqual([null, true, false, true, true, false, true, null]);
  });
});

describe('the tracer against the JavaScript conditions', () => {
  it('covers exactly the lines the conditions say, for 400 seeded suites of 0 to 6 calls, on both versions of the code', () => {
    const rnd = mulberry32(21);
    for (let k = 0; k < 400; k++) {
      const inputs = Array.from({ length: Math.floor(rnd() * 7) }, () => at(Math.floor(rnd() * (WEIGHT_MAX + 1)), rnd() < 0.5));
      const expected = [0, 1, 2, 3, 4, 5].map((i) => inputs.some((input) => referenceLines(input)[i]));
      for (const program of [COST, BUGGY]) {
        const cov = coverageOf(program, inputs);
        const counted = cov.lines.filter((l) => l.counts).map((l) => l.covered);
        expect(counted).toEqual(expected);
        expect(cov.branchesCovered).toBe(expected.slice(1, 3).filter(Boolean).length + expected.slice(4, 6).filter(Boolean).length);
      }
    }
  });

  it('runs the test of a ternary and only the branch taken, node by node', () => {
    const hit = trace(COST, at(15, true));
    expect(hit.has('r.0')).toBe(true);
    expect(hit.has('r.1')).toBe(true);
    expect(hit.has('r.2')).toBe(false);
    expect(hit.has('b.1')).toBe(true);
    expect(hit.has('b.2')).toBe(false);
    expect(hit.has('r.1.1.0')).toBe(true);
  });

  it('reaches full line and branch coverage with a suite that has no assertion in it: coverage never reads one', () => {
    const cov = coverageOf(COST, [at(5, false), at(15, true)]);
    expect(cov.linesCovered).toBe(cov.lineCount);
    expect(cov.branchesCovered).toBe(cov.branchCount);
  });

  it('never covers more than the whole domain does', () => {
    const all = coverageOf(COST, DOMAIN);
    expect(all.linesCovered).toBe(all.lineCount);
    expect(all.branchesCovered).toBe(all.branchCount);
  });
});
