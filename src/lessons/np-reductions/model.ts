import { mulberry32 } from '../../core/random';
import { bruteForce, clauseText, formatCnf, parseCnf, satisfiesCnf, type Cnf } from '../../core/sat';
import { isVertexCover, minVertexCover, uncoveredEdges, type Edge } from '../../core/vertexCover';

/**
 * The textbook 3-SAT to vertex-cover gadget graph. A formula with n variables and m clauses (each exactly three
 * literals, repeats allowed: a short clause is padded by repeating a literal) becomes a graph with 2n + 3m vertices:
 * a pair of literal vertices per variable (joined by a variable edge), and a triangle of three clause vertices per
 * clause, each joined to the literal vertex it names (a connection edge). K = n + 2m.
 */

export type Triple = readonly [number, number, number];
export interface Formula {
  /** Variables are x1 to x{vars}. */
  vars: number;
  /** A literal is +v or -v (variables 1-based). */
  clauses: readonly Triple[];
}

export const LIMITS = { maxVars: 4, maxClauses: 5 } as const;
export const VERTEX_LIMIT_FOR_COUNTING = 20;

export type EdgeKind = 'variable' | 'triangle' | 'connection';

export interface Gadget {
  formula: Formula;
  variableEdges: boolean;
  n: number;
  m: number;
  vertexCount: number;
  /** Size of the cover the reduction asks about. */
  K: number;
  edges: readonly Edge[];
  kinds: readonly EdgeKind[];
}

export const toCnf = (f: Formula): Cnf => ({ vars: f.vars, clauses: f.clauses.map((c) => [...c]) });

export const literalName = (lit: number): string => (lit < 0 ? `not x${-lit}` : `x${lit}`);
export const literalVertex = (lit: number): number => 2 * (Math.abs(lit) - 1) + (lit < 0 ? 1 : 0);
export const clauseVertex = (n: number, clause: number, slot: number): number => 2 * n + 3 * clause + slot;
export const clauseOfVertex = (n: number, v: number): { clause: number; slot: number } | null =>
  v < 2 * n ? null : { clause: Math.floor((v - 2 * n) / 3), slot: (v - 2 * n) % 3 };

/** The name a vertex goes by in refusal text: x1, not x1, c2.3 (clause 2, its third vertex). */
export function vertexName(n: number, v: number): string {
  const c = clauseOfVertex(n, v);
  if (c) return `c${c.clause + 1}.${c.slot + 1}`;
  return literalName(v % 2 === 0 ? v / 2 + 1 : -((v - 1) / 2 + 1));
}

export const clauseLabel = (f: Formula, j: number): string => clauseText(toCnf(f), f.clauses[j]);

export function buildGadget(formula: Formula, { variableEdges = true }: { variableEdges?: boolean } = {}): Gadget {
  const n = formula.vars;
  const m = formula.clauses.length;
  const edges: Edge[] = [];
  const kinds: EdgeKind[] = [];
  const add = (a: number, b: number, kind: EdgeKind) => {
    edges.push([a, b]);
    kinds.push(kind);
  };
  if (variableEdges) for (let i = 1; i <= n; i++) add(literalVertex(i), literalVertex(-i), 'variable');
  formula.clauses.forEach((clause, j) => {
    const [a, b, c] = [0, 1, 2].map((s) => clauseVertex(n, j, s));
    add(a, b, 'triangle');
    add(b, c, 'triangle');
    add(a, c, 'triangle');
    clause.forEach((lit, s) => add(clauseVertex(n, j, s), literalVertex(lit), 'connection'));
  });
  return { formula, variableEdges, n, m, vertexCount: 2 * n + 3 * m, K: n + 2 * m, edges, kinds };
}

const sameEdge = (e: Edge, a: number, b: number) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);
export const edgeIndex = (g: Gadget, a: number, b: number): number => g.edges.findIndex((e) => sameEdge(e, a, b));
export const edgeText = (g: Gadget, e: Edge): string => `(${vertexName(g.n, e[0])}, ${vertexName(g.n, e[1])})`;

