import { mulberry32, randInt } from '../../core/random';

export const TEXT_MAX = 16;
export const PATTERN_MAX = 8;
export const COST_N_MIN = 16;
export const COST_N_MAX = 1000;
export const COST_N_DEFAULT = 200;
/** The lengths the cost plot is run at: every point is a real sort of a real string. */
export const COST_SWEEP: readonly number[] = [16, 32, 64, 128, 256, 512, COST_N_MAX];
export const ALPHABETS = [2, 4, 26] as const;
export type Alphabet = (typeof ALPHABETS)[number];
export const DEFAULT_SEED = 7;
export const DEFAULT_TEXT = 'banana';

/** The prefix rule: a suffix that ends first sorts first. `inverted` is the broken mode. */
export type PrefixRule = 'correct' | 'inverted';

/** The smallest string on which the inverted prefix rule gives a wrong array, said on screen. */
export const PREFIX_RULE_WITNESS = 'aa';
/** The strings the broken mode is counted over: every string over {a, b} up to this length. */
export const WITNESS_MAX_LENGTH = 10;

export const EMPTY_PATTERN_MESSAGE = 'An empty pattern matches at every position: type at least one character.';
export const EMPTY_TEXT_MESSAGE = 'Type at least one character of text: an empty text has no suffixes to sort.';

/** Length-limited, printable-only text: control characters are dropped. */
export const printable = (s: string): string => [...s].filter((c) => c.charCodeAt(0) >= 0x20 && c !== '\u007f').join('');

export const hasSurrogate = (s: string) => /[\ud800-\udfff]/.test(s);

export const SURROGATE_NOTE = 'Strings are compared by UTF-16 code unit: an emoji is two code units here, so it takes two positions.';

export type Parsed = { ok: true; value: string; surrogates: boolean } | { ok: false; error: string };

/** Reads the text field: printable characters, 1 to TEXT_MAX of them. */
export function parseText(raw: string): Parsed {
  const value = printable(raw);
  if (value.length === 0) return { ok: false, error: EMPTY_TEXT_MESSAGE };
  if (value.length > TEXT_MAX) return { ok: false, error: `The text is limited to ${TEXT_MAX} characters so every suffix fits on screen.` };
  return { ok: true, value, surrogates: hasSurrogate(value) };
}

/** Reads the pattern field: printable characters, 1 to PATTERN_MAX of them; an empty pattern is refused with the reason. */
export function parsePattern(raw: string): Parsed {
  const value = printable(raw);
  if (value.length === 0) return { ok: false, error: EMPTY_PATTERN_MESSAGE };
  if (value.length > PATTERN_MAX) return { ok: false, error: `The pattern is limited to ${PATTERN_MAX} characters.` };
  return { ok: true, value, surrogates: hasSurrogate(value) };
}

export interface Cost {
  /** Calls of the suffix comparator while sorting. */
  comparisons: number;
  /** Pairs of characters looked at inside those calls. */
  charsCompared: number;
}

/** Compares the suffixes starting at i and j (i is not j): negative when i sorts first. Counts the characters it looks at. */
function compareSuffixes(text: string, i: number, j: number, rule: PrefixRule, cost: Cost): number {
  const n = text.length;
  let k = 0;
  while (i + k < n && j + k < n) {
    cost.charsCompared += 1;
    const a = text[i + k];
    const b = text[j + k];
    if (a !== b) return a < b ? -1 : 1;
    k += 1;
  }
  const iEndsFirst = i + k >= n;
  const endsFirstSortsFirst = rule === 'correct';
  return iEndsFirst === endsFirstSortsFirst ? -1 : 1;
}

