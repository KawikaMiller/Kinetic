/**
 * The sorting lower bound and two sorts that dodge it: the decision tree for three items,
 * counting sort (keys 0-9) and LSD radix sort (keys 0-999, base 10), each recording its
 * steps so the frames and the tests can replay and count them.
 */
import { factorial, log2Factorial } from '../../core/stats';

// ── Scene 1: the decision tree for sorting a, b, c ────────────────────

export type Letter = 'a' | 'b' | 'c';
export const LETTERS: readonly Letter[] = ['a', 'b', 'c'];

/** An internal node asks "x < y?"; yes goes to the first child, no to the second. */
export interface AskNode {
  kind: 'ask';
  id: string;
  x: Letter;
  y: Letter;
  yes: string;
  no: string;
}

/** A leaf names the sorted order, smallest first. */
export interface LeafNode {
  kind: 'leaf';
  id: string;
  order: readonly [Letter, Letter, Letter];
}

export type TreeNode = AskNode | LeafNode;

const ask = (id: string, x: Letter, y: Letter, yes: string, no: string): AskNode => ({ kind: 'ask', id, x, y, yes, no });
const leaf = (order: readonly [Letter, Letter, Letter]): LeafNode => ({ kind: 'leaf', id: order.join(''), order });

/**
 * Insertion sort's decision tree on three items: compare a with b, then slot c in. Two
 * leaves sit at depth 2 (c lands last after one check), the other four at depth 3.
 */
export const DECISION_TREE: ReadonlyMap<string, TreeNode> = new Map(
  [
    ask('n0', 'a', 'b', 'n1', 'n2'),
    ask('n1', 'b', 'c', 'abc', 'n3'),
    ask('n3', 'a', 'c', 'acb', 'cab'),
    ask('n2', 'a', 'c', 'bac', 'n4'),
    ask('n4', 'b', 'c', 'bca', 'cba'),
    leaf(['a', 'b', 'c']),
    leaf(['a', 'c', 'b']),
    leaf(['c', 'a', 'b']),
    leaf(['b', 'a', 'c']),
    leaf(['b', 'c', 'a']),
    leaf(['c', 'b', 'a']),
  ].map((n) => [n.id, n]),
);
export const TREE_ROOT = 'n0';

export const nodeOf = (id: string): TreeNode => {
  const n = DECISION_TREE.get(id);
  if (!n) throw new Error(`no tree node ${id}`);
  return n;
};

export const childrenOf = (id: string): string[] => {
  const n = nodeOf(id);
  return n.kind === 'ask' ? [n.yes, n.no] : [];
};

export const leaves = (): LeafNode[] => [...DECISION_TREE.values()].filter((n): n is LeafNode => n.kind === 'leaf');

/** Levels below the root to the deepest leaf. */
export function treeHeight(id = TREE_ROOT): number {
  const kids = childrenOf(id);
  return kids.length ? 1 + Math.max(...kids.map(treeHeight)) : 0;
}

/** Follow a list of yes/no answers from the root: the nodes visited, root first. */
export function walkAnswers(answers: readonly boolean[]): string[] {
  const path = [TREE_ROOT];
  for (const yes of answers) {
    const n = nodeOf(path[path.length - 1]);
    if (n.kind === 'leaf') break;
    path.push(yes ? n.yes : n.no);
  }
  return path;
}

export type Triple = Readonly<Record<Letter, number>>;

/** The answers a real input gives on the way down: every comparison, in order. */
export function answersFor(values: Triple): boolean[] {
  const answers: boolean[] = [];
  let n = nodeOf(TREE_ROOT);
  while (n.kind === 'ask') {
    const yes = values[n.x] < values[n.y];
    answers.push(yes);
    n = nodeOf(yes ? n.yes : n.no);
  }
  return answers;
}

/** The six input orders the chips offer: each permutation of 1, 2, 3 as (a, b, c). */
export const INPUT_ORDERS: readonly Triple[] = [
  { a: 1, b: 2, c: 3 },
  { a: 1, b: 3, c: 2 },
  { a: 2, b: 1, c: 3 },
  { a: 2, b: 3, c: 1 },
  { a: 3, b: 1, c: 2 },
  { a: 3, b: 2, c: 1 },
];

/**
 * The fewest worst-case comparisons any comparison sort can manage on n items: ⌈log₂ n!⌉,
 * worked out exactly (the bit length of n! − 1), so no float rounding can nudge it.
 */