// Scene 1: building the graph

export type EdgeJudgement = { ok: true; index: number } | { ok: false; text: string };

/** Whether the learner may add the edge a-b to a graph that already holds the edges `placed` (indices into `g.edges`). */
export function judgeEdge(g: Gadget, placed: ReadonlySet<number>, a: number, b: number): EdgeJudgement {
  const index = edgeIndex(g, a, b);
  if (index >= 0) {
    return placed.has(index) ? { ok: false, text: `The edge (${vertexName(g.n, a)}, ${vertexName(g.n, b)}) is already in the graph.` } : { ok: true, index };
  }
  const [clauseEnd, otherEnd] = clauseOfVertex(g.n, a) ? [a, b] : [b, a];
  const c = clauseOfVertex(g.n, clauseEnd);
  if (c && otherEnd < 2 * g.n) {
    const named = g.formula.clauses[c.clause][c.slot];
    if (literalVertex(-named) === otherEnd) {
      const picked = vertexName(g.n, otherEnd);
      const instead = named < 0 ? `not ${picked}` : `not the vertex ${picked}`;
      return {
        ok: false,
        text: `Clause ${c.clause + 1} has the literal ${literalName(named)} here, so ${vertexName(g.n, clauseEnd)} joins the vertex ${literalName(named)}, ${instead}: that would encode the opposite clause.`,
      };
    }
  }
  return {
    ok: false,
    text: `The construction never joins ${vertexName(g.n, a)} and ${vertexName(g.n, b)}: it joins only a literal to its own negation, the three vertices inside one clause, and a clause vertex to the literal it names.`,
  };
}

const EDGE_WORD: Record<EdgeKind, string> = { variable: 'variable edge', triangle: 'triangle edge', connection: 'connection edge' };

/** The first thing missing from the learner's graph (clauses in order, then variables), or null when it is complete. */
export function firstMissing(g: Gadget, placed: ReadonlySet<number>): string | null {
  const first = g.variableEdges ? g.n : 0;
  for (let j = 0; j < g.m; j++) {
    const mine = g.edges.map((_, i) => i).filter((i) => i >= first + 6 * j && i < first + 6 * (j + 1));
    const i = mine.find((k) => !placed.has(k));
    if (i !== undefined) {
      const [x, y] = g.edges[i];
      return `Clause ${j + 1} ${clauseLabel(g.formula, j)} is missing the ${EDGE_WORD[g.kinds[i]]} ${vertexName(g.n, x)} to ${vertexName(g.n, y)}`;
    }
  }
  for (let i = 0; i < g.edges.length; i++) {
    if (g.kinds[i] === 'variable' && !placed.has(i)) {
      const v = g.edges[i][0] / 2 + 1;
      return `Variable x${v} is missing its edge between x${v} and not x${v}`;
    }
  }
  return null;
}

// Scene 2: assignment to cover

const holds = (lit: number, assignment: readonly boolean[]) => (lit > 0 ? assignment[lit - 1] : !assignment[-lit - 1]);

export interface CoverFromAssignment {
  cover: number[];
  size: number;
  /** The clause vertex slot left out of each clause (null when the clause has no true literal and all three are covered). */
  leftOut: (number | null)[];
  falsified: number[];
  isCover: boolean;
}

/**
 * The cover the reduction builds from an assignment: the true literal of every variable, and in each clause every vertex
 * but one whose literal is true. `picks[j]` is the learner's choice of left-out slot for clause j; it counts only while
 * that slot's literal is true, otherwise the first true literal is left out.
 */
