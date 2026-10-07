// Pure maths for modular-arithmetic: the clock walk, the multiplication table and its
// inverses, and JavaScript's % next to a true mod. Everything is computed, nothing scripted.
import { gcd, mod } from '../../core/numberTheory';
import { parseBoundedInt, type FieldParse } from '../../core/parse';

export const MIN_MOD = 2;
export const MAX_MOD = 24;
export const DEFAULT_MOD = 12;
/** Largest magnitude a learner may type. */
export const MAX_ABS = 1_000_000;
/** Above this many steps a walk is reduced mod n first instead of stepping every tick. */
export const walkLimit = (n: number) => 2 * n;

/** a mod n on plain numbers, always in [0, n): core/numberTheory's bigint mod. */
export const modN = (a: number, n: number) => Number(mod(BigInt(a), BigInt(n)));

/** JavaScript's own remainder operator, which keeps the sign of a. */
export const jsRemainder = (a: number, n: number) => a % n;

/**
 * A whole number typed by the learner, within [min, max]. Accepts a typographic minus.
 * Empty, decimals, exponents, emoji, markup and lists are refused with a reason.
 */
export function parseWhole(text: string, min: number, max: number): FieldParse<number> {
  const range = () => `Keep it between ${fmt(min)} and ${fmt(max)}.`;
  return parseBoundedInt(text, {
    min,
    max,
    typographicMinus: true,
    messages: {
      invalid: () => 'Whole numbers only, like 17 or −7 (no decimals, exponents or letters).',
      tooSmall: range,
      tooBig: range,
    },
  });
}

/** Grouped with a typographic minus: −1,000,000. */
export const fmt = (v: number) => (v < 0 ? `−${(-v).toLocaleString('en-US')}` : v.toLocaleString('en-US'));

// ── The clock walk ───────────────────────────────────────────────────

export interface Walk {
  /** Every position the hand lands on, in order (not counting the start). */
  path: number[];
  /** The amount actually stepped, after reducing a mod n when a is negative or large. */
  stepped: number;
  /** True when a was reduced before walking. */
  reduced: boolean;
  result: number;
}

/** +a from `from`: one tick at a time, or a reduced first when it is negative or more than two laps. */
export function walkPlus(from: number, a: number, n: number): Walk {
  const reduced = a < 0 || a > walkLimit(n);
  const stepped = reduced ? modN(a, n) : a;
  const path: number[] = [];
  let pos = from;
  for (let i = 0; i < stepped; i++) {
    pos = (pos + 1) % n;
    path.push(pos);
  }
  return { path, stepped, reduced, result: modN(from + a, n) };
}

/** ×a on `from`: starting at 0, `a` jumps of length `from` (a reduced mod n first when needed). */
export function walkTimes(from: number, a: number, n: number): Walk {
  const reduced = a < 0 || a > walkLimit(n);
  const stepped = reduced ? modN(a, n) : a;
  const path: number[] = [];
  let pos = 0;
  for (let i = 0; i < stepped; i++) {
    pos = (pos + from) % n;
    path.push(pos);
  }
  return { path, stepped, reduced, result: modN(from * a, n) };
}

// ── The multiplication table ─────────────────────────────────────────

/** (a × b) mod n for a, b in 1..n−1 (0 is left out: 0 × anything is 0). table[a−1][b−1]. */
export function productTable(n: number): number[][] {
  return Array.from({ length: n - 1 }, (_, i) => Array.from({ length: n - 1 }, (_, j) => modN((i + 1) * (j + 1), n)));
}

/** The b in row a whose product is 1, read off the table, or null when the row has no 1. */
export function inverseInTable(table: number[][], a: number): number | null {
  const j = table[a - 1].indexOf(1);
  return j === -1 ? null : j + 1;
}

/** Rows (values of a) with no 1 anywhere: the numbers with no inverse mod n. Read off the table. */
export function rowsWithoutInverse(table: number[][]): number[] {
  return table.flatMap((_, i) => (inverseInTable(table, i + 1) === null ? [i + 1] : []));
}

export const gcdN = (a: number, n: number) => Number(gcd(BigInt(a), BigInt(n)));

// ── Negative numbers ─────────────────────────────────────────────────

/** a = q·n + r both ways: JS truncates the quotient toward zero, mod rounds it down. */
export function decompositions(a: number, n: number) {
  const truncQ = Math.trunc(a / n);
  const floorQ = Math.floor(a / n);
  return {
    js: { q: truncQ, r: a - truncQ * n },
    mod: { q: floorQ, r: a - floorQ * n },
  };
}

export const RING_SIZE = 5;
export const RING_ITEMS = ['A', 'B', 'C', 'D', 'E'] as const;

/** The usual bug: (i − 1) % n is −1 at i = 0, and buf[−1] is undefined. */
export const ringPrevBuggy = (i: number, n: number) => (i - 1) % n;
/** The fix: ((x % n) + n) % n always lands in 0..n−1. */
export const ringPrevFixed = (i: number, n: number) => (((i - 1) % n) + n) % n;
export const ringNext = (i: number, n: number) => (i + 1) % n;
