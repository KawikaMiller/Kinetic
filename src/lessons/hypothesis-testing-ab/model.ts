import { normalCdf, normalQuantile } from '../../core/distributions';
import { parseBoundedInt } from '../../core/parse';
import { mulberry32, type Rnd } from '../../core/random';

/* ---------- constants ---------- */

/** The significance threshold used throughout, and the 95% interval's critical value. */
export const ALPHA = 0.05;
export const Z_CRITICAL = 1.959963984540054;
/** Below this many visitors per arm the lesson refuses to give a z-test verdict. */
export const MIN_VISITORS = 30;
/** Replicated experiments in scene 2 and in the peeking scene. */
export const REPLICATES = 1_000;
/** Visitors per arm in the peeking scene, and the looks offered (data arrives in equal steps). */
export const PEEK_TOTAL = 10_000;
export const PEEK_LOOKS = [1, 5, 10, 20] as const;
export const PEEK_LIFT_POINTS = 1;
/** Slice scene: slices, visitors per arm per slice, and replicated A/A experiments. */
export const SLICES = 20;
export const SLICE_VISITORS = 1_000;
export const SLICE_REPLICATES = 2_000;
/** Bounds for the "your own numbers" fields. */
export const COUNT_MAX = 1_000_000_000;

/** The controls of scene 1, as ranges the model clamps to. */
export const BASELINE = { min: 5, max: 30 } as const;
export const LIFT = { min: -2, max: 3, step: 0.5 } as const;
export const VISITORS_EXPONENT = { min: 2, max: 5, step: 0.05 } as const;

/* ---------- sampling ---------- */

/** Conversions among n independent visitors who each convert with probability p: exact, by jumping between successes. */
export function binomialDraw(rnd: Rnd, n: number, p: number): number {
  if (p <= 0 || n <= 0) return 0;
  if (p >= 1) return n;
  if (p > 0.5) return n - binomialDraw(rnd, n, 1 - p);
  const logMiss = Math.log1p(-p);
  let position = 0;
  let count = 0;
  for (;;) {
    position += 1 + Math.floor(Math.log(1 - rnd()) / logMiss);
    if (position > n) return count;
    count++;
  }
}

/* ---------- the two-proportion z-test ---------- */

export interface Arms {
  conversionsA: number;
  visitorsA: number;
  conversionsB: number;
  visitorsB: number;
}

export type TestStatus = 'ok' | 'too-few' | 'undefined';

export interface ZTest {
  status: TestStatus;
  rateA: number;
  rateB: number;
  /** B − A, as a share (0.03 is three points). */
  diff: number;
  pooled: number;
  /** Standard error of the difference under "no difference" (pooled). */
  se: number | null;
  z: number | null;
  /** Two-sided p-value. */
  p: number | null;
  /** 95% interval for the difference, with the unpooled standard error. */
  lo: number | null;
  hi: number | null;
}

/** Half-width of the z axis the Run scene draws. */
export const Z_AXIS = 4;

/**
 * The part of each p-value tail that lies on the z axis, as [from, to] ranges. A z beyond the axis has
 * both tails entirely off it, so nothing is shaded (the area would be invisibly thin) rather than the whole bell.
 */
export function tailRanges(z: number, axis = Z_AXIS): [number, number][] {
  const edge = Math.abs(z);
  return edge < axis ? [[edge, axis], [-axis, -edge]] : [];
}

/** P(|Z| ≥ |z|). */
export const twoSidedP = (z: number): number => 2 * (1 - normalCdf(Math.abs(z)));

export function zTest(a: Arms): ZTest {
  const rateA = a.conversionsA / a.visitorsA;
  const rateB = a.conversionsB / a.visitorsB;
  const diff = rateB - rateA;
  const pooled = (a.conversionsA + a.conversionsB) / (a.visitorsA + a.visitorsB);
  const base = { rateA, rateB, diff, pooled };
  if (Math.min(a.visitorsA, a.visitorsB) < MIN_VISITORS) {
    return { ...base, status: 'too-few', se: null, z: null, p: null, lo: null, hi: null };
  }
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.visitorsA + 1 / a.visitorsB));
  const seUnpooled = Math.sqrt((rateA * (1 - rateA)) / a.visitorsA + (rateB * (1 - rateB)) / a.visitorsB);
  if (se === 0) return { ...base, status: 'undefined', se: 0, z: null, p: null, lo: null, hi: null };
  const z = diff / se;
  return { ...base, status: 'ok', se, z, p: twoSidedP(z), lo: diff - Z_CRITICAL * seUnpooled, hi: diff + Z_CRITICAL * seUnpooled };
}

