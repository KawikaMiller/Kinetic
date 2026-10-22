/**
 * Two-variable linear programming by vertex enumeration: maximise cx x + cy y under up to six constraints
 * a x + b y <= c and the implicit x >= 0, y >= 0. Every vertex of the feasible region is the meeting point of two
 * of the constraint lines (the axes and the artificial wall included), so trying every pair and keeping the feasible
 * ones finds them all; the best of them is the optimum (the vertex theorem, checked by the tests, not assumed).
 */

export interface Constraint {
  a: number;
  b: number;
  c: number;
}

/** The artificial wall: the region is cut at x and y = BOX, and an optimum that sits on the wall is the "unbounded" verdict. */
export const BOX = 1000;
/** Floating-point tolerance for "on a line" and "equal". */
export const TOL = 1e-9;
export const MAX_CONSTRAINTS = 6;
export const LIMITS = {
  coefficient: { min: -4, max: 4, step: 0.5 },
  bound: { min: -10, max: 20, step: 0.5 },
  objective: { min: -5, max: 5, step: 1 },
} as const;

export interface Vertex {
  x: number;
  y: number;
  /** The objective at this vertex. */
  value: number;
}

export type Status = 'optimal' | 'infeasible' | 'unbounded';

export interface Solution {
  status: Status;
  /** Finite vertices of the feasible region (none on the wall), in no particular order. */
  vertices: Vertex[];
  /** The vertices that attain the optimum (on the wall when unbounded); empty when infeasible. */
  best: Vertex[];
  /** The optimal objective value, or null when infeasible. */
  value: number | null;
}

export interface Options {
  /** Include x >= 0 and y >= 0 (default true). The broken solver that forgets them passes false. */
  axes?: boolean;
  /** Keep only the intersection points that satisfy every constraint (default true). The other broken solver passes false. */
  checkFeasibility?: boolean;
}

const AXES: readonly Constraint[] = [{ a: -1, b: 0, c: 0 }, { a: 0, b: -1, c: 0 }];
const WALL: readonly Constraint[] = [{ a: 1, b: 0, c: BOX }, { a: 0, b: 1, c: BOX }];
const NEGATIVE_WALL: readonly Constraint[] = [{ a: -1, b: 0, c: BOX }, { a: 0, b: -1, c: BOX }];

const holds = (k: Constraint, x: number, y: number) => k.a * x + k.b * y <= k.c + TOL;
const onWall = (v: { x: number; y: number }) => Math.abs(v.x) >= BOX - TOL || Math.abs(v.y) >= BOX - TOL;

/** The meeting point of two constraint lines, or null when they are parallel. */
export function intersect(p: Constraint, q: Constraint): { x: number; y: number } | null {
  const det = p.a * q.b - q.a * p.b;
  if (Math.abs(det) < TOL) return null;
  return { x: (p.c * q.b - q.c * p.b) / det + 0, y: (p.a * q.c - q.a * p.c) / det + 0 };
}

export function solve(constraints: readonly Constraint[], cx: number, cy: number, options: Options = {}): Solution {
  const { axes = true, checkFeasibility = true } = options;
  const all: Constraint[] = [...constraints, ...(axes ? AXES : NEGATIVE_WALL), ...WALL];
  /** Without the feasibility check the solver also has no wall: it only meets the lines it was given. */
  const lines: Constraint[] = checkFeasibility ? all : [...constraints, ...(axes ? AXES : [])];
  const points: Vertex[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const p = intersect(lines[i], lines[j]);
      if (!p) continue;
      if (checkFeasibility && !all.every((k) => holds(k, p.x, p.y))) continue;
      if (points.some((q) => Math.abs(q.x - p.x) < TOL && Math.abs(q.y - p.y) < TOL)) continue;
      points.push({ ...p, value: cx * p.x + cy * p.y + 0 });
    }
  }
  if (points.length === 0) return { status: 'infeasible', vertices: [], best: [], value: null };
  const finite = points.filter((v) => !onWall(v));
  const top = Math.max(...points.map((v) => v.value));
  const topFinite = finite.length > 0 ? Math.max(...finite.map((v) => v.value)) : -Infinity;
  if (top > topFinite + TOL) {
    return { status: 'unbounded', vertices: finite, best: points.filter((v) => v.value >= top - TOL), value: top };
  }
  return { status: 'optimal', vertices: finite, best: finite.filter((v) => v.value >= top - TOL), value: top };
}

export const isFeasible = (constraints: readonly Constraint[]): boolean => solve(constraints, 0, 0).status !== 'infeasible';

