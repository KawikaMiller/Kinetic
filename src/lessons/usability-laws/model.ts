/**
 * Fitts's law (Shannon formulation) and the Hick-Hyman law, fitted to the learner's own
 * timed clicks with core/fit's least squares. Pure: the stage records trials and passes them in.
 */
import { gaussian } from '../../core/fixtures/datasets';
import { leastSquares } from '../../core/fit';
import { mulberry32, shuffle } from '../../core/random';

/** Fitts's index of difficulty in bits, Shannon formulation (MacKenzie 1992): ID = log₂(D/W + 1). */
export function indexOfDifficulty(distance: number, width: number): number {
  if (!(width > 0) || !(distance >= 0)) return NaN;
  return Math.log2(distance / width + 1);
}

/** Hick-Hyman's information term for n equally likely choices: log₂(n + 1). */
export const choiceBits = (n: number) => (n >= 1 ? Math.log2(n + 1) : NaN);

export type Input = 'mouse' | 'touch' | 'pen' | 'keyboard';

export interface Trial {
  /** The x of the fit: ID for Fitts, log₂(n + 1) for Hick. */
  bits: number;
  /** Measured time in ms (null for a miss: it never counts). */
  ms: number | null;
  input: Input;
  miss: boolean;
}

export const MIN_TRIALS = 3;

export type Fit =
  | { ok: true; a: number; b: number; r2: number | null; n: number; misses: number }
  | { ok: false; reason: string; n: number; misses: number };

/** Least-squares line time = a + b·bits over the valid trials only; misses never enter it. */
export function fitTrials(trials: readonly Trial[]): Fit {
  const valid = trials.filter((t) => !t.miss && t.ms !== null);
  const misses = trials.length - valid.length;
  if (valid.length < MIN_TRIALS) return { ok: false, reason: `need at least ${MIN_TRIALS} trials`, n: valid.length, misses };
  const xs = valid.map((t) => t.bits);
  const ys = valid.map((t) => t.ms!);
  if (new Set(xs).size < 2) return { ok: false, reason: 'need trials at two or more different difficulties', n: valid.length, misses };
  const f = leastSquares(xs, ys, 1);
  if (!f) return { ok: false, reason: 'need trials at two or more different difficulties', n: valid.length, misses };
  const [a, b] = f.coeffs;
  return { ok: true, a, b, r2: rSquared(xs, ys, a, b), n: valid.length, misses };
}

/** 1 − SS_res / SS_tot; null when every time is the same (nothing to explain). */
export function rSquared(xs: readonly number[], ys: readonly number[], a: number, b: number): number | null {
  const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
  const tot = ys.reduce((s, y) => s + (y - mean) ** 2, 0);
  if (tot === 0) return null;
  const res = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0);
  return 1 - res / tot;
}

export const predict = (fit: { a: number; b: number }, bits: number) => fit.a + fit.b * bits;

// ── Fitts game ───────────────────────────────────────────────────────

export const FITTS_TRIALS = 24;
/** Distances as shares of the usable arena width, and target widths in CSS px. */
export const DISTANCE_SHARES = [0.2, 0.4, 0.6, 0.85] as const;
export const TARGET_WIDTHS = [12, 24, 48] as const;
const EDGE = 10;

export interface FittsTrial {
  /** Centre of the start dot and of the target, in px from the arena's left edge. */
  start: number;
  target: number;
  width: number;
  distance: number;
  id: number;
}

/** 24 trials: each distance × width pair twice, seeded order, alternating direction, fitted to the arena's width. */
export function fittsSchedule(seed: number, arenaWidth: number): FittsTrial[] {
  const rnd = mulberry32(seed);
  const pairs = DISTANCE_SHARES.flatMap((d) => TARGET_WIDTHS.map((w) => ({ d, w })));
  const order = shuffle([...pairs, ...pairs], rnd);
  const margin = Math.max(...TARGET_WIDTHS) / 2 + EDGE;
  const usable = Math.max(0, arenaWidth - 2 * margin);
  return order.map(({ d, w }, i) => {
    const distance = Math.round(d * usable);
    const slack = usable - distance;
    const left = margin + Math.round(rnd() * slack);
    const [start, target] = i % 2 ? [left + distance, left] : [left, left + distance];
    return { start, target, width: w, distance, id: indexOfDifficulty(distance, w) };
  });
}