export const lowerBound = (n: number) => (n <= 1 ? 0 : (factorial(n) - 1n).toString(2).length);

/** The plot's points: log₂ n!, its ceiling (the bound) and n log₂ n for n = 1 … max. */
export function boundSeries(max: number): { n: number; log2: number; bound: number; nlogn: number }[] {
  return Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    return { n, log2: log2Factorial(n), bound: lowerBound(n), nlogn: n * Math.log2(n) };
  });
}

// ── Items with keys: what counting sort and radix sort move ───────────

export interface Item {
  /** Position in the input: identity, and the stability witness. */
  id: number;
  key: number;
  /** How many equal keys came before it in the input (0 = the first one). */
  occurrence: number;
}

export function itemsOf(keys: readonly number[]): Item[] {
  const seen = new Map<number, number>();
  return keys.map((key, id) => {
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { id, key, occurrence };
  });
}

/** Letters a, b, c… tell equal keys apart in input order. */
export const occurrenceTag = (occurrence: number) => String.fromCharCode(97 + (occurrence % 26));

export const isSorted = (items: readonly Item[]) => items.every((it, i) => i === 0 || items[i - 1].key <= it.key);

/** Equal keys keep their input order (stable), checked over the whole output. */
export const isStable = (items: readonly Item[]) =>
  items.every((it, i) => i === 0 || items[i - 1].key !== it.key || items[i - 1].id < it.id);

// ── Counting sort, keys 0 … COUNT_KEYS − 1 ────────────────────────────

export const COUNT_KEYS = 10;

export type CountStep =
  | { t: 'count'; item: Item; counts: number[] }
  | { t: 'start'; key: number; starts: number[]; counts: readonly number[] }
  | { t: 'place'; item: Item; slot: number; starts: number[]; out: (Item | null)[] };

export interface CountingRun {
  steps: CountStep[];
  out: Item[];
  counts: number[];
}

/**
 * Pass 1 counts each key. Pass 2 turns the counts into each key's first output slot (the
 * number of smaller keys). Pass 3 walks the input left to right and drops each item into
 * its key's next slot: equal keys land in input order, which is what makes it stable.
 */
export function countingSort(keys: readonly number[], k = COUNT_KEYS): CountingRun {
  const items = itemsOf(keys);
  const steps: CountStep[] = [];
  const counts = new Array<number>(k).fill(0);
  for (const item of items) {
    counts[item.key]++;
    steps.push({ t: 'count', item, counts: counts.slice() });
  }
  const starts = new Array<number>(k).fill(0);
  let total = 0;
  for (let key = 0; key < k; key++) {
    starts[key] = total;
    total += counts[key];
    steps.push({ t: 'start', key, starts: starts.slice(), counts: counts.slice() });
  }
  const out: (Item | null)[] = new Array(items.length).fill(null);
  for (const item of items) {
    const slot = starts[item.key]++;
    out[slot] = item;
    steps.push({ t: 'place', item, slot, starts: starts.slice(), out: out.slice() });
  }
  return { steps, out: out as Item[], counts };
}

// ── LSD radix sort, base 10, three digits ─────────────────────────────

export const RADIX_DIGITS = 3;
export const RADIX_BASE = 10;
export const RADIX_MAX = RADIX_BASE ** RADIX_DIGITS - 1;

/** Digit `d` of a key, 0 = ones. */
export const digitOf = (key: number, d: number) => Math.floor(key / RADIX_BASE ** d) % RADIX_BASE;

/** fifo: each bucket hands items back in the order they arrived (stable). lifo: newest first. */
export type BucketOrder = 'fifo' | 'lifo';

export type RadixStep =
  | { t: 'drop'; pass: number; item: Item; buckets: Item[][]; order: readonly Item[] }
  | { t: 'collect'; pass: number; order: Item[]; buckets: Item[][] };

export interface RadixRun {
  steps: RadixStep[];
  out: Item[];
  /** Key reads: one digit of one item per drop. */
  digitReads: number;
}

const cloneBuckets = (b: readonly Item[][]) => b.map((x) => x.slice());