/**
 * A clash: a minimal set of constraints (indices) that cannot all hold. Found by dropping one constraint at a time,
 * newest first, and keeping it dropped while the rest stay infeasible. Null when the system is feasible. In the plane a
 * minimal clash has at most three constraints (Helly's theorem).
 */
export function clashCore(constraints: readonly Constraint[]): number[] | null {
  if (isFeasible(constraints)) return null;
  let kept = constraints.map((_, i) => i);
  for (let i = constraints.length - 1; i >= 0; i--) {
    const trial = kept.filter((k) => k !== i);
    if (!isFeasible(trial.map((k) => constraints[k]))) kept = trial;
  }
  return kept;
}

// Words for constraints and objectives

const absText = (v: number) => String(Math.abs(v));

/** `a x + b y` as the page writes it: x + y, -x - y, x + 3y, 2x - y, -y. */
export function expression(a: number, b: number): string {
  const term = (coef: number, name: string) => (Math.abs(coef) === 1 ? name : `${absText(coef)}${name}`);
  const parts: { sign: '+' | '-'; text: string }[] = [];
  if (a !== 0) parts.push({ sign: a < 0 ? '-' : '+', text: term(a, 'x') });
  if (b !== 0) parts.push({ sign: b < 0 ? '-' : '+', text: term(b, 'y') });
  if (parts.length === 0) return '0';
  return parts.map((p, i) => (i === 0 ? `${p.sign === '-' ? '-' : ''}${p.text}` : ` ${p.sign} ${p.text}`)).join('');
}

export const constraintText = (k: Constraint): string => `${expression(k.a, k.b)} <= ${k.c}`;
export const objectiveText = (cx: number, cy: number): string => expression(cx, cy);

export const vertexText = (v: { x: number; y: number }): string => `(${round(v.x)}, ${round(v.y)})`;
/** Numbers as the page shows them: whole when whole, else to 3 decimals without trailing zeros. */
export const round = (v: number): string => String(Number(v.toFixed(3)));

// Default region and the pieces the tests and lesson text refer to

export const DEFAULT_CONSTRAINTS: readonly Constraint[] = [{ a: 1, b: 1, c: 4 }, { a: 1, b: 3, c: 7 }, { a: 1, b: 0, c: 3 }];
export const DEFAULT_OBJECTIVE = { cx: 3, cy: 2 } as const;

/** Two constraints with opposite directions: a x + b y <= c and the same line the other way round. */
export function antiparallel(p: Constraint, q: Constraint): number | null {
  const cross = p.a * q.b - q.a * p.b;
  if (Math.abs(cross) > TOL) return null;
  const k = p.a !== 0 ? -q.a / p.a : -q.b / p.b;
  return k > 0 ? k : null;
}

/** The sentence the page prints for an infeasible system. */
export function infeasibleText(constraints: readonly Constraint[], core: readonly number[]): string {
  const named = core.map((i) => constraintText(constraints[i]));
  const head = 'Infeasible: no point satisfies all constraints.';
  if (core.length === 1) return `${head} ${named[0]} cannot hold together with x >= 0 and y >= 0.`;
  if (core.length === 2) {
    const [p, q] = [constraints[core[0]], constraints[core[1]]];
    const k = antiparallel(p, q);
    if (k !== null) {
      const lower = round(-q.c / k);
      return `${head} The clash is ${named[0]} against ${named[1]} (together they need ${expression(p.a, p.b)} at most ${round(p.c)} and at least ${lower}).`;
    }
    return `${head} The clash is ${named[0]} against ${named[1]} (no point of the quadrant satisfies both).`;
  }
  return `${head} The clash is ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]} (no point satisfies all three).`;
}

export const UNBOUNDED_TEXT = `Unbounded: the best point sits on the artificial wall at ${BOX.toLocaleString('en-US')}. Nothing in the constraints stops the objective growing.`;

export function tieText(best: readonly Vertex[]): string | null {
  if (best.length < 2) return null;
  const ends = best.map(vertexText);
  return `Tie: ${ends.join(' and ')} are both worth ${round(best[0].value)}, so the whole edge between them is optimal and the best point is not unique.`;
}

export function solutionText(constraints: readonly Constraint[], s: Solution): string {
  if (s.status === 'infeasible') return infeasibleText(constraints, clashCore(constraints) ?? []);
  if (s.status === 'unbounded') return UNBOUNDED_TEXT;
  return tieText(s.best) ?? `Optimal: ${round(s.value!)} at ${vertexText(s.best[0])}.`;
}