export function coverFromAssignment(g: Gadget, assignment: readonly boolean[], picks: readonly (number | undefined)[] = []): CoverFromAssignment {
  const cover: number[] = [];
  for (let i = 1; i <= g.n; i++) cover.push(literalVertex(assignment[i - 1] ? i : -i));
  const leftOut: (number | null)[] = [];
  const falsified: number[] = [];
  g.formula.clauses.forEach((clause, j) => {
    const trueSlots = [0, 1, 2].filter((s) => holds(clause[s], assignment));
    if (trueSlots.length === 0) {
      falsified.push(j);
      leftOut.push(null);
    } else {
      const p = picks[j];
      leftOut.push(p !== undefined && trueSlots.includes(p) ? p : trueSlots[0]);
    }
    for (let s = 0; s < 3; s++) if (leftOut[j] !== s) cover.push(clauseVertex(g.n, j, s));
  });
  return { cover, size: cover.length, leftOut, falsified, isCover: isVertexCover(g.edges, cover) };
}

export function assignmentCaption(g: Gadget, r: CoverFromAssignment): string {
  if (r.falsified.length === 0) {
    return `Every clause has a true literal, so the cover takes one literal vertex per variable and two vertices per clause: size ${r.size} = K = ${g.K}.`;
  }
  const j = r.falsified[0];
  const more = r.falsified.length > 1 ? ` (and ${r.falsified.length - 1} more clause${r.falsified.length > 2 ? 's' : ''} like it)` : '';
  return `Clause ${j + 1} has no true literal${more}, so all three of its vertices must be covered: size K + ${r.falsified.length} = ${r.size}.`;
}

// Scene 3: cover to assignment

export type CoverCheck =
  | { kind: 'too-small'; text: string }
  | { kind: 'uncovered'; text: string; edges: number[] }
  | { kind: 'too-big'; text: string }
  | { kind: 'ok'; text: string };

/** What pressing Check says about a set of vertices the learner picked as a cover. */
export function checkCover(g: Gadget, chosen: readonly number[]): CoverCheck {
  const bad = uncoveredEdges(g.edges, chosen);
  if (chosen.length < g.K && g.variableEdges) {
    const first = bad.length > 0 ? ` Edge ${edgeText(g, g.edges[bad[0]])} is still uncovered.` : '';
    return {
      kind: 'too-small',
      text: `No cover of ${chosen.length} exists: the ${g.n} variable edges are disjoint from each other and from the ${g.m} clause triangles, and a triangle needs 2 vertices, so every cover has at least ${g.n} + 2 x ${g.m} = ${g.K}.${first}`,
    };
  }
  if (bad.length > 0) return { kind: 'uncovered', edges: bad, text: `Edge ${edgeText(g, g.edges[bad[0]])} is still uncovered (${bad.length} edge${bad.length === 1 ? '' : 's'} in all).` };
  if (chosen.length > g.K) {
    return { kind: 'too-big', text: `This covers every edge with ${chosen.length} vertices, more than K = ${g.K}, so it says nothing about the formula yet: drop vertices until ${g.K} or fewer remain.` };
  }
  return { kind: 'ok', text: `A cover of ${chosen.length}, at most K = ${g.K}.` };
}

export type ReadValue = boolean | 'both' | 'neither';
export interface ReadAssignment {
  values: ReadValue[];
  decided: boolean;
  satisfied: boolean | null;
  text: string;
}

/** Read the assignment off a cover: a literal vertex in the cover is true. Checks the formula when every variable got one value. */
export function assignmentFromCover(g: Gadget, chosen: readonly number[]): ReadAssignment {
  const inCover = new Set(chosen);
  const values: ReadValue[] = [];
  for (let i = 1; i <= g.n; i++) {
    const pos = inCover.has(literalVertex(i));
    const neg = inCover.has(literalVertex(-i));
    values.push(pos && !neg ? true : neg && !pos ? false : pos ? 'both' : 'neither');
  }
  const decided = values.every((v) => v === true || v === false);
  const shown = values.map((v, i) => `x${i + 1} = ${v === true ? 'true' : v === false ? 'false' : v === 'both' ? 'both true and false' : 'neither'}`).join(', ');
  if (!decided) return { values, decided, satisfied: null, text: `${shown}: a variable that is both or neither has no truth value, so no assignment is read.` };
  const satisfied = satisfiesCnf(toCnf(g.formula), values as boolean[]);
  return { values, decided, satisfied, text: `${shown}: ${satisfied ? `every one of the ${g.m} clauses has a true literal` : 'some clause has no true literal'} (checked against the formula).` };
}

