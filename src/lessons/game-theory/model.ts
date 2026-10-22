export const PAYOFF_MIN = -9;
export const PAYOFF_MAX = 9;
export const SIZE_MIN = 2;
export const SIZE_MAX = 3;
/** Scene 3 enumerates every 2 x 2 game with payoffs from 0 to this value: 4^8 = 65,536 games. */
export const ENUM_MAX_PAYOFF = 3;
/** The mixed-strategy sliders move in steps of 1/MIX_STEPS, so every preset's equilibrium sits exactly on a notch. */
export const MIX_STEPS = 24;

export type Matrix = readonly (readonly number[])[];

export interface Game {
  /** Row's payoffs: A[i][j] when Row plays i and Column plays j. */
  A: Matrix;
  /** Column's payoffs in the same cells. */
  B: Matrix;
  rowNames: readonly string[];
  colNames: readonly string[];
}

export const rowsOf = (g: Game) => g.A.length;
export const colsOf = (g: Game) => g.A[0].length;

export interface Preset {
  id: string;
  label: string;
  game: Game;
}

const two = (a: number[][], b: number[][], rows: string[], cols: string[]): Game => ({ A: a, B: b, rowNames: rows, colNames: cols });

export const PRISONERS_DILEMMA: Game = two([[-1, -3], [0, -2]], [[-1, 0], [-3, -2]], ['Cooperate', 'Defect'], ['Cooperate', 'Defect']);
export const MATCHING_PENNIES: Game = two([[1, -1], [-1, 1]], [[-1, 1], [1, -1]], ['Heads', 'Tails'], ['Heads', 'Tails']);
export const BATTLE_OF_THE_SEXES: Game = two([[2, 0], [0, 1]], [[1, 0], [0, 2]], ['Opera', 'Football'], ['Opera', 'Football']);
export const STAG_HUNT: Game = two([[4, 0], [3, 3]], [[4, 3], [0, 3]], ['Stag', 'Hare'], ['Stag', 'Hare']);

export const PRESETS: readonly Preset[] = [
  { id: 'pd', label: "Prisoner's dilemma", game: PRISONERS_DILEMMA },
  { id: 'mp', label: 'Matching pennies', game: MATCHING_PENNIES },
  { id: 'bos', label: 'Battle of the sexes', game: BATTLE_OF_THE_SEXES },
  { id: 'sh', label: 'Stag hunt', game: STAG_HUNT },
];

export type Cell = readonly [number, number];

/** Which deviations the equilibrium finder looks at: `rowOnly` is the broken mode. */
export type Finder = 'correct' | 'rowOnly';

export interface Deviation {
  player: 'Row' | 'Column';
  /** The strategy index the player would switch to. */
  to: number;
  now: number;
  after: number;
}

/** The first strictly profitable unilateral deviation from cell (r, c): Row's before Column's, lowest index first. */
export function firstDeviation(g: Game, r: number, c: number): Deviation | null {
  for (let i = 0; i < rowsOf(g); i += 1) if (g.A[i][c] > g.A[r][c]) return { player: 'Row', to: i, now: g.A[r][c], after: g.A[i][c] };
  for (let j = 0; j < colsOf(g); j += 1) if (g.B[r][j] > g.B[r][c]) return { player: 'Column', to: j, now: g.B[r][c], after: g.B[r][j] };
  return null;
}

/** A cell is an equilibrium when no player gains strictly by changing only their own strategy. The `rowOnly` finder forgets Column. */
export function isEquilibrium(g: Game, r: number, c: number, finder: Finder = 'correct'): boolean {
  for (let i = 0; i < rowsOf(g); i += 1) if (g.A[i][c] > g.A[r][c]) return false;
  if (finder === 'rowOnly') return true;
  for (let j = 0; j < colsOf(g); j += 1) if (g.B[r][j] > g.B[r][c]) return false;
  return true;
}

/** Every pure equilibrium by brute force over each profile and each unilateral deviation. */
export function pureEquilibria(g: Game, finder: Finder = 'correct'): Cell[] {
  const found: Cell[] = [];
  for (let r = 0; r < rowsOf(g); r += 1) for (let c = 0; c < colsOf(g); c += 1) if (isEquilibrium(g, r, c, finder)) found.push([r, c]);
  return found;
}

export interface BestReplies {
  /** For each column, the rows that give Row the highest payoff there. */
  row: number[][];
  /** For each row, the columns that give Column the highest payoff there. */
  column: number[][];
}

export function bestReplies(g: Game): BestReplies {
  const row = Array.from({ length: colsOf(g) }, (_, c) => {
    const best = Math.max(...g.A.map((line) => line[c]));
    return g.A.flatMap((line, i) => (line[c] === best ? [i] : []));
  });
  const column = g.B.map((line) => {
    const best = Math.max(...line);
    return line.flatMap((v, j) => (v === best ? [j] : []));
  });
  return { row, column };
}