/** What a result means once the truth is known (the simulator knows it; a real experiment never does). */
export type VerdictKind = 'real-win' | 'false-positive' | 'wrong-sign' | 'miss' | 'correct-null' | 'significant' | 'not-significant' | 'no-verdict';

export function verdictKind(test: ZTest, trueLift: number | null, alpha = ALPHA): VerdictKind {
  if (test.status !== 'ok' || test.p === null) return 'no-verdict';
  const significant = test.p < alpha;
  if (trueLift === null) return significant ? 'significant' : 'not-significant';
  if (significant) {
    if (trueLift === 0) return 'false-positive';
    return Math.sign(test.diff) === Math.sign(trueLift) ? 'real-win' : 'wrong-sign';
  }
  return trueLift === 0 ? 'correct-null' : 'miss';
}

/* ---------- scene 1 and 2: one experiment, and a thousand ---------- */

export interface ExperimentSpec {
  /** Baseline conversion in percent (10 means 10%). */
  baseline: number;
  /** True lift of B over A in percentage points. */
  lift: number;
  visitors: number;
  seed: number;
}

export const rateA = (s: ExperimentSpec): number => s.baseline / 100;
export const rateB = (s: ExperimentSpec): number => (s.baseline + s.lift) / 100;

/** The visitors per arm a log slider position stands for: 10^exponent, rounded. */
export const visitorsAt = (exponent: number): number => Math.round(10 ** exponent);

export function runExperiment(s: ExperimentSpec): { arms: Arms; test: ZTest } {
  const rnd = mulberry32(s.seed);
  const arms: Arms = {
    conversionsA: binomialDraw(rnd, s.visitors, rateA(s)),
    visitorsA: s.visitors,
    conversionsB: binomialDraw(rnd, s.visitors, rateB(s)),
    visitorsB: s.visitors,
  };
  return { arms, test: zTest(arms) };
}

/** The seed of the k-th press of "Run": far apart per k, so runs never share a stream. */
const RUN_STRIDE = 104_729;
export const runSeed = (seed: number, index: number): number => seed + index * RUN_STRIDE;

export interface Replicated {
  pValues: number[];
  /** Share of replicates with p < α: the false-positive rate when the true lift is 0, the power otherwise. */
  below: number;
}

export function replicate(s: ExperimentSpec, runs = REPLICATES, alpha = ALPHA): Replicated {
  const pValues: number[] = [];
  for (let i = 0; i < runs; i++) {
    const { test } = runExperiment({ ...s, seed: runSeed(s.seed, i + 1) });
    if (test.p !== null) pValues.push(test.p);
  }
  return { pValues, below: pValues.filter((p) => p < alpha).length / (pValues.length || 1) };
}

/** Per-arm visitors needed to detect a move from p1 to p1 + delta at the given α (two-sided) and power. */
export function sampleSizePerArm(p1: number, delta: number, alpha = ALPHA, power = 0.8): number {
  const p2 = p1 + delta;
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  return Math.ceil((z * z * (p1 * (1 - p1) + p2 * (1 - p2))) / (delta * delta));
}

/** The p-value histogram of scene 2: `bins` equal bins on [0, 1]. */
export function pHistogram(pValues: readonly number[], bins = 20): number[] {
  const counts = new Array<number>(bins).fill(0);
  for (const p of pValues) counts[Math.min(bins - 1, Math.floor(p * bins))]++;
  return counts;
}

/* ---------- scene 3: peeking ---------- */

export interface Look {
  visitors: number;
  conversionsA: number;
  conversionsB: number;
  p: number | null;
}

export interface PeekSpec {
  baseline: number;
  /** True lift in points: 0 is an A/A test. */
  lift: number;
  looks: number;
  seed: number;
}

