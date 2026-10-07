// Pure maths for expected-value: the random variables (exact pmf, E and Var), seeded
// sampling, sample means of n, linearity with a dependent pair, the capped-retry load, and
// the parser for the learner's own table.
import { mulberry32, randInt, type Rnd } from '../../core/random';

export type VarId = 'die' | 'two-dice' | 'opposite' | 'geometric' | 'retries' | 'custom';

export interface Pmf {
  values: number[];
  probs: number[];
  /**
   * Integer weights behind `probs` (die-type variables), so E and Var can be shown as exact
   * fractions. Absent when the probabilities aren't whole-number ratios.
   */
  weights?: number[];
}

export interface Params {
  /** Geometric: success probability per attempt, in whole percent. */
  successPct: number;
  /** Retries: failure probability per attempt, in whole percent. */
  failPct: number;
  /** Retries: the cap on retries (so at most cap + 1 attempts). */
  cap: number;
  custom: Pmf;
}

const FACES = [1, 2, 3, 4, 5, 6];

function fromWeights(pairs: readonly (readonly [number, number])[]): Pmf {
  const merged = new Map<number, number>();
  for (const [v, w] of pairs) merged.set(v, (merged.get(v) ?? 0) + w);
  const sorted = [...merged].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((s, [, w]) => s + w, 0);
  return { values: sorted.map(([v]) => v), probs: sorted.map(([, w]) => w / total), weights: sorted.map(([, w]) => w) };
}

/** Geometric support shown as bars: up to the attempt where 99.9% of the mass is used. */
export const GEOMETRIC_SHOWN = 0.999;

export function geometricCap(p: number): number {
  return Math.max(10, Math.ceil(Math.log(1 - GEOMETRIC_SHOWN) / Math.log(1 - p)));
}

/** The pmf: exact for every variable except the geometric, whose bars stop at geometricCap (the tail is noted). */
export function pmfOf(id: VarId, prm: Params): Pmf {
  switch (id) {
    case 'die':
      return fromWeights(FACES.map((f) => [f, 1]));
    case 'two-dice':
      return fromWeights(FACES.flatMap((a) => FACES.map((b) => [a + b, 1] as const)));
    case 'opposite':
      // Top + bottom of one die: opposite faces always add to 7.
      return fromWeights(FACES.map((f) => [f + (7 - f), 1]));
    case 'geometric': {
      const p = prm.successPct / 100;
      const n = geometricCap(p);
      const values = Array.from({ length: n }, (_, i) => i + 1);
      return { values, probs: values.map((k) => (1 - p) ** (k - 1) * p) };
    }
    case 'retries': {
      const q = prm.failPct / 100;
      const values = Array.from({ length: prm.cap + 1 }, (_, i) => i + 1);
      // Attempt k is the last one when the first k − 1 failed and the k-th worked; the last allowed attempt ends it either way.
      return { values, probs: values.map((k) => (k <= prm.cap ? q ** (k - 1) * (1 - q) : q ** prm.cap)) };
    }
    case 'custom':
      return prm.custom;
  }
}

export interface Moments {
  mean: number;
  variance: number;
}

/** E[X] = Σ x·P(x) and Var(X) = Σ (x − E)²·P(x) over a finite pmf. */
export function momentsOf(pmf: Pmf): Moments {
  const mean = pmf.values.reduce((s, x, i) => s + x * pmf.probs[i], 0);
  const variance = pmf.values.reduce((s, x, i) => s + (x - mean) ** 2 * pmf.probs[i], 0);
  return { mean, variance };
}

/** Exact E and Var. The geometric uses its closed forms (E = 1/p, Var = (1 − p)/p²) since its support is infinite. */
export function exactMoments(id: VarId, prm: Params): Moments {
  if (id === 'geometric') {
    const p = prm.successPct / 100;
    return { mean: 1 / p, variance: (1 - p) / p ** 2 };
  }
  return momentsOf(pmfOf(id, prm));
}

/** Expected attempts per request with up to r retries, each failing with probability q: Σᵢ₌₀ʳ qⁱ. */
export const expectedAttempts = (q: number, r: number) => Array.from({ length: r + 1 }, (_, i) => q ** i).reduce((a, b) => a + b, 0);

/** The most likely value(s). */
export function modes(pmf: Pmf): number[] {
  const top = Math.max(...pmf.probs);
  return pmf.values.filter((_, i) => Math.abs(pmf.probs[i] - top) < 1e-12);
}

/** True when X can actually take the value v. */
export const canEqual = (pmf: Pmf, v: number) => pmf.values.some((x, i) => pmf.probs[i] > 0 && Math.abs(x - v) < 1e-9);

// ── Sampling ─────────────────────────────────────────────────────────

/** One draw of X. */
export function draw(id: VarId, prm: Params, rnd: Rnd): number {
  switch (id) {
    case 'die':
      return randInt(1, 6, rnd);
    case 'two-dice':
      return randInt(1, 6, rnd) + randInt(1, 6, rnd);
    case 'opposite': {
      const top = randInt(1, 6, rnd);
      return top + (7 - top);
    }
    case 'geometric': {
      const p = prm.successPct / 100;
      let k = 1;
      while (rnd() >= p) k++;
      return k;
    }
    case 'retries': {
      const q = prm.failPct / 100;
      let k = 1;
      while (k <= prm.cap && rnd() < q) k++;
      return k;
    }
    case 'custom': {
      let u = rnd();
      const { values, probs } = prm.custom;
      for (let i = 0; i < values.length; i++) {
        u -= probs[i];
        if (u < 0) return values[i];
      }
      return values[values.length - 1];
    }
  }
}

