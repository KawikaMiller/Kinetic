/**
 * Monotonic stacks and deques: the three one-pass algorithms the lesson animates, each
 * recording every push and pop so the frames (and the tests) can count them.
 */

/** At most this many values fit on screen at a readable size. */
export const MAX_VALUES = 12;
/** Values are whole numbers from 0 to this. */
export const MAX_VALUE = 99;

export type FieldResult = { ok: true; values: number[] } | { ok: false; error: string };

const PLAIN_INT = /^-?\d+$/;

/**
 * The learner's list. Empty (or only spaces) is accepted as an empty list, which the
 * frames explain; everything else that isn't 0-12 whole numbers from 0 to 99 is refused
 * with a sentence, and the caller keeps the previous values.
 */
export function parseValues(text: string): FieldResult {
  const t = text.trim();
  if (t === '') return { ok: true, values: [] };
  if (/^,|,$|,\s*,/.test(t)) return { ok: false, error: 'There’s a gap in the list: remove the extra comma.' };
  const tokens = t.split(/[\s,]+/);
  if (!tokens.every((s) => PLAIN_INT.test(s))) return { ok: false, error: 'Type whole numbers separated by commas or spaces, like 73, 74, 75.' };
  if (tokens.some((s) => s.startsWith('-'))) return { ok: false, error: `No negatives here: use whole numbers from 0 to ${MAX_VALUE}.` };
  if (tokens.length > MAX_VALUES) return { ok: false, error: `Up to ${MAX_VALUES} numbers fit on screen; that's ${tokens.length}.` };
  // Compare as digit strings first, so a 23-digit number is refused rather than rounded.
  if (tokens.some((s) => s.replace(/^0+(?=\d)/, '').length > 2)) return { ok: false, error: `Keep each number between 0 and ${MAX_VALUE}.` };
  return { ok: true, values: tokens.map(Number) };
}

// ── Next greater element (daily temperatures) ─────────────────────────

export type NgOp = { t: 'push'; i: number } | { t: 'pop'; i: number; by: number };

export interface NextGreater {
  /** Index of the next strictly greater value to the right, or null if there is none. */
  next: (number | null)[];
  ops: NgOp[];
}

/** One left-to-right pass with a stack of indices whose values never increase from bottom to top. */
export function nextGreater(values: readonly number[]): NextGreater {
  const next: (number | null)[] = values.map(() => null);
  const stack: number[] = [];
  const ops: NgOp[] = [];
  values.forEach((v, i) => {
    while (stack.length && values[stack[stack.length - 1]] < v) {
      const j = stack.pop()!;
      next[j] = i;
      ops.push({ t: 'pop', i: j, by: i });
    }
    stack.push(i);
    ops.push({ t: 'push', i });
  });
  return { next, ops };
}

/** Comparisons the brute-force scan makes: from each day, look right until a warmer one. */
export function bruteNextComparisons(values: readonly number[]): number {
  let count = 0;
  values.forEach((v, i) => {
    for (let j = i + 1; j < values.length; j++) {
      count++;
      if (values[j] > v) break;
    }
  });
  return count;
}

// ── Sliding-window maximum ────────────────────────────────────────────

export type DqOp =
  | { t: 'push'; i: number }
  /** Left at the back: a value at least as big arrived, so this one can never be a max again. */
  | { t: 'drop'; i: number; by: number }
  /** Left at the front: it slid out of the window. */
  | { t: 'expire'; i: number; at: number }
  /** The window ending at `end` is complete; its maximum sits at index `i`, the deque's front. */
  | { t: 'max'; end: number; i: number };

export interface SlidingMax {
  /** Max of each window, in order: maxes[s] is the window starting at s. */
  maxes: number[];
  ops: DqOp[];
}

/** One pass with a deque of indices whose values strictly decrease from front to back. */
export function slidingMax(values: readonly number[], k: number): SlidingMax {
  const dq: number[] = [];
  const ops: DqOp[] = [];
  const maxes: number[] = [];
  if (k < 1) return { maxes, ops };
  values.forEach((v, i) => {
    while (dq.length && dq[0] <= i - k) ops.push({ t: 'expire', i: dq.shift()!, at: i });
    while (dq.length && values[dq[dq.length - 1]] <= v) ops.push({ t: 'drop', i: dq.pop()!, by: i });
    dq.push(i);
    ops.push({ t: 'push', i });
    if (i >= k - 1) {
      maxes.push(values[dq[0]]);
      ops.push({ t: 'max', end: i, i: dq[0] });
    }
  });
  return { maxes, ops };
}