// The solver that is wrong, and the smallest case that shows it

/**
 * The shortest witness that forgetting x, y >= 0 is a bug: the default region with the objective "minimise y"
 * (cx = 0, cy = -1). The correct answer is optimal, value 0, tied along the bottom edge from (0, 0) to (3, 0); the solver
 * without the axes says unbounded, because y can run to minus BOX.
 */
export const NO_AXES_WITNESS = { constraints: DEFAULT_CONSTRAINTS, cx: 0, cy: -1, correct: 0 } as const;

/** The second broken solver's witness: the default region with 3x + 2y, where skipping the feasibility check reports 21 at (7, 0). */
export const NO_FEASIBILITY_WITNESS = { constraints: DEFAULT_CONSTRAINTS, cx: 3, cy: 2, reported: { x: 7, y: 0, value: 21 }, correct: 11 } as const;

export type SolverMode = 'correct' | 'no-axes' | 'no-feasibility';
export const SOLVER_OPTIONS: Record<SolverMode, Options> = {
  correct: {},
  'no-axes': { axes: false },
  'no-feasibility': { checkFeasibility: false },
};

/** The rule a wrong answer breaks, or null when the broken solver happened to agree with the correct one. */
export function brokenRule(constraints: readonly Constraint[], cx: number, cy: number, mode: SolverMode): string | null {
  if (mode === 'correct') return null;
  const right = solve(constraints, cx, cy);
  const wrong = solve(constraints, cx, cy, SOLVER_OPTIONS[mode]);
  if (mode === 'no-feasibility') {
    const v = wrong.best[0];
    const violates = v !== undefined && [...constraints, ...AXES].some((k) => !holds(k, v.x, v.y));
    return violates ? 'the reported point violates a constraint' : null;
  }
  return wrong.status !== right.status || (wrong.status === 'optimal' && Math.abs((wrong.value ?? 0) - (right.value ?? 0)) > TOL)
    ? `the verdict is ${wrong.status} but the correct one is ${right.status}`
    : null;
}

// Whole numbers

/** The integer points to try: a region of the lesson never reaches past this in x or y. */
export const INTEGER_SEARCH = 20;

export interface IntegerSolution {
  /** Every whole point of the region. */
  points: Vertex[];
  best: Vertex[];
  value: number | null;
}

/** Every whole point (x, y >= 0) that satisfies the constraints, and the best of them for the objective. */
export function integerSolution(constraints: readonly Constraint[], cx: number, cy: number): IntegerSolution {
  const points: Vertex[] = [];
  for (let x = 0; x <= INTEGER_SEARCH; x++) {
    for (let y = 0; y <= INTEGER_SEARCH; y++) {
      if (constraints.every((k) => holds(k, x, y))) points.push({ x, y, value: cx * x + cy * y + 0 });
    }
  }
  const top = points.length > 0 ? Math.max(...points.map((p) => p.value)) : null;
  return { points, best: top === null ? [] : points.filter((p) => p.value >= top - TOL), value: top };
}

/** The first constraint a point breaks, with how far over it is, or null when the point is allowed. */
export function firstViolation(constraints: readonly Constraint[], p: { x: number; y: number }): { constraint: Constraint; lhs: number } | null {
  const k = constraints.find((c) => !holds(c, p.x, p.y));
  return k ? { constraint: k, lhs: k.a * p.x + k.b * p.y } : null;
}

/** Rounding the LP optimum to the nearest whole point (halves round up), as the page tries it. */
export const roundedPoint = (v: { x: number; y: number }): { x: number; y: number } => ({ x: Math.round(v.x), y: Math.round(v.y) });

export function integerText(constraints: readonly Constraint[], lp: Solution, ints: IntegerSolution): string {
  const at = lp.best[0];
  const rounded = roundedPoint(at);
  const broke = firstViolation(constraints, rounded);
  const rounding = broke
    ? `Rounding ${vertexText(at)} to ${vertexText(rounded)} breaks ${constraintText(broke.constraint)} (${round(broke.lhs)} > ${broke.constraint.c}).`
    : `Rounding ${vertexText(at)} to ${vertexText(rounded)} stays inside the region.`;
  const bestWhole = ints.best.map(vertexText).join(' and ');
  return `The LP optimum is ${round(lp.value!)} at ${vertexText(at)}. ${rounding} The best whole points are ${bestWhole}, worth ${round(ints.value!)}.`;
}