/** Was a click at x (px) inside the target strip? */
export const hitsTarget = (t: FittsTrial, x: number) => Math.abs(x - t.target) <= t.width / 2;

// ── Synthetic participant ────────────────────────────────────────────

/** Illustrative constants, within the range reported for mouse pointing; not a measurement of anyone. */
export const SYNTH_FITTS = { a: 200, b: 150, noise: 70 };
export const SYNTH_HICK = { a: 350, b: 150, noise: 90 };
const SYNTH_ARENA = 340;

export function syntheticFitts(seed = 7): Trial[] {
  const rnd = mulberry32(seed);
  return fittsSchedule(seed, SYNTH_ARENA).map((t) => ({
    bits: t.id, ms: Math.max(80, SYNTH_FITTS.a + SYNTH_FITTS.b * t.id + gaussian(rnd) * SYNTH_FITTS.noise), input: 'mouse', miss: false,
  }));
}

export function syntheticHick(seed = 7): Trial[] {
  const rnd = mulberry32(seed);
  return hickSchedule(seed).map((r) => ({
    bits: choiceBits(r.n), ms: Math.max(150, SYNTH_HICK.a + SYNTH_HICK.b * choiceBits(r.n) + gaussian(rnd) * SYNTH_HICK.noise), input: 'mouse', miss: false,
  }));
}

// ── Design panel ─────────────────────────────────────────────────────

export interface Layout {
  id: string;
  label: string;
  /** Pointer travel to the button and the button's width along it, in px. */
  distance: number;
  width: number;
  /** Pinned to a screen edge: the edge stops the pointer, so the width along the movement is unbounded. */
  edge: boolean;
}

export const LAYOUTS: readonly Layout[] = [
  { id: 'far', label: 'Tiny icons, far away', distance: 600, width: 16, edge: false },
  { id: 'near', label: 'Big buttons, nearby', distance: 150, width: 48, edge: false },
  { id: 'edge', label: 'Pinned to the screen edge', distance: 600, width: 16, edge: true },
];

/** ID for a layout: an edge target's effective width is unbounded, so its ID is the law's limit, 0 bits. */
export const layoutId = (l: Layout) => (l.edge ? 0 : indexOfDifficulty(l.distance, l.width));

// ── Hick game ────────────────────────────────────────────────────────

export const MENU_SIZES = [2, 4, 8, 16, 32] as const;
export const HICK_TRIALS = 15;

export const MENU_ITEMS: readonly string[] = [
  'Apple', 'Apricot', 'Avocado', 'Banana', 'Beetroot', 'Blueberry', 'Broccoli', 'Cabbage', 'Carrot', 'Celery', 'Cherry', 'Coconut',
  'Courgette', 'Cucumber', 'Date', 'Fig', 'Garlic', 'Grape', 'Kale', 'Kiwi', 'Leek', 'Lemon', 'Lime', 'Mango',
  'Melon', 'Onion', 'Orange', 'Papaya', 'Peach', 'Pear', 'Plum', 'Radish',
];

export interface HickRound {
  n: number;
  /** The menu as shown, and the item to click. */
  items: string[];
  target: string;
}

/** Every menu size three times, seeded order; each round picks its items and target at random. */
export function hickSchedule(seed: number, alphabetical = false): HickRound[] {
  const rnd = mulberry32(seed + 1000);
  const sizes = shuffle(MENU_SIZES.flatMap((n) => [n, n, n]), rnd);
  return sizes.map((n) => {
    const chosen = shuffle(MENU_ITEMS, rnd).slice(0, n);
    const items = alphabetical ? [...chosen].sort() : chosen;
    return { n, items, target: chosen[Math.floor(rnd() * n)] };
  });
}

// ── Touch targets ────────────────────────────────────────────────────

/** WCAG 2.2 SC 2.5.8 Target Size (Minimum), level AA: 24 × 24 CSS px (with exceptions). */
export const WCAG_MIN_TARGET = 24;