/** Comparisons brute force makes: every window of k scanned on its own. */
export const bruteWindowComparisons = (n: number, k: number) => (k >= 1 && n >= k ? (n - k + 1) * (k - 1) : 0);

// ── Largest rectangle in a histogram ─────────────────────────────────

export interface Rect {
  /** First and last bar it covers, inclusive. */
  from: number;
  to: number;
  height: number;
  area: number;
}

export type RectOp =
  | { t: 'push'; i: number }
  /** Bar `i` is popped when bar `at` (or the end, at = n) is no taller; its rectangle spans left+1 .. at-1. */
  | { t: 'pop'; i: number; at: number; rect: Rect };

export interface LargestRect {
  best: Rect | null;
  ops: RectOp[];
}

/**
 * One pass with a stack of bars whose heights strictly increase from bottom to top, plus a
 * height-0 sentinel at the end that pops everything left. A bar's rectangle is computed when
 * it's popped: it can't reach past the bar that popped it, nor past the bar now under it.
 */
export function largestRectangle(values: readonly number[]): LargestRect {
  const stack: number[] = [];
  const ops: RectOp[] = [];
  let best: Rect | null = null;
  for (let at = 0; at <= values.length; at++) {
    const h = at === values.length ? 0 : values[at];
    while (stack.length && values[stack[stack.length - 1]] >= h) {
      const i = stack.pop()!;
      const left = stack.length ? stack[stack.length - 1] : -1;
      const rect = { from: left + 1, to: at - 1, height: values[i], area: values[i] * (at - left - 1) };
      ops.push({ t: 'pop', i, at, rect });
      if (!best || rect.area > best.area) best = rect;
    }
    if (at < values.length) {
      stack.push(at);
      ops.push({ t: 'push', i: at });
    }
  }
  return { best, ops };
}

/** Ranges brute force tries: every (from, to) pair, each with its own minimum. */
export const bruteRectRanges = (n: number) => (n * (n + 1)) / 2;

/** Pushes and pops in a trace. */
export function opCounts(ops: readonly { t: string }[]): { pushes: number; pops: number } {
  const pushes = ops.filter((o) => o.t === 'push').length;
  const pops = ops.filter((o) => o.t === 'pop' || o.t === 'drop' || o.t === 'expire').length;
  return { pushes, pops };
}

export interface Preset {
  id: string;
  label: string;
  values: number[];
}

/** Starting values per scene: the classic examples, plus the edge cases worth poking. */
export const PRESETS = {
  warmer: [
    { id: 'week', label: 'A week', values: [73, 74, 75, 71, 69, 72, 76, 73] },
    { id: 'ties', label: 'Equal days', values: [70, 70, 72, 72, 71, 75] },
    { id: 'cooling', label: 'Cooling off', values: [80, 76, 74, 70, 68] },
    { id: 'saw', label: 'Big pop', values: [60, 58, 57, 55, 54, 52, 51, 90] },
  ],
  window: [
    { id: 'mixed', label: 'Mixed', values: [1, 3, 1, 2, 0, 5, 4, 6, 2] },
    { id: 'falling', label: 'Falling', values: [9, 8, 7, 6, 5, 4, 3] },
    { id: 'rising', label: 'Rising', values: [1, 2, 3, 4, 5, 6, 7] },
  ],
  rect: [
    { id: 'classic', label: 'Classic', values: [2, 1, 5, 6, 2, 3] },
    { id: 'flat', label: 'Equal heights', values: [3, 3, 3, 3] },
    { id: 'gap', label: 'With a zero', values: [4, 2, 0, 3, 2, 5] },
  ],
} satisfies Record<'warmer' | 'window' | 'rect', Preset[]>;

/** Window sizes offered. */
export const K_CHOICES = [2, 3, 4] as const;