export interface Dominance {
  player: 'Row' | 'Column';
  dominated: number;
  by: number;
  /** The comparisons that prove it, one per opponent strategy: [better, worse]. */
  proof: (readonly [number, number])[];
}

/** Strictly dominated strategies: one that is strictly worse than another against every reply. */
export function strictlyDominated(g: Game): Dominance[] {
  const out: Dominance[] = [];
  for (let i = 0; i < rowsOf(g); i += 1) {
    for (let j = 0; j < rowsOf(g); j += 1) {
      if (i === j) continue;
      if (g.A[j].every((v, c) => v > g.A[i][c])) out.push({ player: 'Row', dominated: i, by: j, proof: g.A[j].map((v, c) => [v, g.A[i][c]] as const) });
    }
  }
  for (let i = 0; i < colsOf(g); i += 1) {
    for (let j = 0; j < colsOf(g); j += 1) {
      if (i === j) continue;
      if (g.B.every((line) => line[j] > line[i])) out.push({ player: 'Column', dominated: i, by: j, proof: g.B.map((line) => [line[j], line[i]] as const) });
    }
  }
  return out;
}

export function dominanceText(g: Game, d: Dominance): string {
  const names = d.player === 'Row' ? g.rowNames : g.colNames;
  return `${names[d.by]} strictly dominates ${names[d.dominated]} for ${d.player}: ${d.proof.map(([better, worse]) => `${better} > ${worse}`).join(' and ')}.`;
}

// ── Claiming a cell ─────────────────────────────────────────────────────

export interface ClaimResult {
  ok: boolean;
  message: string;
}

const cellName = (g: Game, r: number, c: number) => `(${g.rowNames[r]}, ${g.colNames[c]})`;

/** The matrix scene's standing prompt. The dots already mark the best replies, so it asks the learner to test a cell, not to find the answer. */
export const MATRIX_PROMPT = 'The dots mark each best reply. Click a cell to test whether it is an equilibrium: a cell where neither player gains by changing only their own strategy.';

/** The learner's claim that a cell is an equilibrium: accepted with the numbers, or refused naming the first profitable deviation. */
export function claimCell(g: Game, r: number, c: number, finder: Finder = 'correct'): ClaimResult {
  if (isEquilibrium(g, r, c, finder)) {
    const bestSwitch = (values: number[]) => Math.max(...values);
    const rowSwitch = bestSwitch(g.A.filter((_, i) => i !== r).map((line) => line[c]));
    const colSwitch = bestSwitch(g.B[r].filter((_, j) => j !== c));
    if (finder === 'rowOnly') {
      return { ok: true, message: `${cellName(g, r, c)} is an equilibrium: Row gains nothing by switching (Row would get ${rowSwitch} instead of ${g.A[r][c]}); this finder looks at no one else.` };
    }
    return {
      ok: true,
      message: `${cellName(g, r, c)} is an equilibrium: neither player gains by switching alone (Row would get ${rowSwitch} instead of ${g.A[r][c]}, Column would get ${colSwitch} instead of ${g.B[r][c]}).`,
    };
  }
  const d = firstDeviation(g, r, c);
  if (!d) return { ok: false, message: `${cellName(g, r, c)} is not an equilibrium.` };
  const to = d.player === 'Row' ? g.rowNames[d.to] : g.colNames[d.to];
  return { ok: false, message: `${cellName(g, r, c)} is not an equilibrium: ${d.player} gains by switching to ${to} (${d.now} becomes ${d.after}).` };
}

/** The mistake the broken finder makes: cells it calls equilibria that a player can profitably leave. */
export function falseEquilibria(g: Game): { cell: Cell; message: string }[] {
  return pureEquilibria(g, 'rowOnly')
    .filter(([r, c]) => !isEquilibrium(g, r, c))
    .map(([r, c]) => ({ cell: [r, c] as Cell, message: claimCell(g, r, c).message }));
}

// ── Mixed strategies (2 x 2) ────────────────────────────────────────────

