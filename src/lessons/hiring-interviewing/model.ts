/**
 * The toy, stated up front. Each candidate has a latent skill s drawn from N(0, 1). An interviewer's score of a candidate
 * is s + e, where e = bias + noise is zero-mean with variance sigma^2 = sigma_b^2 + sigma_q^2 (sigma_b the interviewer's
 * leniency spread, sigma_q question-to-question noise). A panel of k averages k scores. Every constant is INVENTED: this
 * shows the arithmetic of variance, not evidence that any rubric works. A rubric is modelled as a smaller sigma_b, which is
 * an input the learner sets, not something the toy discovered.
 */
import { normal, normalCdf, normalQuantile } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

// ── Closed forms ────────────────────────────────────────────────────────────────

export interface Panel {
  /** Interviewers on the panel. */
  k: number;
  /** Error sd of one interview. */
  sigma: number;
  /** Correlation between two interviewers' errors (they agreed before scoring). */
  rho: number;
}

/** Variance of the panel mean's error: sigma^2 (1 + (k - 1) rho) / k. */
export const panelErrorVariance = ({ k, sigma, rho }: Panel): number => (sigma ** 2 * (1 + (k - 1) * rho)) / k;

/** The correlation between the panel's mean score and true skill: 1 / sqrt(1 + error variance). */
export const correlationFormula = (p: Panel): number => 1 / Math.sqrt(1 + panelErrorVariance(p));

/** How many independent interviewers the panel is worth: k / (1 + (k - 1) rho). */
export const effectiveInterviewers = ({ k, rho }: Pick<Panel, 'k' | 'rho'>): number => k / (1 + (k - 1) * rho);

const SIMPSON_STEPS = 4000;
const TAIL_END = 10;