/** Top-down merge sort over start positions, so the number of comparator calls is the algorithm's, not an engine's. */
function mergeSort(items: number[], less: (a: number, b: number) => number): number[] {
  if (items.length < 2) return items;
  const mid = items.length >> 1;
  const left = mergeSort(items.slice(0, mid), less);
  const right = mergeSort(items.slice(mid), less);
  const out: number[] = [];
  let l = 0;
  let r = 0;
  while (l < left.length && r < right.length) out.push(less(left[l], right[r]) <= 0 ? left[l++] : right[r++]);
  while (l < left.length) out.push(left[l++]);
  while (r < right.length) out.push(right[r++]);
  return out;
}

/** The suffix array of `text` with the cost of building it by a comparison sort. */
export function buildSuffixArray(text: string, rule: PrefixRule = 'correct'): { sa: number[]; cost: Cost } {
  const cost: Cost = { comparisons: 0, charsCompared: 0 };
  const starts = Array.from({ length: text.length }, (_, i) => i);
  const sa = mergeSort(starts, (a, b) => {
    cost.comparisons += 1;
    return compareSuffixes(text, a, b, rule, cost);
  });
  return { sa, cost };
}

export const suffixArray = (text: string, rule: PrefixRule = 'correct'): number[] => buildSuffixArray(text, rule).sa;

/** Kasai's linear-time LCP: entry k is the longest common prefix of the k-th and (k-1)-th sorted suffix; entry 0 is 0. */
export function lcpKasai(text: string, sa: readonly number[]): number[] {
  const n = text.length;
  const rank = new Array<number>(n);
  sa.forEach((start, k) => {
    rank[start] = k;
  });
  const lcp = new Array<number>(n).fill(0);
  let h = 0;
  for (let i = 0; i < n; i += 1) {
    if (rank[i] > 0) {
      const j = sa[rank[i] - 1];
      while (i + h < n && j + h < n && text[i + h] === text[j + h]) h += 1;
      lcp[rank[i]] = h;
      if (h > 0) h -= 1;
    } else {
      h = 0;
    }
  }
  return lcp;
}

/** n(n+1)/2 start-and-length pairs, minus the repeats the LCP column counts. */
export function distinctSubstrings(n: number, lcp: readonly number[]): number {
  return (n * (n + 1)) / 2 - lcp.reduce((a, b) => a + b, 0);
}

export interface Repeat {
  length: number;
  /** The first sorted position that holds the maximum (ties go to the earlier one). */
  at: number;
  text: string;
}

export function longestRepeated(text: string, sa: readonly number[], lcp: readonly number[]): Repeat {
  const length = Math.max(0, ...lcp);
  const at = length === 0 ? -1 : lcp.indexOf(length);
  return { length, at, text: length === 0 ? '' : text.slice(sa[at], sa[at] + length) };
}

export interface Probe {
  /** Position in the suffix array that was probed. */
  pos: number;
  /** Where that suffix starts in the text. */
  start: number;
  /** The first |p| characters of the suffix: all the probe compares. */
  shown: string;
  /** Whether the search range's low end moves up past this position (otherwise its high end moves down to it). */
  goesRight: boolean;
}

export interface Bound {
  index: number;
  probes: Probe[];
}

function bound(text: string, sa: readonly number[], p: string, keepLeft: (shown: string) => boolean): Bound {
  let lo = 0;
  let hi = sa.length;
  const probes: Probe[] = [];
  while (lo < hi) {
    const pos = (lo + hi) >> 1;
    const shown = text.slice(sa[pos], sa[pos] + p.length);
    const goesRight = !keepLeft(shown);
    probes.push({ pos, start: sa[pos], shown, goesRight });
    if (goesRight) lo = pos + 1;
    else hi = pos;
  }
  return { index: lo, probes };
}

/** First sorted position whose first |p| characters are not below p. */
export const lowerBound = (text: string, sa: readonly number[], p: string): Bound => bound(text, sa, p, (shown) => shown >= p);
/** First sorted position whose first |p| characters are above p. */
export const upperBound = (text: string, sa: readonly number[], p: string): Bound => bound(text, sa, p, (shown) => shown > p);

export interface SearchResult {
  lower: Bound;
  upper: Bound;
  lo: number;
  hi: number;
  count: number;
  positions: number[];
}

