import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import {
  BOX, DEFAULT_CONSTRAINTS, LIMITS, MAX_CONSTRAINTS, NO_AXES_WITNESS, NO_FEASIBILITY_WITNESS, SOLVER_OPTIONS, UNBOUNDED_TEXT, brokenRule, clashCore, constraintText,
  expression, firstViolation, infeasibleText, integerSolution, integerText, isFeasible, round, roundedPoint, solutionText, solve, tieText, vertexText, type Constraint,
} from './lp2d';
import { START_VERTEX, edgesAt, polygon, walkEdge } from './simplex';

// Independent oracles: a grid search, a greedy edge walk from the origin, Fourier-Motzkin elimination for feasibility,
// and the recession cone for unboundedness. None of them enumerates vertices.

const ri = (rnd: Rnd, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const ok = (k: Constraint, x: number, y: number, eps = 1e-9) => k.a * x + k.b * y <= k.c + eps;

/** The best objective over grid points (multiples of `step` in [0, size]) that satisfy every constraint, or null. */
function gridBest(cons: readonly Constraint[], cx: number, cy: number, size: number, step: number): number | null {
  let best: number | null = null;
  const n = Math.round(size / step);
  for (let i = 0; i <= n; i++) {
    const x = i * step;
    for (let j = 0; j <= n; j++) {
      const y = j * step;
      if (cons.every((k) => ok(k, x, y))) {
        const v = cx * x + cy * y;
        if (best === null || v > best) best = v;
      }
    }
  }
  return best;
}

/** Greedy edge walking from the origin: along a tight constraint line, improving, as far as the ratio test allows. */
function greedyWalk(cons: readonly Constraint[], cx: number, cy: number): number {
  const all = [...cons, { a: -1, b: 0, c: 0 }, { a: 0, b: -1, c: 0 }];
  let x = 0;
  let y = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const tight = all.filter((k) => Math.abs(k.a * x + k.b * y - k.c) < 1e-7);
    let best: { d: [number, number]; gain: number } | null = null;
    for (const k of tight) {
      for (const sign of [1, -1]) {
        const len = Math.hypot(k.a, k.b);
        const d: [number, number] = [(sign * k.b) / len, (-sign * k.a) / len];
        const gain = cx * d[0] + cy * d[1];
        if (gain > 1e-9 && tight.every((t) => t.a * d[0] + t.b * d[1] <= 1e-9) && (best === null || gain > best.gain)) best = { d, gain };
      }
    }
    if (!best) return cx * x + cy * y;
    let step = Infinity;
    for (const k of all) {
      const slope = k.a * best.d[0] + k.b * best.d[1];
      if (slope > 1e-9) step = Math.min(step, (k.c - k.a * x - k.b * y) / slope);
    }
    if (!Number.isFinite(step)) throw new Error('the walk ran off to infinity: the LP is unbounded');
    x += step * best.d[0];
    y += step * best.d[1];
  }
  throw new Error('the walk did not stop');
}

/** Fourier-Motzkin: eliminate y from the system with x, y >= 0, then check that some x >= 0 survives. */
function fmFeasible(cons: readonly Constraint[]): boolean {
  const uppers: { m: number; q: number }[] = []; // y <= m x + q
  const lowers: { m: number; q: number }[] = [{ m: 0, q: 0 }]; // y >= 0
  const xBounds: { lo: number; hi: number } = { lo: 0, hi: Infinity };
  const onlyX: { m: number; q: number }[] = []; // 0 <= m x + q
  for (const k of cons) {
    if (k.b > 0) uppers.push({ m: -k.a / k.b, q: k.c / k.b });
    else if (k.b < 0) lowers.push({ m: -k.a / k.b, q: k.c / k.b });
    else if (k.a > 0) xBounds.hi = Math.min(xBounds.hi, k.c / k.a);
    else if (k.a < 0) xBounds.lo = Math.max(xBounds.lo, k.c / k.a);
    else if (k.c < -1e-9) return false;
  }
  for (const u of uppers) for (const l of lowers) onlyX.push({ m: u.m - l.m, q: u.q - l.q });
  for (const r of onlyX) {
    if (Math.abs(r.m) < 1e-12) {
      if (r.q < -1e-9) return false;
    } else if (r.m > 0) xBounds.lo = Math.max(xBounds.lo, -r.q / r.m);
    else xBounds.hi = Math.min(xBounds.hi, -r.q / r.m);
  }
  return xBounds.lo <= xBounds.hi + 1e-9;
}