/** The first `count` draws for a seed, each the mean of `n` draws of X: a pure function of its inputs. */
export function drawsFor(id: VarId, prm: Params, seed: number, count: number, n = 1): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += draw(id, prm, rnd);
    return s / n;
  });
}

// ── Linearity ────────────────────────────────────────────────────────

export interface PairSummary {
  ex: number;
  ey: number;
  esum: number;
  vx: number;
  vy: number;
  vsum: number;
}

/** Two dice X, Y as a joint table: independent (36 equally likely pairs) or the opposite faces of one die (Y = 7 − X). */
export function pairSummary(dependent: boolean): PairSummary {
  const joint = dependent
    ? FACES.map((x) => ({ x, y: 7 - x, p: 1 / 6 }))
    : FACES.flatMap((x) => FACES.map((y) => ({ x, y, p: 1 / 36 })));
  const e = (f: (j: { x: number; y: number }) => number) => joint.reduce((s, j) => s + f(j) * j.p, 0);
  const v = (f: (j: { x: number; y: number }) => number) => {
    const m = e(f);
    return joint.reduce((s, j) => s + (f(j) - m) ** 2 * j.p, 0);
  };
  return { ex: e((j) => j.x), ey: e((j) => j.y), esum: e((j) => j.x + j.y), vx: v((j) => j.x), vy: v((j) => j.y), vsum: v((j) => j.x + j.y) };
}

// ── Exact fractions ──────────────────────────────────────────────────

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** "7/2" (or "6" when it's whole) for num/den, reduced. */
export function fraction(num: number, den: number): string {
  const g = gcd(num, den);
  return den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
}

/** E and Var as exact fractions, for a pmf with integer values and weights. */
export function exactFractions(pmf: Pmf): { mean: string; variance: string } | null {
  if (!pmf.weights || !pmf.values.every(Number.isInteger)) return null;
  const W = pmf.weights.reduce((a, b) => a + b, 0);
  const S1 = pmf.values.reduce((s, x, i) => s + x * pmf.weights![i], 0);
  const S2 = pmf.values.reduce((s, x, i) => s + x * x * pmf.weights![i], 0);
  // Var = E[X²] − E[X]² = (W·S2 − S1²) / W²
  return { mean: fraction(S1, W), variance: fraction(W * S2 - S1 * S1, W * W) };
}

// ── The learner's table ──────────────────────────────────────────────

export const MAX_ROWS = 12;
export const MAX_ABS = 1e6;
const NUMBER = /^[-−]?\d+(\.\d+)?$/;

export interface RowError {
  line: number;
  message: string;
}

export type TableParse = { ok: true; pmf: Pmf; rows: number } | { ok: false; errors: RowError[] };

/**
 * One "value, weight" row per line (a comma and/or spaces between them). Blank lines are
 * skipped. Values are plain decimals within ±10⁶, weights plain decimals from 0 to 10⁶;
 * exponents, Infinity, units, emoji and markup are refused. Rows with the same value are merged.
 */
export function parseTable(text: string): TableParse {
  const errors: RowError[] = [];
  const pairs: [number, number][] = [];
  const lines = text.split('\n');
  let rows = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    rows++;
    const fields = line.split(/\s*,\s*|\s+/);
    if (fields.length !== 2 || fields.some((f) => f === '')) {
      errors.push({ line: i + 1, message: 'needs two numbers: value, weight' });
      return;
    }
    const [vText, wText] = fields;
    if (!NUMBER.test(vText) || !NUMBER.test(wText)) {
      errors.push({ line: i + 1, message: 'only plain numbers like 2.5 or -3' });
      return;
    }
    const v = Number(vText.replace('−', '-'));
    const w = Number(wText.replace('−', '-'));
    if (Math.abs(v) > MAX_ABS) errors.push({ line: i + 1, message: 'keep values between −1,000,000 and 1,000,000' });
    else if (w < 0) errors.push({ line: i + 1, message: "a weight can't be negative" });
    else if (w > MAX_ABS) errors.push({ line: i + 1, message: 'keep weights at most 1,000,000' });
    else pairs.push([v, w]);
  });
  if (rows > MAX_ROWS) errors.unshift({ line: 0, message: `at most ${MAX_ROWS} rows (you have ${rows})` });
  if (errors.length) return { ok: false, errors };
  if (!pairs.length) return { ok: false, errors: [{ line: 0, message: 'type at least one row' }] };
  if (pairs.every(([, w]) => w === 0)) return { ok: false, errors: [{ line: 0, message: "weights can't all be 0" }] };
  const pmf = fromWeights(pairs);
  // Integer weights keep exact fractions; decimals don't.
  return { ok: true, pmf: pairs.every(([, w]) => Number.isInteger(w)) ? pmf : { values: pmf.values, probs: pmf.probs }, rows };
}

export const DEFAULT_TABLE = '0, 90\n100, 9\n10000, 1';