// Exact counts (an independent bitmask walk, separate from minVertexCover)

/** How many vertex sets of each size cover every edge, by trying all 2^V subsets (V at most 20). */
export function coverCountBySize(g: Gadget): number[] {
  if (g.vertexCount > VERTEX_LIMIT_FOR_COUNTING) throw new RangeError(`Counting every subset is limited to ${VERTEX_LIMIT_FOR_COUNTING} vertices; got ${g.vertexCount}.`);
  const masks = g.edges.map(([a, b]) => (1 << a) | (1 << b));
  const counts = new Array<number>(g.vertexCount + 1).fill(0);
  for (let s = 0; s < 1 << g.vertexCount; s++) {
    if (masks.every((mask) => (s & mask) !== 0)) counts[popcount(s)]++;
  }
  return counts;
}

function popcount(x: number): number {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
}

// Scene 4 and 5: whole formulas

const triple = (a: number, b: number, c: number): Triple => [a, b, c];

/** F1 of the lesson: (x1 or not x2 or x3) and (not x1 or x2 or not x3). */
export const F1: Formula = { vars: 3, clauses: [triple(1, -2, 3), triple(-1, 2, -3)] };
/** U: two variables, all four sign patterns of "x1 or x2", each padded by repeating a literal. */
export const U: Formula = { vars: 2, clauses: [triple(1, 2, 2), triple(1, -2, -2), triple(-1, 2, 2), triple(-1, -2, -2)] };
/** The smallest formula for which dropping the variable edges gives a wrong verdict (in the 793-formula order). */
export const F_STAR: Formula = { vars: 2, clauses: [triple(1, 1, 1), triple(-1, -1, -1)] };

export const PRESETS: readonly { id: string; label: string; formula: Formula }[] = [
  { id: 'f1', label: 'F1 (satisfiable)', formula: F1 },
  { id: 'u', label: 'U (unsatisfiable)', formula: U },
  { id: 'fstar', label: 'F* (the broken graph gets it wrong)', formula: F_STAR },
];

/** The twelve non-tautological clauses of exactly three literals over x1 and x2 (repeats allowed), in a fixed order. */
export const TWO_VAR_CLAUSES: readonly Triple[] = (() => {
  const order = [1, -1, 2, -2];
  const out: Triple[] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = a; b < 4; b++) {
      for (let c = b; c < 4; c++) {
        const t = triple(order[a], order[b], order[c]);
        if (!t.some((l) => t.includes(-l))) out.push(t);
      }
    }
  }
  return out;
})();

export const MAX_SWEEP_CLAUSES = 4;

/** The size of the exhaustive family, and how many of its formulas the graph without variable edges gets wrong (pinned by the tests against an independent oracle). */
export const EXHAUSTIVE_COUNT = 793;
export const BROKEN_FAILURES = 186;

/** All formulas over x1 and x2 with 1 to 4 of the twelve clauses (12 + 66 + 220 + 495 = 793), by clause count then clause list. */
export function twoVariableFormulas(): Formula[] {
  const out: Formula[] = [];
  const pick = (size: number, start: number, chosen: Triple[]) => {
    if (chosen.length === size) {
      out.push({ vars: 2, clauses: [...chosen] });
      return;
    }
    for (let i = start; i < TWO_VAR_CLAUSES.length; i++) pick(size, i + 1, [...chosen, TWO_VAR_CLAUSES[i]]);
  };
  for (let size = 1; size <= MAX_SWEEP_CLAUSES; size++) pick(size, 0, []);
  return out;
}