export interface Frac {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function frac(n: number, d: number): Frac {
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export const fracText = (f: Frac): string => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);
export const fracValue = (f: Frac): number => f.n / f.d;
const fracAdd = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fracMul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
const fracInt = (n: number): Frac => frac(n, 1);
export const fracEq = (a: Frac, b: Frac): boolean => a.n * b.d === b.n * a.d;

export type Mixed =
  | { kind: 'mixed'; p: Frac; q: Frac; rowValue: Frac; colValue: Frac }
  | { kind: 'degenerate' }
  | { kind: 'outside'; p: Frac; q: Frac };

/** Row's expected payoff from pure row i when Column plays its first column with probability q. */
export const rowPayoff = (A: Matrix, i: number, q: Frac): Frac => fracAdd(fracMul(q, fracInt(A[i][0])), fracMul(fracAdd(fracInt(1), fracMul(fracInt(-1), q)), fracInt(A[i][1])));
/** Column's expected payoff from pure column j when Row plays its first row with probability p. */
export const colPayoff = (B: Matrix, j: number, p: Frac): Frac => fracAdd(fracMul(p, fracInt(B[0][j])), fracMul(fracAdd(fracInt(1), fracMul(fracInt(-1), p)), fracInt(B[1][j])));

/**
 * The mixed equilibrium of a 2 x 2 game: q* = (A22 - A12) / (A11 - A12 - A21 + A22) makes Row indifferent,
 * p* = (B22 - B21) / (B11 - B21 - B12 + B22) makes Column indifferent. Exact fractions.
 */
export function mixed2x2(g: Game): Mixed {
  const [[a11, a12], [a21, a22]] = g.A;
  const [[b11, b12], [b21, b22]] = g.B;
  const qDen = a11 - a12 - a21 + a22;
  const pDen = b11 - b21 - b12 + b22;
  if (qDen === 0 || pDen === 0) return { kind: 'degenerate' };
  const q = frac(a22 - a12, qDen);
  const p = frac(b22 - b21, pDen);
  const inside = (f: Frac) => f.n > 0 && f.n < f.d;
  if (!inside(p) || !inside(q)) return { kind: 'outside', p, q };
  return { kind: 'mixed', p, q, rowValue: rowPayoff(g.A, 0, q), colValue: colPayoff(g.B, 0, p) };
}

/** Both players are indifferent at (p, q): each pure reply earns the same, exactly. */
export function indifferent(g: Game, p: Frac, q: Frac): boolean {
  return fracEq(rowPayoff(g.A, 0, q), rowPayoff(g.A, 1, q)) && fracEq(colPayoff(g.B, 0, p), colPayoff(g.B, 1, p));
}

/** The refusal when the learner declares "no equilibrium" for a game that has one. */
export function noEquilibriumVerdict(g: Game): ClaimResult {
  const pure = pureEquilibria(g);
  if (pure.length > 0) {
    const [r, c] = pure[0];
    return { ok: false, message: `Not so: ${cellName(g, r, c)} is an equilibrium, since neither player gains by switching alone.` };
  }
  if (rowsOf(g) === 2 && colsOf(g) === 2) {
    const m = mixed2x2(g);
    if (m.kind === 'mixed') {
      const same = fracEq(m.p, m.q);
      const row = `(${fracText(m.p)}, ${fracText(frac(m.p.d - m.p.n, m.p.d))})`;
      const col = `(${fracText(m.q)}, ${fracText(frac(m.q.d - m.q.n, m.q.d))})`;
      const earns =
        fracEq(m.rowValue, m.colValue) && g.rowNames.join() === g.colNames.join()
          ? `each player earns ${fracText(m.rowValue)} from ${g.rowNames[0].toLowerCase()} and from ${g.rowNames[1].toLowerCase()}`
          : `Row earns ${fracText(m.rowValue)} from either row and Column earns ${fracText(m.colValue)} from either column`;
      return {
        ok: false,
        message: `Not quite: pure strategies have none, but a mixed equilibrium ${same ? row : `exists (Row plays ${row}, Column plays ${col})`}${same ? ' exists' : ''}: against it ${earns}.`,
      };
    }
  }
  return { ok: false, message: 'No pure equilibrium here, but a mixed one exists by the theorem (Nash, 1950); this lesson computes it only for 2 x 2 games.' };
}

// ── Editing ─────────────────────────────────────────────────────────────

export const PAYOFF_MESSAGES = {
  empty: 'Type a whole number from -9 to 9.',
  invalid: (typed: string) => (/^-?\d+[.,]\d*$/.test(typed) ? 'Payoffs are whole numbers here.' : `"${typed}" isn't a whole number from -9 to 9.`),
  tooSmall: () => `Payoffs run from ${PAYOFF_MIN} to ${PAYOFF_MAX}.`,
  tooBig: () => `Payoffs run from ${PAYOFF_MIN} to ${PAYOFF_MAX}.`,
} as const;

/** A copy of the game with one payoff changed. */
export function setPayoff(g: Game, who: 'A' | 'B', r: number, c: number, value: number): Game {
  const next = (m: Matrix) => m.map((line, i) => line.map((v, j) => (i === r && j === c ? value : v)));
  return { ...g, A: who === 'A' ? next(g.A) : g.A, B: who === 'B' ? next(g.B) : g.B };
}

/** The game resized to rows x cols: existing payoffs kept, new cells 0, new strategies named by number. */
export function resizeGame(g: Game, rows: number, cols: number): Game {
  const grid = (m: Matrix) => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i < rowsOf(g) && j < colsOf(g) ? m[i][j] : 0)));
  const names = (existing: readonly string[], n: number, prefix: string) => Array.from({ length: n }, (_, i) => existing[i] ?? `${prefix} ${i + 1}`);
  return { A: grid(g.A), B: grid(g.B), rowNames: names(g.rowNames, rows, 'Row'), colNames: names(g.colNames, cols, 'Column') };
}