/**
 * Unbounded iff feasible and some direction d with A d <= 0 (and d >= 0 when the axes are kept) improves the objective.
 * The cone's extreme rays (and, with no axes, its straight-line directions) are among the candidates tried.
 */
function recessionImproves(cons: readonly Constraint[], cx: number, cy: number, axes = true): boolean {
  const candidates: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [cx, cy]];
  for (const k of cons) candidates.push([k.b, -k.a], [-k.b, k.a]);
  return candidates.some(([dx, dy]) => {
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) return false;
    const d: [number, number] = [dx / len, dy / len];
    if (axes && (d[0] < -1e-9 || d[1] < -1e-9)) return false;
    return cons.every((k) => k.a * d[0] + k.b * d[1] <= 1e-9) && cx * d[0] + cy * d[1] > 1e-9;
  });
}

const randomBounded = (rnd: Rnd): { cons: Constraint[]; cx: number; cy: number } => ({
  cons: Array.from({ length: ri(rnd, 3, 5) }, () => ({ a: ri(rnd, 1, 4), b: ri(rnd, 1, 4), c: ri(rnd, 4, 20) })),
  cx: ri(rnd, 1, 5),
  cy: ri(rnd, 1, 5),
});

const randomMixed = (rnd: Rnd): { cons: Constraint[]; cx: number; cy: number } => ({
  cons: Array.from({ length: ri(rnd, 1, MAX_CONSTRAINTS) }, () => ({ a: ri(rnd, -8, 8) / 2, b: ri(rnd, -8, 8) / 2, c: ri(rnd, -20, 40) / 2 })).filter((k) => k.a !== 0 || k.b !== 0),
  cx: ri(rnd, -5, 5),
  cy: ri(rnd, -5, 5),
});

const D = DEFAULT_CONSTRAINTS;
const near = (v: { x: number; y: number }, x: number, y: number) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.y - y) < 1e-9;