/** One experiment whose data arrives in `looks` equal steps of PEEK_TOTAL / looks per arm; each look tests everything so far. */
export function peekRun(s: PeekSpec): Look[] {
  const rnd = mulberry32(s.seed);
  const step = PEEK_TOTAL / s.looks;
  const [pa, pb] = [s.baseline / 100, (s.baseline + s.lift) / 100];
  let ca = 0;
  let cb = 0;
  const out: Look[] = [];
  for (let k = 1; k <= s.looks; k++) {
    ca += binomialDraw(rnd, step, pa);
    cb += binomialDraw(rnd, step, pb);
    const n = step * k;
    out.push({ visitors: n, conversionsA: ca, conversionsB: cb, p: zTest({ conversionsA: ca, visitorsA: n, conversionsB: cb, visitorsB: n }).p });
  }
  return out;
}

/** The threshold each look is tested at: α, or α split over the looks (Bonferroni). */
export const lookAlpha = (looks: number, bonferroni: boolean, alpha = ALPHA): number => (bonferroni ? alpha / looks : alpha);

/** What a look that crossed the threshold means once the truth (the true lift in points) is known. */
export function lookVerdict(look: Look, trueLift: number, threshold: number): VerdictKind {
  if (look.p === null) return 'no-verdict';
  const diff = look.conversionsB - look.conversionsA;
  const significant = look.p < threshold;
  if (!significant) return trueLift === 0 ? 'correct-null' : 'miss';
  if (trueLift === 0) return 'false-positive';
  return Math.sign(diff) === Math.sign(trueLift) ? 'real-win' : 'wrong-sign';
}

/** Index of the first look below the threshold, or -1. */
export const firstCrossing = (run: readonly Look[], threshold: number): number => run.findIndex((l) => l.p !== null && l.p < threshold);

export interface PeekRates {
  /** Experiments replicated. */
  runs: number;
  /** Share of experiments that dip below the threshold at ANY look (the "stop when significant" policy). */
  anyLook: number;
  /** Share that are below it at the last look only (look once at the end). */
  lastLook: number;
}

export function peekRates(s: Omit<PeekSpec, 'seed'>, seed: number, bonferroni: boolean, runs = REPLICATES): PeekRates {
  const threshold = lookAlpha(s.looks, bonferroni);
  let any = 0;
  let last = 0;
  for (let i = 0; i < runs; i++) {
    const run = peekRun({ ...s, seed: runSeed(seed, i + 1) });
    if (firstCrossing(run, threshold) >= 0) any++;
    const finalP = run[run.length - 1].p;
    if (finalP !== null && finalP < lookAlpha(1, false)) last++;
  }
  return { runs, anyLook: any / runs, lastLook: last / runs };
}

/* ---------- scene 4: slicing until significant ---------- */

export const SEGMENT_COUNTRIES = ['US', 'Germany', 'France', 'Japan', 'Brazil'] as const;
export const SEGMENT_DEVICES = ['desktop', 'Android', 'iPhone', 'tablet'] as const;
/** Invented slices of an A/A experiment: country × device. */
export const SEGMENTS: readonly string[] = SEGMENT_COUNTRIES.flatMap((c) => SEGMENT_DEVICES.map((d) => `${c} · ${d}`));

export interface SliceResult {
  name: string;
  arms: Arms;
  test: ZTest;
}

export const SLICE_BASELINE = 10;

/** 20 slices of A/A data (no true difference anywhere), each tested on its own. */
export function sliceRun(seed: number): SliceResult[] {
  const rnd = mulberry32(seed);
  const p = SLICE_BASELINE / 100;
  return SEGMENTS.map((name) => {
    const arms: Arms = {
      conversionsA: binomialDraw(rnd, SLICE_VISITORS, p),
      visitorsA: SLICE_VISITORS,
      conversionsB: binomialDraw(rnd, SLICE_VISITORS, p),
      visitorsB: SLICE_VISITORS,
    };
    return { name, arms, test: zTest(arms) };
  });
}

/** Threshold for each slice: α, or α ÷ 20 with Bonferroni. */
export const sliceAlpha = (bonferroni: boolean): number => (bonferroni ? ALPHA / SLICES : ALPHA);

/** The chance of at least one false positive among k independent tests at level α: 1 − (1 − α)^k. */
export const familyWiseRate = (k: number, alpha = ALPHA): number => 1 - (1 - alpha) ** k;

/** Slices below the threshold, and how many of those show B ahead ("the segment where B wins"). */
export function significantSlices(run: readonly SliceResult[], threshold: number): { significant: number[]; bWins: number[] } {
  const significant = run.flatMap((s, i) => (s.test.p !== null && s.test.p < threshold ? [i] : []));
  return { significant, bWins: significant.filter((i) => run[i].test.diff > 0) };
}