/** P(S > a, X > b) for a standard bivariate normal with correlation r: Simpson's rule over s of phi(s) P(X > b | S = s). */
export function bivariateTail(a: number, b: number, r: number): number {
  if (r >= 1) return 1 - normalCdf(Math.max(a, b));
  if (r <= -1) return Math.max(0, normalCdf(-a) - normalCdf(b));
  const root = Math.sqrt(1 - r * r);
  const f = (s: number) => Math.exp(-0.5 * s * s) / Math.sqrt(2 * Math.PI) * (1 - normalCdf((b - r * s) / root));
  const lo = a;
  const hi = Math.max(a, TAIL_END);
  const h = (hi - lo) / SIMPSON_STEPS;
  let sum = f(lo) + f(hi);
  for (let i = 1; i < SIMPSON_STEPS; i += 1) sum += f(lo + i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}

/** Of the true top `p` (by skill), the share a score with correlation r puts in its own top `p`: P(S > a, X > a) / p. */
export function recallFormula(r: number, p: number): number {
  const a = normalQuantile(1 - p);
  return bivariateTail(a, a, r) / p;
}

/** Of the true top `topShare`, the share a score with correlation r keeps when it keeps the top `keepShare`. */
export function keepRecallFormula(r: number, topShare: number, keepShare: number): number {
  return bivariateTail(normalQuantile(1 - topShare), normalQuantile(1 - keepShare), r) / topShare;
}

/** Pearson correlation of two equal-length samples (core/stats has none). */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// ── Seeded draws ────────────────────────────────────────────────────────────────

export const POOL_SIZE = 1000;
export const SCATTER_POINTS = 300;
export const K_MAX = 9;
/** The funnel's pool is larger than scene 1's, so its percentages are steady rather than a handful of people. */
export const FUNNEL_POOL = 20_000;
export const STAGES = 3;
/** The true top group the funnel is trying to keep. */
export const FUNNEL_TOP_SHARE = 0.1;

export const PANEL_BOUNDS = {
  k: { min: 1, max: K_MAX, step: 1 },
  sigma: { min: 0.3, max: 3, step: 0.1 },
  hire: { min: 5, max: 50, step: 5 },
  rho: { min: 0, max: 0.9, step: 0.1 },
  keep: { min: 5, max: 100, step: 5 },
} as const;

export interface Pool {
  n: number;
  skill: number[];
  shared: number[];
  /** own[i * K_MAX + j]: interviewer j's own error draw for candidate i. */
  own: number[];
}

const cache = new Map<string, unknown>();
const CACHE_LIMIT = 6;
function memo<T>(key: string, make: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  const value = make();
  cache.set(key, value);
  return value;
}

/** The pool for a seed: skill, a shared error component and each interviewer's own draw, so k, sigma and rho reuse the same people. */
export const makePool = (seed: number, n = POOL_SIZE): Pool =>
  memo(`pool|${seed}|${n}`, () => {
    const rnd = mulberry32(seed);
    const skill: number[] = [];
    const shared: number[] = [];
    const own: number[] = [];
    for (let i = 0; i < n; i += 1) {
      skill.push(normal(rnd));
      shared.push(normal(rnd));
      for (let j = 0; j < K_MAX; j += 1) own.push(normal(rnd));
    }
    return { n, skill, shared, own };
  });

/** Each candidate's panel mean score: s + sigma (sqrt(rho) z_shared + sqrt(1 - rho) mean of k own draws). */
export function panelScores(pool: Pool, { k, sigma, rho }: Panel): number[] {
  const a = Math.sqrt(rho);
  const b = Math.sqrt(1 - rho);
  const scores: number[] = [];
  for (let i = 0; i < pool.n; i += 1) {
    let own = 0;
    for (let j = 0; j < k; j += 1) own += pool.own[i * K_MAX + j];
    scores.push(pool.skill[i] + sigma * (a * pool.shared[i] + (b * own) / k));
  }
  return scores;
}

/** The indices of the `count` highest values (ties by index). */
export function topIndices(values: readonly number[], count: number): Set<number> {
  const order = values.map((_, i) => i).sort((x, y) => values[y] - values[x] || x - y);
  return new Set(order.slice(0, count));
}

export interface PanelResult {
  /** Candidates hired: round(hire share x pool). */
  hired: number;
  scores: number[];
  hiredSet: ReadonlySet<number>;
  topSet: ReadonlySet<number>;
  /** Hired and in the true top group. */
  hits: number;
  /** The share of the true top group that was hired, in this pool. */
  recallPool: number;
  /** Hired but outside the true top group. */
  falseHires: number;
  /** Measured Pearson correlation of score and skill, in this pool. */
  rPool: number;
  rFormula: number;
  recallFormula: number;
  effective: number;
  /** The score a candidate needs to be hired (midway between the last hired and the first not hired). */
  cutoff: number;
}

/** One panel, one decision: who is hired, who is missed, and the numbers against the formula. */
export function runPanel(pool: Pool, panel: Panel, hireShare: number): PanelResult {
  const scores = panelScores(pool, panel);
  const hired = Math.round(hireShare * pool.n);
  const hiredSet = topIndices(scores, hired);
  const topSet = topIndices(pool.skill, hired);
  let hits = 0;
  for (const i of hiredSet) if (topSet.has(i)) hits += 1;
  const sorted = [...scores].sort((x, y) => y - x);
  const r = correlationFormula(panel);
  return {
    hired, scores, hiredSet, topSet, hits, recallPool: hits / hired, falseHires: hired - hits, rPool: pearson(pool.skill, scores),
    rFormula: r, recallFormula: recallFormula(r, hireShare), effective: effectiveInterviewers(panel),
    cutoff: hired < pool.n ? (sorted[hired - 1] + sorted[hired]) / 2 : sorted[hired - 1],
  };
}

// ── The funnel ──────────────────────────────────────────────────────────────────

export interface StageSpec {
  k: number;
  sigma: number;
  /** The share of those still alive that this stage keeps. */
  keep: number;
  /** The stage's score is pure noise, independent of skill. */
  noSignal: boolean;
}

export const DEFAULT_STAGES: readonly StageSpec[] = [
  { k: 1, sigma: 2, keep: 0.5, noSignal: false },
  { k: 1, sigma: 1.2, keep: 0.4, noSignal: false },
  { k: 4, sigma: 1.2, keep: 0.25, noSignal: false },
];
export const STAGE_NAMES = ['Resume screen', 'Phone screen', 'Onsite'] as const;

export interface FunnelDraws {
  n: number;
  skill: number[];
  /** own[stage][i * K_MAX + j]. */
  own: number[][];
}

export const makeFunnelDraws = (seed: number, n = FUNNEL_POOL): FunnelDraws =>
  memo(`funnel|${seed}|${n}`, () => {
    const rnd = mulberry32(seed);
    const skill: number[] = [];
    const own: number[][] = Array.from({ length: STAGES }, () => []);
    for (let i = 0; i < n; i += 1) {
      skill.push(normal(rnd));
      for (let t = 0; t < STAGES; t += 1) for (let j = 0; j < K_MAX; j += 1) own[t].push(normal(rnd));
    }
    return { n, skill, own };
  });

export interface StageResult {
  /** People still alive after the stage. */
  alive: number;
  /** Share of the pool still alive. */
  share: number;
  /** Of the true top group, the share still alive. */
  recall: number;
  /** Mean true skill of those still alive. */
  meanSkill: number;
}

/** Each stage scores those still alive and keeps its top share; the true top group is the top FUNNEL_TOP_SHARE by skill. */
export function runFunnel(draws: FunnelDraws, stages: readonly StageSpec[]): StageResult[] {
  const topSet = topIndices(draws.skill, Math.round(FUNNEL_TOP_SHARE * draws.n));
  let alive: number[] = draws.skill.map((_, i) => i);
  return stages.map((stage, t) => {
    const scores = alive.map((i) => {
      let own = 0;
      for (let j = 0; j < stage.k; j += 1) own += draws.own[t][i * K_MAX + j];
      return stage.noSignal ? own / stage.k : draws.skill[i] + (stage.sigma * own) / stage.k;
    });
    const keep = topIndices(scores, Math.max(1, Math.round(stage.keep * alive.length)));
    alive = alive.filter((_, idx) => keep.has(idx));
    let hits = 0;
    let skillSum = 0;
    for (const i of alive) {
      if (topSet.has(i)) hits += 1;
      skillSum += draws.skill[i];
    }
    return { alive: alive.length, share: alive.length / draws.n, recall: hits / topSet.size, meanSkill: skillSum / alive.length };
  });
}

/** The share of the pool a loop hires: the product of the keep shares. */
export const hiredShare = (stages: readonly StageSpec[]): number => stages.reduce((p, s) => p * s.keep, 1);

// ── Interviewers and leniency ───────────────────────────────────────────────────

export const INTERVIEWERS = 8;
export const CANDIDATES_EACH = 40;
export const HIRE_BAR = 1;
export const SIGMA_Q = 0.7;
export const SIGMA_B = 1;
export const SIGMA_B_ANCHORED = 0.5;
export const SINGLE_CANDIDATE_SKILL = 0.5;
export const LENIENT = 0.8;

export interface InterviewerDraws {
  /** One standard normal per interviewer: leniency = sigma_b x z. */
  z: number[];
  /** skill[i][m]: the m-th candidate interviewer i sees. */
  skill: number[][];
  noise: number[][];
}

export const makeInterviewerDraws = (seed: number): InterviewerDraws =>
  memo(`interviewers|${seed}`, () => {
    const rnd = mulberry32(seed);
    const z: number[] = [];
    const skill: number[][] = [];
    const noise: number[][] = [];
    for (let i = 0; i < INTERVIEWERS; i += 1) {
      z.push(normal(rnd));
      skill.push(Array.from({ length: CANDIDATES_EACH }, () => normal(rnd)));
      noise.push(Array.from({ length: CANDIDATES_EACH }, () => normal(rnd)));
    }
    return { z, skill, noise };
  });

export interface InterviewerRow {
  index: number;
  leniency: number;
  /** Mean score over the interviewer's 40 candidates. */
  mean: number;
  /** Share of those candidates scored at or above the hire bar. */
  passed: number;
}

export function interviewerRows(draws: InterviewerDraws, sigmaB: number): InterviewerRow[] {
  return draws.z.map((z, i) => {
    const b = sigmaB * z;
    const scores = draws.skill[i].map((s, m) => s + b + SIGMA_Q * draws.noise[i][m]);
    return { index: i + 1, leniency: b, mean: scores.reduce((a, v) => a + v, 0) / scores.length, passed: scores.filter((v) => v >= HIRE_BAR).length / scores.length };
  });
}

/** Sample standard deviation of the interviewers' means. */
export function spreadOf(rows: readonly InterviewerRow[]): number {
  const m = rows.reduce((s, r) => s + r.mean, 0) / rows.length;
  return Math.sqrt(rows.reduce((s, r) => s + (r.mean - m) ** 2, 0) / (rows.length - 1));
}

/** The sd across interviewers of a 40-candidate mean: sqrt(sigma_b^2 + (1 + sigma_q^2) / 40). */
export const expectedSpread = (sigmaB: number): number => Math.sqrt(sigmaB ** 2 + (1 + SIGMA_Q ** 2) / CANDIDATES_EACH);

/** The error sd of one interview: sqrt(sigma_b^2 + sigma_q^2). */
export const totalSigma = (sigmaB: number): number => Math.sqrt(sigmaB ** 2 + SIGMA_Q ** 2);

/** The chance a candidate of skill s clears the bar with an interviewer of leniency b: 1 - Phi((bar - s - b) / sigma_q). */
export const passChance = (skill: number, leniency: number): number => 1 - normalCdf((HIRE_BAR - skill - leniency) / SIGMA_Q);
