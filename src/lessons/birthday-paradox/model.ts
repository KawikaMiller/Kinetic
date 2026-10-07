// Pure maths for birthday-paradox: the pigeonhole verdict, seeded birthday runs on a
// 365-day calendar, the exact collision curve, and collisions among random IDs.
import { power } from '../../core/format';
import { mulberry32, randInt } from '../../core/random';
import { collisionProbability } from '../../core/stats';

// ── Pigeonhole ───────────────────────────────────────────────────────

/** n pigeons in m holes must double up somewhere exactly when n > m. */
export const guaranteed = (pigeons: number, holes: number) => pigeons > holes;

/** People needed for a certain shared birthday among `days` possible days. */
export const certainAt = (days: number) => days + 1;

/** The fairest spread, the one that best avoids sharing: hole i gets ⌊n/m⌋, the first n mod m get one more. */
export const spread = (pigeons: number, holes: number) =>
  Array.from({ length: holes }, (_, i) => Math.floor(pigeons / holes) + (i < pigeons % holes ? 1 : 0));

// ── Birthdays ────────────────────────────────────────────────────────

export const DAYS = 365;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** A non-leap year: Feb 29 is left out, as the uniform 365-day model does. */
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const MONTH_START = MONTH_DAYS.map((_, i) => MONTH_DAYS.slice(0, i).reduce((a, b) => a + b, 0));

/** Day of year (0 … 364) for a calendar cell, or null for a cell past the month's end. */
export const cellDay = (month: number, date: number) => (date < MONTH_DAYS[month] ? MONTH_START[month] + date : null);

/** "Mar 14" for a day of year. */
export function dayName(day: number): string {
  const month = MONTH_START.findLastIndex((s) => s <= day);
  return `${MONTHS[month]} ${day - MONTH_START[month] + 1}`;
}

export interface Run {
  /** Birthdays in arrival order; the last one repeats an earlier one. */
  days: number[];
  /** Index of the earlier person sharing the last birthday. */
  match: number;
}

/** People arrive with random birthdays until two share one. */
export function firstCollision(seed: number): Run {
  const rnd = mulberry32(seed);
  const seen = new Map<number, number>();
  const days: number[] = [];
  for (;;) {
    const day = randInt(0, DAYS - 1, rnd);
    const earlier = seen.get(day);
    days.push(day);
    if (earlier !== undefined) return { days, match: earlier };
    seen.set(day, days.length - 1);
  }
}

/** People in the room at the first shared birthday, for `count` seeded runs from `firstSeed`. */
export const runSizes = (firstSeed: number, count: number) =>
  Array.from({ length: count }, (_, i) => firstCollision(firstSeed + i).days.length);

/** Exact chance that some two of n people share a birthday: 1 − ∏(1 − i/365). */
export const birthdayChance = (n: number) => collisionProbability(n, DAYS).p;

/** Pairs among n people: C(n, 2). */
export const pairs = (n: number) => (n * (n - 1)) / 2;

// ── IDs ──────────────────────────────────────────────────────────────

export const MIN_BITS = 16;
export const MAX_BITS = 128;

/** IDs at which a repeat becomes a coin flip: √(2 ln 2 · d) ≈ 1.1774 √d. */
export const halfPoint = (bits: number) => Math.sqrt(2 * Math.LN2 * 2 ** bits);

export interface IdPreset {
  label: string;
  bits: number;
}

export const ID_PRESETS: readonly IdPreset[] = [
  { label: 'Git short hash (7 hex = 28 bits)', bits: 28 },
  { label: '32-bit ID', bits: 32 },
  { label: '64-bit ID', bits: 64 },
  { label: 'UUIDv4 (122 random bits)', bits: 122 },
];

/** A probability for display: "50.7%", "> 99.99%", or "≈ 2.9 × 10⁻²⁷" when it's tiny. */
export function chance(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 0.99995) return p >= 1 ? '100%' : '> 99.99%';
  if (p >= 1e-4) return `${(p * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  const exponent = Math.floor(Math.log10(p));
  return `≈ ${(p / 10 ** exponent).toFixed(1)} × ${power(exponent, 10)}`;
}

/** A big count, grouped while it's readable, as a power of ten after. */
export function count(v: number): string {
  if (v < 1e12) return Math.round(v).toLocaleString('en-US');
  const exponent = Math.floor(Math.log10(v));
  return `${(v / 10 ** exponent).toFixed(1)} × ${power(exponent, 10)}`;
}