export function search(text: string, sa: readonly number[], p: string): SearchResult {
  const lower = lowerBound(text, sa, p);
  const upper = upperBound(text, sa, p);
  return { lower, upper, lo: lower.index, hi: upper.index, count: upper.index - lower.index, positions: sa.slice(lower.index, upper.index) };
}

export interface OrderVerdict {
  /** Index in the learner's list of the first out-of-order adjacent pair (the pair is k and k + 1). */
  k: number;
  reason: string;
}

const suffixOf = (text: string, start: number) => text.slice(start);

/** The first adjacent pair of `order` that is out of order under `rule`, with the reason, or null when the list is sorted. */
export function checkOrder(text: string, order: readonly number[], rule: PrefixRule = 'correct'): OrderVerdict | null {
  const scratch: Cost = { comparisons: 0, charsCompared: 0 };
  for (let k = 0; k + 1 < order.length; k += 1) {
    const upper = order[k];
    const lower = order[k + 1];
    if (compareSuffixes(text, upper, lower, rule, scratch) <= 0) continue;
    const a = suffixOf(text, upper);
    const b = suffixOf(text, lower);
    let at = 0;
    while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
    if (at < a.length && at < b.length) {
      return { k, reason: `${b} sorts before ${a}: at position ${at}, '${b[at]}' comes before '${a[at]}'.` };
    }
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    return {
      k,
      reason: rule === 'correct'
        ? `${short} sorts before ${long}: ${short} is a prefix of ${long}, and a suffix that ends first sorts first (think of an end marker that sorts before every letter).`
        : `${long} sorts before ${short}: ${short} is a prefix of ${long}, and under the inverted rule a suffix that ends first sorts last.`,
    };
  }
  return null;
}

/** The list after moving the item at `from` one place up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(items: readonly T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= items.length) return items.slice();
  const next = items.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Every string over {a, b} of length 1 to `maxLength`, shortest first. */
export function binaryStrings(maxLength: number): string[] {
  const out: string[] = [];
  for (let len = 1; len <= maxLength; len += 1) {
    for (let bits = 0; bits < 2 ** len; bits += 1) out.push(Array.from({ length: len }, (_, i) => ((bits >> (len - 1 - i)) & 1 ? 'b' : 'a')).join(''));
  }
  return out;
}

export interface BrokenReport {
  /** Strings checked, and how many of them the inverted rule sorts wrongly. */
  checked: number;
  wrong: number;
  witness: string;
  correct: number[];
  broken: number[];
}

/** The broken mode over every binary string up to WITNESS_MAX_LENGTH: the shortest wrong one is the witness. */
export function brokenReport(maxLength = WITNESS_MAX_LENGTH): BrokenReport {
  let wrong = 0;
  let witness: string | null = null;
  const all = binaryStrings(maxLength);
  for (const s of all) {
    if (suffixArray(s).join() !== suffixArray(s, 'inverted').join()) {
      wrong += 1;
      witness ??= s;
    }
  }
  const w = witness ?? '';
  return { checked: all.length, wrong, witness: w, correct: suffixArray(w), broken: suffixArray(w, 'inverted') };
}

/** A seeded string of `n` letters from the first `alphabet` letters of a to z. */
export function randomText(seed: number, alphabet: Alphabet, n: number): string {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => String.fromCharCode(97 + randInt(0, alphabet - 1, rnd))).join('');
}

export interface CostPoint {
  n: number;
  random: Cost;
  worst: Cost;
}

/** Real sorts at each length of the sweep: a seeded random string and the worst case a^n. */
export function costSweep(seed: number, alphabet: Alphabet, lengths: readonly number[] = COST_SWEEP): CostPoint[] {
  const source = randomText(seed, alphabet, Math.max(...lengths));
  return lengths.map((n) => ({
    n,
    random: buildSuffixArray(source.slice(0, n)).cost,
    worst: buildSuffixArray('a'.repeat(n)).cost,
  }));
}