export const SAMPLE_SEED = 20241022;
export const SAMPLE_COUNT = 200;
export const SAMPLE_VARS = 3;

/** `count` seeded formulas over three variables with 1 to 4 clauses of three literals, never a clause holding x and not x. */
export function seededFormulas(seed: number, count: number): Formula[] {
  const rnd = mulberry32(seed);
  const draw = (): Triple => {
    for (;;) {
      const t = triple(
        ...([0, 1, 2].map(() => (1 + Math.floor(rnd() * SAMPLE_VARS)) * (rnd() < 0.5 ? -1 : 1)) as [number, number, number]),
      );
      if (!t.some((l) => t.includes(-l))) return t;
    }
  };
  return Array.from({ length: count }, () => ({
    vars: SAMPLE_VARS,
    clauses: Array.from({ length: 1 + Math.floor(rnd() * MAX_SWEEP_CLAUSES) }, draw),
  }));
}

export interface Verdict {
  satisfiable: boolean;
  /** The exact minimum cover of the graph. */
  minimum: number;
  K: number;
  /** The reduction's answer: "a cover of size K exists". */
  coverSaysSatisfiable: boolean;
  agrees: boolean;
  /** The rule a wrong verdict breaks. */
  rule: string | null;
}

export const WRONG_RULE = 'cover of size K exists but no assignment satisfies';
export const MISSED_RULE = 'no cover of size K exists but an assignment satisfies';

export function verdictOf(f: Formula, { variableEdges = true }: { variableEdges?: boolean } = {}): Verdict {
  const g = buildGadget(f, { variableEdges });
  const satisfiable = bruteForce(toCnf(f)).satisfiable;
  const minimum = minVertexCover(g.vertexCount, g.edges).size;
  const coverSaysSatisfiable = minimum <= g.K;
  const agrees = coverSaysSatisfiable === satisfiable;
  return { satisfiable, minimum, K: g.K, coverSaysSatisfiable, agrees, rule: agrees ? null : coverSaysSatisfiable ? WRONG_RULE : MISSED_RULE };
}

export interface Sweep {
  total: number;
  failures: number;
  /** The first formula (in the order given) with a wrong verdict. */
  first: Formula | null;
}

export function sweep(formulas: readonly Formula[], options: { variableEdges?: boolean } = {}): Sweep {
  let failures = 0;
  let first: Formula | null = null;
  for (const f of formulas) {
    if (!verdictOf(f, options).agrees) {
      failures++;
      first ??= f;
    }
  }
  return { total: formulas.length, failures, first };
}

// The formula editor

export const usedVariables = (clauses: readonly Triple[]): number => Math.max(0, ...clauses.flatMap((c) => c.map(Math.abs)));
export const formulaText = (f: Formula): string => formatCnf(toCnf(f));

export type FormulaRead = { ok: true; formula: Formula } | { ok: false; error: string };

/** Read a typed 3-SAT formula over x1 to x{vars}: exactly three literals a clause, at most `LIMITS.maxClauses` clauses, no x and not x together. */
export function parseFormula(text: string, vars: number): FormulaRead {
  const names = Array.from({ length: vars }, (_, i) => `x${i + 1}`);
  const r = parseCnf(text, { variables: names, clauseLength: { min: 3, max: 3 }, refuseTautology: true, maxClauses: LIMITS.maxClauses });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, formula: { vars, clauses: r.cnf.clauses.map((c) => triple(c[0], c[1], c[2])) } };
}

/** Change the number of variables, refused while a clause still uses a variable beyond the new count. */
export function withVariables(f: Formula, vars: number): FormulaRead {
  const used = usedVariables(f.clauses);
  if (vars < used) return { ok: false, error: `x${used} is used by a clause: edit the clauses before lowering the variables to ${vars}.` };
  return { ok: true, formula: { ...f, vars } };
}