export function radixSort(keys: readonly number[], order: BucketOrder = 'fifo'): RadixRun {
  let strip = itemsOf(keys);
  const steps: RadixStep[] = [];
  let digitReads = 0;
  for (let pass = 0; pass < RADIX_DIGITS; pass++) {
    const buckets: Item[][] = Array.from({ length: RADIX_BASE }, () => []);
    for (const item of strip) {
      buckets[digitOf(item.key, pass)].push(item);
      digitReads++;
      steps.push({ t: 'drop', pass, item, buckets: cloneBuckets(buckets), order: strip });
    }
    strip = buckets.flatMap((b) => (order === 'fifo' ? b : [...b].reverse()));
    steps.push({ t: 'collect', pass, order: strip, buckets: cloneBuckets(buckets) });
  }
  return { steps, out: strip, digitReads };
}

/** The key formed by the lowest `digits` digits. */
export const lowDigits = (key: number, digits: number) => key % RADIX_BASE ** digits;

/** First adjacent pair out of order by the lowest `digits` digits, or null when there is none. */
export function firstBreak(items: readonly Item[], digits: number): [Item, Item] | null {
  for (let i = 1; i < items.length; i++) {
    if (lowDigits(items[i - 1].key, digits) > lowDigits(items[i].key, digits)) return [items[i - 1], items[i]];
  }
  return null;
}

// ── Input ─────────────────────────────────────────────────────────────

export type KeysResult = { ok: true; keys: number[] } | { ok: false; error: string };

const PLAIN_INT = /^-?\d+$/;

/**
 * A learner-typed list of keys from 0 to `max`. Everything that isn't 1 to `maxItems`
 * plain whole numbers in range is refused with a sentence; the caller keeps its last list.
 */
export function parseKeys(text: string, max: number, maxItems: number): KeysResult {
  const range = `this demo sorts 0-${max}`;
  const t = text.trim();
  if (t === '') return { ok: false, error: `Type at least one number: ${range}.` };
  if (/^,|,$|,\s*,/.test(t)) return { ok: false, error: 'There’s a gap in the list: remove the extra comma.' };
  const tokens = t.split(/[\s,]+/);
  if (!tokens.every((s) => PLAIN_INT.test(s))) return { ok: false, error: `Whole numbers only, separated by commas or spaces: ${range}.` };
  if (tokens.some((s) => s.startsWith('-'))) return { ok: false, error: `No negative numbers: ${range}.` };
  if (tokens.length > maxItems) return { ok: false, error: `Up to ${maxItems} numbers fit on screen; that’s ${tokens.length}.` };
  // Compare as digit strings first, so a 23-digit number is refused rather than rounded.
  const digits = String(max).length;
  if (tokens.some((s) => { const d = s.replace(/^0+(?=\d)/, ''); return d.length > digits || Number(d) > max; })) {
    return { ok: false, error: `Keep every number in range: ${range}.` };
  }
  return { ok: true, keys: tokens.map(Number) };
}

export const COUNT_MAX_ITEMS = 12;
export const RADIX_MAX_ITEMS = 10;

export const COUNT_PRESETS = [
  { id: 'dupes', label: 'Duplicates', keys: [4, 1, 3, 4, 0, 3, 9, 1, 4] },
  { id: 'spread', label: 'One of each', keys: [7, 2, 9, 0, 5, 3, 8, 1, 6, 4] },
  { id: 'same', label: 'All the same', keys: [6, 6, 6, 6, 6] },
] as const;

export const RADIX_PRESETS = [
  { id: 'mixed', label: 'Mixed', keys: [329, 457, 657, 839, 436, 720, 355] },
  { id: 'ties', label: 'Shared digits', keys: [431, 935, 132, 731, 35, 433, 5] },
  { id: 'short', label: 'Short keys', keys: [9, 81, 7, 100, 64, 3] },
] as const;

// ── "Why not always?": costs for wider keys ───────────────────────────

/** Illustrative list length for the cost table. */
export const COST_N = 1000;
export const COST_RADIX_BITS = 8;

export interface CostRow {
  bits: number;
  /** Counting sort over every possible key: n + 2^bits steps and 2^bits counters. */
  countingWork: number;
  /** LSD radix in base 256: one pass per byte, each n + 256. */
  radixPasses: number;
  radixWork: number;
}

export function costRow(bits: number, n = COST_N): CostRow {
  const radixPasses = Math.ceil(bits / COST_RADIX_BITS);
  return { bits, countingWork: n + 2 ** bits, radixPasses, radixWork: radixPasses * (n + 2 ** COST_RADIX_BITS) };
}

export const COST_BITS = [8, 16, 32, 64] as const;

/** n log₂ n for the same n: the comparison sorts' leading term, for scale. */
export const comparisonLeading = (n = COST_N) => n * Math.log2(n);