describe('the default region, by hand', () => {
  it('has five vertices: (0,0), (3,0), (3,1), (2.5,1.5) and (0, 7/3)', () => {
    const s = solve(D, 3, 2);
    expect(s.vertices).toHaveLength(5);
    for (const [x, y] of [[0, 0], [3, 0], [3, 1], [2.5, 1.5], [0, 7 / 3]]) expect(s.vertices.some((v) => near(v, x, y)), `(${x}, ${y})`).toBe(true);
    // x = 3 meets x + y = 4 at (3, 1) and x + 3y = 3 + 3 = 6 <= 7 holds; x + y = 4 meets x + 3y = 7: 2y = 3, y = 1.5, x = 2.5
    expect(3 + 3 * 1).toBeLessThanOrEqual(7);
  });

  it('3x + 2y: the values are 0, 9, 11, 10.5 and 4.667, so the optimum is 11 at (3, 1)', () => {
    const s = solve(D, 3, 2);
    const byPoint = (x: number, y: number) => s.vertices.find((v) => near(v, x, y))!.value;
    expect(byPoint(0, 0)).toBe(0);
    expect(byPoint(3, 0)).toBe(9);
    expect(byPoint(3, 1)).toBe(3 * 3 + 2 * 1);
    expect(byPoint(2.5, 1.5)).toBeCloseTo(3 * 2.5 + 2 * 1.5, 12);
    expect(byPoint(0, 7 / 3)).toBeCloseTo(2 * (7 / 3), 12);
    expect(s).toMatchObject({ status: 'optimal', value: 11 });
    expect(s.best).toHaveLength(1);
    expect(near(s.best[0], 3, 1)).toBe(true);
    expect(solutionText(D, s)).toBe('Optimal: 11 at (3, 1).');
  });

  it('x + 2y gives 5.5 at (2.5, 1.5); x + y ties at 4 between (3, 1) and (2.5, 1.5); y alone 7/3; minus x minus y 0 at the origin', () => {
    expect(solve(D, 1, 2)).toMatchObject({ status: 'optimal', value: 5.5 });
    expect(near(solve(D, 1, 2).best[0], 2.5, 1.5)).toBe(true);
    const tie = solve(D, 1, 1);
    expect(tie.value).toBe(4);
    expect(tie.best).toHaveLength(2);
    expect(tie.best.some((v) => near(v, 3, 1))).toBe(true);
    expect(tie.best.some((v) => near(v, 2.5, 1.5))).toBe(true);
    expect(tieText(tie.best)).toContain('the whole edge between them is optimal');
    expect(solve(D, 0, 1).value).toBeCloseTo(7 / 3, 12);
    const flat = solve(D, -1, -1);
    expect(flat.value).toBe(0);
    expect(near(flat.best[0], 0, 0)).toBe(true);
  });

  it('adding -x - y <= -5 leaves no vertex: Infeasible, and the clash is x + y <= 4 against -x - y <= -5', () => {
    const cons = [...D, { a: -1, b: -1, c: -5 }];
    expect(solve(cons, 3, 2).status).toBe('infeasible');
    expect(isFeasible(cons)).toBe(false);
    expect(fmFeasible(cons)).toBe(false);
    expect(clashCore(cons)).toEqual([0, 3]);
    expect(solutionText(cons, solve(cons, 3, 2))).toBe(
      'Infeasible: no point satisfies all constraints. The clash is x + y <= 4 against -x - y <= -5 (together they need x + y at most 4 and at least 5).',
    );
  });

  it('a single constraint -x - y <= -1 with the objective x + y is unbounded: the optimum sits on the wall at (1000, 1000), value 2000', () => {
    const s = solve([{ a: -1, b: -1, c: -1 }], 1, 1);
    expect(s.status).toBe('unbounded');
    expect(s.value).toBe(2 * BOX);
    expect(near(s.best[0], BOX, BOX)).toBe(true);
    expect(recessionImproves([{ a: -1, b: -1, c: -1 }], 1, 1)).toBe(true);
    expect(solutionText([{ a: -1, b: -1, c: -1 }], s)).toBe(UNBOUNDED_TEXT);
    expect(UNBOUNDED_TEXT).toBe('Unbounded: the best point sits on the artificial wall at 1,000. Nothing in the constraints stops the objective growing.');
  });

  it('the extremes: c at its minimum with x + y <= -10 is infeasible; c at its maximum 20 gives 20 tied along the whole edge', () => {
    const lowest = [{ a: 1, b: 1, c: LIMITS.bound.min }];
    expect(solve(lowest, 1, 1).status).toBe('infeasible');
    expect(solutionText(lowest, solve(lowest, 1, 1))).toContain('x + y <= -10 cannot hold together with x >= 0 and y >= 0');
    const highest = [{ a: 1, b: 1, c: LIMITS.bound.max }];
    const s = solve(highest, 1, 1);
    expect(s).toMatchObject({ status: 'optimal', value: 20 });
    expect(s.best).toHaveLength(2);
    expect(s.best.some((v) => near(v, 20, 0))).toBe(true);
    expect(s.best.some((v) => near(v, 0, 20))).toBe(true);
  });

  it('manipulation 1: the clash found for an infeasible region names the two constraints, and the empty region is refused', () => {
    const cons = [...D, { a: -1, b: -1, c: -5 }];
    const core = clashCore(cons)!;
    expect(core.map((i) => constraintText(cons[i]))).toEqual(['x + y <= 4', '-x - y <= -5']);
    expect(infeasibleText(cons, core)).toContain('The clash is x + y <= 4 against -x - y <= -5');
    expect(clashCore(D)).toBeNull();
  });

  it('manipulation 2: an objective the region does not bound is refused as unbounded with the wall named', () => {
    const open = [{ a: -1, b: 0, c: -2 }];
    expect(solve(open, 1, 0).status).toBe('unbounded');
    expect(solutionText(open, solve(open, 1, 0))).toContain('the artificial wall at 1,000');
    expect(solve(open, -1, 0).status).toBe('optimal');
    expect(recessionImproves(open, 1, 0)).toBe(true);
    expect(recessionImproves(open, -1, 0)).toBe(false);
  });

  it('writes constraints and objectives as the page shows them', () => {
    expect(expression(1, 1)).toBe('x + y');
    expect(expression(-1, -1)).toBe('-x - y');
    expect(expression(1, 3)).toBe('x + 3y');
    expect(expression(2, -1)).toBe('2x - y');
    expect(expression(0, -1)).toBe('-y');
    expect(expression(0, 0)).toBe('0');
    expect(expression(-2.5, 4)).toBe('-2.5x + 4y');
    expect(constraintText({ a: 1, b: 0, c: 3 })).toBe('x <= 3');
    expect(vertexText({ x: 2.5, y: 7 / 3 })).toBe('(2.5, 2.333)');
    expect(round(4.0000000001)).toBe('4');
  });
});