/** P-values of every slice of `runs` replicated A/A experiments (counted once per seed, then judged at any threshold). */
export function slicePValues(seed: number, runs = SLICE_REPLICATES): number[][] {
  return Array.from({ length: runs }, (_, i) => sliceRun(runSeed(seed, i + 1)).map((s) => s.test.p ?? 1));
}

/** Share of replicated experiments with at least one slice below the threshold. */
export const anySignificantRate = (pValues: readonly (readonly number[])[], threshold: number): number =>
  pValues.filter((row) => row.some((p) => p < threshold)).length / pValues.length;

/* ---------- scene 5: your own numbers ---------- */

export interface ArmFields {
  conversionsA: string;
  visitorsA: string;
  conversionsB: string;
  visitorsB: string;
}

export type ArmErrors = Partial<Record<keyof ArmFields, string>>;

export const FIELD_NAMES: Record<keyof ArmFields, string> = {
  conversionsA: 'conversions for A',
  visitorsA: 'visitors for A',
  conversionsB: 'conversions for B',
  visitorsB: 'visitors for B',
};

const countField = (name: string, min: number) => (text: string) =>
  parseBoundedInt(text, {
    min,
    max: COUNT_MAX,
    messages: {
      empty: `Type ${name}.`,
      invalid: (typed) => `"${typed}" isn't a whole number for ${name}: plain digits only (no decimals, exponents or units).`,
      tooSmall: () => (min > 0 ? `${name} has to be at least ${min}.` : `${name} can't be negative.`),
      tooBig: () => `${name} can't be more than ${COUNT_MAX.toLocaleString('en-US')}.`,
    },
  });

/** All four fields read at once: the arms, or the reason each refused field is refused (so the old values can stay). */
export function parseArms(f: ArmFields): { ok: true; arms: Arms } | { ok: false; errors: ArmErrors } {
  const read = {
    conversionsA: countField(FIELD_NAMES.conversionsA, 0)(f.conversionsA),
    visitorsA: countField(FIELD_NAMES.visitorsA, 1)(f.visitorsA),
    conversionsB: countField(FIELD_NAMES.conversionsB, 0)(f.conversionsB),
    visitorsB: countField(FIELD_NAMES.visitorsB, 1)(f.visitorsB),
  };
  const errors: ArmErrors = {};
  for (const key of Object.keys(read) as (keyof ArmFields)[]) {
    const r = read[key];
    if (!r.ok) errors[key] = r.error;
  }
  if (read.conversionsA.ok && read.visitorsA.ok && read.conversionsA.value > read.visitorsA.value) {
    errors.conversionsA = `Conversions for A can't be more than its ${read.visitorsA.value.toLocaleString('en-US')} visitors.`;
  }
  if (read.conversionsB.ok && read.visitorsB.ok && read.conversionsB.value > read.visitorsB.value) {
    errors.conversionsB = `Conversions for B can't be more than its ${read.visitorsB.value.toLocaleString('en-US')} visitors.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    arms: {
      conversionsA: (read.conversionsA as { value: number }).value,
      visitorsA: (read.visitorsA as { value: number }).value,
      conversionsB: (read.conversionsB as { value: number }).value,
      visitorsB: (read.visitorsB as { value: number }).value,
    },
  };
}

/* ---------- each scene's default state, named so a test can pin the real first screen ---------- */

/** Seed 4 opens on a typical result for a real +2 point lift at 1,000 visitors: a miss. */
export const RUN_DEFAULT = { baseline: 10, lift: 2, exponent: 3, seed: 4 };
export const REPEAT_DEFAULT = { baseline: 10, lift: 0, exponent: 3, seed: 1, mde: 1, power: 0.8 };
/** Seed 23 opens on an A/A run whose p-value dips below 0.05 at look 9 and then drifts away. */
export const PEEK_DEFAULT = { baseline: 10, lift: 0, looks: 20, seed: 23, bonferroni: false };
export const SLICE_DEFAULT = { seed: 1, bonferroni: false };
export const OWN_DEFAULT: ArmFields = { conversionsA: '100', visitorsA: '1000', conversionsB: '130', visitorsB: '1000' };