// ── Scene 3: every 2 x 2 game with payoffs 0 to 3 ───────────────────────

export interface Enumeration {
  total: number;
  /** games[k] is the number of games with exactly k pure equilibria (k from 0 to 4). */
  histogram: number[];
  /** Games with no pure equilibrium, and how many of those have a valid mixed one (both probabilities strictly between 0 and 1, both players exactly indifferent). */
  noPure: number;
  mixedValid: number;
  /** Games where the finder that looks only at Row's deviations gives a different set of equilibria, and its own histogram. */
  brokenDiffers: number;
  brokenHistogram: number[];
}

export function gameFromIndex(index: number): Game {
  const base = ENUM_MAX_PAYOFF + 1;
  const digit = (k: number) => Math.floor(index / base ** k) % base;
  return {
    A: [[digit(0), digit(1)], [digit(2), digit(3)]],
    B: [[digit(4), digit(5)], [digit(6), digit(7)]],
    rowNames: ['Top', 'Bottom'],
    colNames: ['Left', 'Right'],
  };
}

const cellsKey = (cells: readonly Cell[]) => cells.map(([r, c]) => r * 2 + c).join('');

/** Enumerates all 4^8 games: pure equilibrium counts, whether every no-pure game has a valid mixed one, and how the broken finder differs. */
export function enumerateGames(): Enumeration {
  const total = (ENUM_MAX_PAYOFF + 1) ** 8;
  const histogram = [0, 0, 0, 0, 0];
  const brokenHistogram = [0, 0, 0, 0, 0];
  let noPure = 0;
  let mixedValid = 0;
  let brokenDiffers = 0;
  for (let index = 0; index < total; index += 1) {
    const g = gameFromIndex(index);
    const pure = pureEquilibria(g);
    const broken = pureEquilibria(g, 'rowOnly');
    histogram[pure.length] += 1;
    brokenHistogram[broken.length] += 1;
    if (cellsKey(pure) !== cellsKey(broken)) brokenDiffers += 1;
    if (pure.length === 0) {
      noPure += 1;
      const m = mixed2x2(g);
      if (m.kind === 'mixed' && indifferent(g, m.p, m.q)) mixedValid += 1;
    }
  }
  return { total, histogram, noPure, mixedValid, brokenDiffers, brokenHistogram };
}

// ── Scene 4: change the prisoner's dilemma ──────────────────────────────

/** The symmetric dilemma with reward R (both cooperate), temptation T, sucker S and punishment P (both defect). */
export interface Dilemma {
  R: number;
  T: number;
  S: number;
  P: number;
}

export const CLASSIC_DILEMMA: Dilemma = { R: -1, T: 0, S: -3, P: -2 };

export function dilemmaGame(d: Dilemma): Game {
  return {
    A: [[d.R, d.S], [d.T, d.P]],
    B: [[d.R, d.T], [d.S, d.P]],
    rowNames: ['Cooperate', 'Defect'],
    colNames: ['Cooperate', 'Defect'],
  };
}

export interface Flip {
  cell: Cell;
  becameEquilibrium: boolean;
}

/** The cells whose equilibrium status differs from the classic dilemma's. */
export function flips(d: Dilemma): Flip[] {
  const base = dilemmaGame(CLASSIC_DILEMMA);
  const now = dilemmaGame(d);
  const out: Flip[] = [];
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const was = isEquilibrium(base, r, c);
      const is = isEquilibrium(now, r, c);
      if (was !== is) out.push({ cell: [r, c], becameEquilibrium: is });
    }
  }
  return out;
}

/** The two inequalities that make (Cooperate, Cooperate) stable, with the current numbers. */
export function cooperationCondition(d: Dilemma): { row: string; column: string; holds: boolean } {
  const holds = d.R >= d.T;
  const verdict = holds ? 'holds' : 'fails';
  return {
    row: `Row stays if mutual cooperation ${d.R} is at least what defecting alone pays, ${d.T}: ${verdict}`,
    column: `Column stays if ${d.R} is at least ${d.T}: ${verdict}`,
    holds,
  };
}