describe('the vertex theorem and the solver, against independent oracles', () => {
  it('on 200 seeded bounded LPs a grid search never beats the vertex optimum and gets within 0.05 (|cx| + |cy|) of it', () => {
    const rnd = mulberry32(4);
    let widest = 0;
    for (let n = 0; n < 200; n++) {
      const { cons, cx, cy } = randomBounded(rnd);
      const s = solve(cons, cx, cy);
      expect(s.status, `LP ${n}`).toBe('optimal');
      const grid = gridBest(cons, cx, cy, 20, 0.05)!;
      expect(grid, `LP ${n}`).toBeLessThanOrEqual(s.value! + 1e-9);
      widest = Math.max(widest, (s.value! - grid) / (cx + cy));
      expect(s.value! - grid, `LP ${n}`).toBeLessThanOrEqual(0.05 * (Math.abs(cx) + Math.abs(cy)) + 1e-9);
    }
    expect(widest).toBeLessThanOrEqual(0.05);
  }, 120_000);

  it('a second algorithm, greedy edge walking from the origin, reaches the same optimum on the same 200 LPs', () => {
    const rnd = mulberry32(4);
    for (let n = 0; n < 200; n++) {
      const { cons, cx, cy } = randomBounded(rnd);
      expect(greedyWalk(cons, cx, cy), `LP ${n}`).toBeCloseTo(solve(cons, cx, cy).value!, 6);
    }
  });

  it('the feasible and unbounded verdicts agree with Fourier-Motzkin and the recession cone on 400 seeded mixed-sign LPs', () => {
    const rnd = mulberry32(12);
    let infeasible = 0;
    let unbounded = 0;
    for (let n = 0; n < 400; n++) {
      const { cons, cx, cy } = randomMixed(rnd);
      const s = solve(cons, cx, cy);
      const feasible = fmFeasible(cons);
      expect(s.status !== 'infeasible', `LP ${n} feasibility ${JSON.stringify(cons)}`).toBe(feasible);
      if (!feasible) {
        infeasible++;
        continue;
      }
      const grows = recessionImproves(cons, cx, cy);
      expect(s.status === 'unbounded', `LP ${n} boundedness ${JSON.stringify({ cons, cx, cy })}`).toBe(grows);
      if (grows) unbounded++;
    }
    expect(infeasible).toBeGreaterThan(20);
    expect(unbounded).toBeGreaterThan(20);
  });

  it('a clash is a minimal infeasible set of at most 3 constraints on 400 seeded systems (Helly), found newest-first', () => {
    const rnd = mulberry32(12);
    let seen = 0;
    for (let n = 0; n < 400; n++) {
      const { cons } = randomMixed(rnd);
      const core = clashCore(cons);
      if (core === null) {
        expect(fmFeasible(cons)).toBe(true);
        continue;
      }
      seen++;
      expect(core.length).toBeGreaterThanOrEqual(1);
      expect(core.length).toBeLessThanOrEqual(3);
      expect(fmFeasible(core.map((i) => cons[i]))).toBe(false);
      for (const drop of core) expect(fmFeasible(core.filter((i) => i !== drop).map((i) => cons[i])), `dropping ${drop}`).toBe(true);
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('every bounded vertex has coordinates below 640 over slider-range constraints, so the wall at 1,000 never touches a real vertex', () => {
    const rnd = mulberry32(77);
    let worst = 0;
    for (let n = 0; n < 3000; n++) {
      const cons: Constraint[] = Array.from({ length: ri(rnd, 2, MAX_CONSTRAINTS) }, () => ({
        a: ri(rnd, LIMITS.coefficient.min * 2, LIMITS.coefficient.max * 2) / 2,
        b: ri(rnd, LIMITS.coefficient.min * 2, LIMITS.coefficient.max * 2) / 2,
        c: ri(rnd, LIMITS.bound.min * 2, LIMITS.bound.max * 2) / 2,
      })).filter((k) => k.a !== 0 || k.b !== 0);
      for (const v of solve(cons, 1, 1).vertices) worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
    }
    expect(worst).toBeLessThan(640);
    // the extreme corner by hand: |numerator| <= 2 x 20 x 4 = 160 over the smallest non-zero determinant 0.25
    expect((2 * 20 * 4) / 0.25).toBe(640);
  });

  it('the sliders at their extremes and one beyond give a verdict, never a crash', () => {
    const ends = [LIMITS.coefficient.min, LIMITS.coefficient.max];
    for (const a of ends) for (const b of ends) for (const c of [LIMITS.bound.min, LIMITS.bound.max]) {
      for (const [cx, cy] of [[LIMITS.objective.min, LIMITS.objective.min], [LIMITS.objective.max, LIMITS.objective.max], [0, 0]]) {
        const s = solve([{ a, b, c }], cx, cy);
        expect(['optimal', 'infeasible', 'unbounded']).toContain(s.status);
      }
    }
    expect(solve([{ a: LIMITS.coefficient.max + 1, b: 0, c: 3 }], 1, 0).status).toBe('optimal');
    expect(solve(D, 0, 0).status).toBe('optimal');
    expect(solve(D, 0, 0).best.length).toBe(5);
  });

  it('three lines through one point do not duplicate the vertex', () => {
    const cons: Constraint[] = [{ a: 1, b: 1, c: 4 }, { a: 1, b: 3, c: 6 }, { a: 1, b: 0, c: 3 }, { a: 3, b: 1, c: 10 }];
    // x = 3, x + y = 4, x + 3y = 6 and 3x + y = 10 all pass through (3, 1)
    const s = solve(cons, 3, 2);
    expect(s.vertices.filter((v) => near(v, 3, 1))).toHaveLength(1);
    expect(s.value).toBe(11);
  });
});

describe('the solver that is wrong, and the smallest case that shows it', () => {
  it('forgetting x, y >= 0: on the default region minimising y, the correct answer is optimal 0 and the broken one is unbounded', () => {
    const w = NO_AXES_WITNESS;
    const right = solve(w.constraints, w.cx, w.cy);
    expect(right).toMatchObject({ status: 'optimal', value: 0 });
    expect(right.best).toHaveLength(2);
    const wrong = solve(w.constraints, w.cx, w.cy, SOLVER_OPTIONS['no-axes']);
    expect(wrong.status).toBe('unbounded');
    expect(wrong.value).toBe(BOX);
    expect(brokenRule(w.constraints, w.cx, w.cy, 'no-axes')).toBe('the verdict is unbounded but the correct one is optimal');
    expect(brokenRule(w.constraints, w.cx, w.cy, 'correct')).toBeNull();
    expect(NO_AXES_WITNESS.correct).toBe(0);
  });

  it('skipping the feasibility check reports 21 at (7, 0) on the default region, which breaks x <= 3 and x + y <= 4, against the true 11', () => {
    const w = NO_FEASIBILITY_WITNESS;
    const wrong = solve(w.constraints, w.cx, w.cy, SOLVER_OPTIONS['no-feasibility']);
    expect(wrong.value).toBe(21);
    expect(near(wrong.best[0], 7, 0)).toBe(true);
    expect(ok(w.constraints[2], 7, 0)).toBe(false);
    expect(ok(w.constraints[0], 7, 0)).toBe(false);
    expect(brokenRule(w.constraints, w.cx, w.cy, 'no-feasibility')).toBe('the reported point violates a constraint');
    expect(solve(w.constraints, w.cx, w.cy).value).toBe(w.correct);
  });

  it('the fixed solver passes every input the broken ones fail on, and the share of 200 seeded LPs each fails on is measured', () => {
    const rnd = mulberry32(2026);
    let noAxes = 0;
    let noFeasibility = 0;
    for (let n = 0; n < 200; n++) {
      const { cons, cx, cy } = randomMixed(rnd);
      const right = solve(cons, cx, cy);
      if (right.status !== 'infeasible') expect(brokenRule(cons, cx, cy, 'correct')).toBeNull();
      if (brokenRule(cons, cx, cy, 'no-axes')) noAxes++;
      if (brokenRule(cons, cx, cy, 'no-feasibility')) noFeasibility++;
    }
    expect(noAxes).toBe(NO_AXES_OF_200);
    expect(noFeasibility).toBe(NO_FEASIBILITY_OF_200);
  });
});

describe('whole numbers, by hand and by brute force', () => {
  it('for x + 2y the LP optimum (2.5, 1.5) is worth 5.5, rounding gives (3, 2) which breaks x + y <= 4 (5 > 4), and the best whole points are (1, 2) and (3, 1) worth 5', () => {
    const lp = solve(D, 1, 2);
    const ints = integerSolution(D, 1, 2);
    // independent walk: every whole point with x, y in 0..20, checked constraint by constraint
    const feasible: [number, number][] = [];
    for (let x = 0; x <= 20; x++) for (let y = 0; y <= 20; y++) if (x + y <= 4 && x + 3 * y <= 7 && x <= 3) feasible.push([x, y]);
    const bestValue = Math.max(...feasible.map(([x, y]) => x + 2 * y));
    expect(bestValue).toBe(5);
    expect(feasible.filter(([x, y]) => x + 2 * y === 5).sort()).toEqual([[1, 2], [3, 1]]);
    expect(ints.points).toHaveLength(feasible.length);
    expect(ints.value).toBe(5);
    expect(ints.best.map((p) => [p.x, p.y]).sort()).toEqual([[1, 2], [3, 1]]);
    expect(roundedPoint(lp.best[0])).toEqual({ x: 3, y: 2 });
    expect(firstViolation(D, { x: 3, y: 2 })).toMatchObject({ lhs: 5 });
    expect(integerText(D, lp, ints)).toBe(
      'The LP optimum is 5.5 at (2.5, 1.5). Rounding (2.5, 1.5) to (3, 2) breaks x + y <= 4 (5 > 4). The best whole points are (1, 2) and (3, 1), worth 5.',
    );
  });

  it('the integer optimum never beats the LP optimum on 200 seeded bounded LPs', () => {
    const rnd = mulberry32(8);
    for (let n = 0; n < 200; n++) {
      const { cons, cx, cy } = randomBounded(rnd);
      expect(integerSolution(cons, cx, cy).value!).toBeLessThanOrEqual(solve(cons, cx, cy).value! + 1e-9);
    }
  });
});

describe('the share of seeded LPs the forgetful solver gets wrong', () => {
  it('on 200 bounded LPs with objectives in [-5, 5] the solver without x, y >= 0 says unbounded exactly when the recession cone without the axes improves', () => {
    const rnd = mulberry32(2027);
    let wrong = 0;
    for (let n = 0; n < 200; n++) {
      const { cons } = randomBounded(rnd);
      const cx = ri(rnd, -5, 5);
      const cy = ri(rnd, -5, 5);
      const noAxes = solve(cons, cx, cy, SOLVER_OPTIONS['no-axes']);
      expect(noAxes.status === 'unbounded', `LP ${n}`).toBe(recessionImproves(cons, cx, cy, false));
      if (brokenRule(cons, cx, cy, 'no-axes') !== null) wrong++;
    }
    expect(wrong).toBe(BOUNDED_NO_AXES_OF_200);
  });
});

describe('one simplex step, geometrically', () => {
  const [cx, cy] = [3, 2];

  it('from (0,0) the two edges go to (3,0) and (0, 7/3), and the ratio test along +x meets x + y <= 4 at 4, x + 3y <= 7 at 7 and x <= 3 at 3', () => {
    const edges = edgesAt(D, cx, cy, START_VERTEX);
    expect(edges).toHaveLength(2);
    const east = edges.find((e) => near(e.to, 3, 0))!;
    expect(east.ratio.map((r) => [r.constraint, r.at])).toEqual([['x + y <= 4', 4], ['x + 3y <= 7', 7], ['x <= 3', 3]]);
    expect(east.step).toBe(3);
    expect(east.change).toBe(9);
    expect(east.improves).toBe(true);
    const north = edges.find((e) => near(e.to, 0, 7 / 3))!;
    expect(north.step).toBeCloseTo(7 / 3, 12);
    expect(north.change).toBeCloseTo(14 / 3, 12);
  });

  it('the walk goes (0,0) to (3,0) worth 9, then up to (3,1) worth 11, and there no edge improves', () => {
    let at = START_VERTEX;
    const visited: number[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const improving = edgesAt(D, cx, cy, at).filter((e) => e.improves);
      if (improving.length === 0) break;
      const best = improving.reduce((a, b) => (b.change > a.change ? b : a));
      const move = walkEdge(cx, cy, at, best);
      expect(move.ok).toBe(true);
      if (!move.ok) return;
      at = move.to;
      visited.push(at.value);
    }
    expect(visited).toEqual([9, 11]);
    expect(near(at, 3, 1)).toBe(true);
    expect(edgesAt(D, cx, cy, at).every((e) => !e.improves)).toBe(true);
    expect(polygon(D, cx, cy)).toHaveLength(5);
  });

  it('manipulation 3: walking an edge that does not improve is refused with the objective before and after', () => {
    const at = polygon(D, cx, cy).find((v) => near(v, 3, 0))!;
    expect(at.value).toBe(9);
    const back = edgesAt(D, cx, cy, at).find((e) => near(e.to, 0, 0))!;
    expect(walkEdge(cx, cy, at, back)).toEqual({
      ok: false,
      text: 'That edge lowers 3x + 2y from 9 to 0: a simplex step only follows an edge that improves the objective.',
    });
    const flat = polygon(D, 1, 1).find((v) => near(v, 3, 1))!;
    const along = edgesAt(D, 1, 1, flat).find((e) => near(e.to, 2.5, 1.5))!;
    expect(walkEdge(1, 1, flat, along)).toEqual({ ok: false, text: 'That edge leaves x + y at 4: a simplex step only follows an edge that improves the objective.' });
  });
});

const NO_AXES_OF_200 = 107;
const NO_FEASIBILITY_OF_200 = 166;
/** On the spec-style generator (bounded constraints, objective coefficients in [-5, 5]) the forgetful solver is wrong on 180 of 200 = 90.0%: borderline, so the page also shows the named witness. */
const BOUNDED_NO_AXES_OF_200 = 180;
