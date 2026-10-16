// The four DP families of the lesson as pure functions, each with its wrong-state variant, so the lesson can run the
// wrong choice and show where it breaks. Brute-force references live in the tests, not here, except the few the
// lesson itself displays (the optimum next to a wrong answer).

export interface Item {
  w: number;
  v: number;
}

export type LoopDirection = 'down' | 'up';

/** Bits needed to write x in binary (0 for 0). */
export const bitLength = (x: number): number => (x <= 0 ? 0 : Math.floor(Math.log2(x)) + 1);

// ── 0/1 knapsack ───────────────────────────────────────────────────────────

/** dp[i][w] for the first i items and capacity w (the two-dimensional table: row i reads only row i - 1). */
export function knapsackTable(items: readonly Item[], cap: number): number[][] {
  const t: number[][] = [Array.from({ length: cap + 1 }, () => 0)];
  for (let i = 1; i <= items.length; i++) {
    const { w: wi, v: vi } = items[i - 1];
    t.push(t[i - 1].map((skip, w) => (w >= wi ? Math.max(skip, t[i - 1][w - wi] + vi) : skip)));
  }
  return t;
}

/**
 * The one-dimensional array dp[w] after each item (row i of the result is the array after item i), updated in place in
 * the given loop direction. Downward reads only values from before the item; upward reads the cell it just wrote, so
 * the item can be taken again.
 */
export function knapsackRolling(items: readonly Item[], cap: number, dir: LoopDirection): number[][] {
  const dp = Array.from({ length: cap + 1 }, () => 0);
  const rows = [dp.slice()];
  for (const { w: wi, v: vi } of items) {
    const order = Array.from({ length: cap + 1 }, (_, k) => (dir === 'down' ? cap - k : k));
    for (const w of order) if (w >= wi) dp[w] = Math.max(dp[w], dp[w - wi] + vi);
    rows.push(dp.slice());
  }
  return rows;
}

/** The weights and values used to reconstruct: for an upward table an item can be counted more than once. */
export function knapsackChosen(items: readonly Item[], cap: number, rows: readonly (readonly number[])[], dir: LoopDirection): number[] {
  const counts = items.map(() => 0);
  let i = items.length;
  let w = cap;
  while (i > 0) {
    if (rows[i][w] === rows[i - 1][w]) {
      i--;
    } else {
      counts[i - 1]++;
      w -= items[i - 1].w;
      if (dir === 'down') i--;
    }
  }
  return counts;
}

/** The cells the reconstruction walks through, from the answer cell back to row 0, as [row, column]. */
export function knapsackPath(items: readonly Item[], cap: number, rows: readonly (readonly number[])[], dir: LoopDirection): [number, number][] {
  const path: [number, number][] = [];
  let i = items.length;
  let w = cap;
  path.push([i, w]);
  while (i > 0) {
    if (rows[i][w] === rows[i - 1][w]) {
      i--;
    } else {
      w -= items[i - 1].w;
      if (dir === 'down') i--;
    }
    path.push([i, w]);
  }
  return path;
}

/** Greedy by value per unit weight: take each item in that order if it still fits. */
export function greedyByRatio(items: readonly Item[], cap: number): { value: number; chosen: number[] } {
  const order = items.map((_, i) => i).sort((a, b) => items[b].v * items[a].w - items[a].v * items[b].w || a - b);
  let room = cap;
  let value = 0;
  const chosen: number[] = [];
  for (const i of order) {
    if (items[i].w <= room) {
      room -= items[i].w;
      value += items[i].v;
      chosen.push(i);
    }
  }
  return { value, chosen: chosen.sort((a, b) => a - b) };
}

/**
 * The wrong state dp[i]: one number per prefix, plus the weight of the single set that earned it. Each item is added on
 * top of that one set whenever it fits, because dp[i] has no way to say what else could have been chosen.
 */
export function knapsackPrefixOnly(items: readonly Item[], cap: number): { value: number; weight: number }[] {
  const out = [{ value: 0, weight: 0 }];
  for (const { w, v } of items) {
    const prev = out[out.length - 1];
    out.push(prev.weight + w <= cap ? { value: prev.value + v, weight: prev.weight + w } : prev);
  }
  return out;
}

/** The optimum from the table, to put the true answer beside a wrong one. */
export function knapsackOptimum(items: readonly Item[], cap: number): number {
  return knapsackTable(items, cap)[items.length][cap];
}

// ── longest increasing subsequence ─────────────────────────────────────────

export interface LisRun {
  dp: number[];
  prev: number[];
  length: number;
  /** The index where a longest subsequence ends. */
  end: number;
  /** Pairs compared by the quadratic version. */
  comparisons: number;
}

/** dp[i] = length of the longest increasing subsequence ending exactly at element i. */
export function lisEndingAt(a: readonly number[]): LisRun {
  const dp: number[] = [];
  const prev: number[] = [];
  let comparisons = 0;
  for (let i = 0; i < a.length; i++) {
    dp.push(1);
    prev.push(-1);
    for (let j = 0; j < i; j++) {
      comparisons++;
      if (a[j] < a[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;
        prev[i] = j;
      }
    }
  }
  const end = dp.reduce((best, d, i) => (d > dp[best] ? i : best), 0);
  return { dp, prev, length: a.length ? dp[end] : 0, end, comparisons };
}

/** dp[i] = length of the longest increasing subsequence starting exactly at element i, filled right to left. */
export function lisStartingAt(a: readonly number[]): { dp: number[]; next: number[]; length: number; start: number } {
  const dp = a.map(() => 1);
  const next = a.map(() => -1);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j > i; j--) {
      if (a[j] > a[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;
        next[i] = j;
      }
    }
  }
  const start = dp.reduce((best, d, i) => (d > dp[best] ? i : best), 0);
  return { dp, next, length: a.length ? dp[start] : 0, start };
}

/** The elements of a longest subsequence, rebuilt by following `prev` from where it ends. */
export function lisReconstruct(run: LisRun): number[] {
  const out: number[] = [];
  for (let i = run.end; i !== -1 && run.dp.length > 0; i = run.prev[i]) out.unshift(i);
  return out;
}

export interface TailsStep {
  /** The element just processed. */
  i: number;
  /** The tails array after it. */
  tails: number[];
  /** Where it landed (the binary-search result). */
  at: number;
  /** True when it replaced a value, false when it extended the array. */
  replaced: boolean;
  /** Binary-search probes spent on this element. */
  probes: number;
}

/** The O(n log n) tails array: tails[k] is the smallest last value of any increasing subsequence of length k + 1. */
export function lisTails(a: readonly number[]): { steps: TailsStep[]; length: number; probes: number } {
  const tails: number[] = [];
  const steps: TailsStep[] = [];
  let total = 0;
  a.forEach((x, i) => {
    let lo = 0;
    let hi = tails.length;
    let probes = 0;
    while (lo < hi) {
      probes++;
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const replaced = lo < tails.length;
    tails[lo] = x;
    total += probes;
    steps.push({ i, tails: tails.slice(), at: lo, replaced, probes });
  });
  return { steps, length: tails.length, probes: total };
}

/** True when `candidate` appears inside `a` in order (not necessarily adjacent). */
export function isSubsequence(candidate: readonly number[], a: readonly number[]): boolean {
  let k = 0;
  for (const x of a) if (k < candidate.length && x === candidate[k]) k++;
  return k === candidate.length;
}

/**
 * The wrong state "best length within the first i elements": it keeps the length and the last value of one best
 * subsequence and extends it only when the next element is larger, because the state cannot say which other
 * subsequence might end lower.
 */
export function lisPrefixOnly(a: readonly number[]): { len: number; last: number | null }[] {
  const out: { len: number; last: number | null }[] = [{ len: 0, last: null }];
  for (const x of a) {
    const p = out[out.length - 1];
    out.push(p.last === null || x > p.last ? { len: p.len + 1, last: x } : p);
  }
  return out;
}

// ── matrix-chain multiplication ────────────────────────────────────────────

/** One filled cell: the interval, every split tried with its cost, and the winning split. */
export interface ChainStep {
  i: number;
  j: number;
  candidates: { k: number; cost: number }[];
  best: number;
  value: number;
  /** How many of the two sub-intervals it read were still unfilled (always 0 in the right order). */
  unfilledReads: number;
}

export type ChainOrder = 'length' | 'row';

export interface ChainRun {
  /** cost[i][j] for 1 <= i <= j <= n (index 0 unused). */
  cost: number[][];
  split: number[][];
  steps: ChainStep[];
  answer: number;
  unfilledReads: number;
}

/**
 * Matrix-chain cost for matrices A1..An with A_k of size dims[k-1] x dims[k]. `order` is the fill order: 'length'
 * (every shorter interval first) is the one that respects the dependencies; 'row' (i ascending, j ascending) reads
 * cells it has not filled yet, and treats them as 0.
 */
export function chainTable(dims: readonly number[], order: ChainOrder = 'length'): ChainRun {
  const n = dims.length - 1;
  const cost = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => 0));
  const split = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => 0));
  const filled = Array.from({ length: n + 2 }, () => Array.from({ length: n + 2 }, () => false));
  for (let i = 1; i <= n; i++) filled[i][i] = true;
  const cells: [number, number][] = [];
  if (order === 'length') {
    for (let len = 2; len <= n; len++) for (let i = 1; i + len - 1 <= n; i++) cells.push([i, i + len - 1]);
  } else {
    for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) cells.push([i, j]);
  }
  const steps: ChainStep[] = [];
  let unfilledReads = 0;
  for (const [i, j] of cells) {
    const candidates: { k: number; cost: number }[] = [];
    let unfilled = 0;
    for (let k = i; k < j; k++) {
      if (!filled[i][k]) unfilled++;
      if (!filled[k + 1][j]) unfilled++;
      candidates.push({ k, cost: cost[i][k] + cost[k + 1][j] + dims[i - 1] * dims[k] * dims[j] });
    }
    const best = candidates.reduce((b, c) => (c.cost < b.cost ? c : b)).k;
    cost[i][j] = candidates.find((c) => c.k === best)!.cost;
    split[i][j] = best;
    filled[i][j] = true;
    unfilledReads += unfilled;
    steps.push({ i, j, candidates, best, value: cost[i][j], unfilledReads: unfilled });
  }
  return { cost, split, steps, answer: n >= 1 ? cost[1][n] : 0, unfilledReads };
}

/** The parenthesisation of A_i..A_j implied by the split table, like ((A1 A2) A3). */
export function chainParenthesis(split: readonly (readonly number[])[], i: number, j: number): string {
  if (i === j) return `A${i}`;
  const k = split[i][j];
  return `(${chainParenthesis(split, i, k)} ${chainParenthesis(split, k + 1, j)})`;
}

/** The intervals the optimal parenthesisation is made of, outermost first (the cells the reconstruction visits). */
export function chainIntervals(split: readonly (readonly number[])[], i: number, j: number): [number, number][] {
  if (i === j) return [[i, i]];
  const k = split[i][j];
  return [[i, j], ...chainIntervals(split, i, k), ...chainIntervals(split, k + 1, j)];
}

/** The wrong state dp[i] over prefixes: the last product always joins the prefix with one more matrix, left to right. */
export function chainPrefixOnly(dims: readonly number[]): number[] {
  const out = [0, 0];
  for (let i = 2; i < dims.length; i++) out.push(out[i - 1] + dims[0] * dims[i - 1] * dims[i]);
  return out;
}

/** Cells of the interval table (i <= j) and of a table that also carries the split k (i <= k < j): n(n+1)/2 against a cubic count. */
export function chainStateCounts(n: number): { interval: number; withSplit: number } {
  let interval = 0;
  let withSplit = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= n; j++) {
      interval++;
      withSplit += j - i;
    }
  }
  return { interval, withSplit };
}

// ── bitmask TSP ────────────────────────────────────────────────────────────

export type Matrix = number[][];

export const START_CITY = 0;

/** Every subset of cities 1..n-1 as a bitmask over bits 0..n-2 (bit b is city b + 1), grouped by size. */
export function masksBySize(n: number): number[][] {
  const groups: number[][] = Array.from({ length: n }, () => []);
  for (let mask = 1; mask < 1 << (n - 1); mask++) groups[popcount(mask)].push(mask);
  return groups;
}

export const popcount = (m: number): number => {
  let c = 0;
  for (let x = m; x; x &= x - 1) c++;
  return c;
};

/** Cities (1-based over the non-start cities) in a mask, ascending. */
export const citiesOf = (mask: number): number[] => {
  const out: number[] = [];
  for (let b = 0; mask >> b; b++) if ((mask >> b) & 1) out.push(b + 1);
  return out;
};

export interface TspState {
  mask: number;
  last: number;
  value: number;
  /** Predecessors tried: previous city and the cost through it (empty for the one-city base states). */
  candidates: { from: number; cost: number }[];
  from: number;
}

export interface TspRun {
  n: number;
  /** Every state in fill order (size ascending, mask ascending, last ascending), base states first. */
  states: TspState[];
  table: Map<number, TspState>;
  best: number;
  /** The tour as a city sequence starting and ending at the start city. */
  tour: number[];
  /** The last city before returning home. */
  closing: number;
  transitions: number;
}

const key = (mask: number, last: number) => mask * 16 + last;

/** dp[mask][last]: the cheapest path from the start city through exactly the cities in mask, ending at last. */
export function tspBitmask(dist: Matrix): TspRun {
  const n = dist.length;
  const states: TspState[] = [];
  const table = new Map<number, TspState>();
  let transitions = 0;
  const groups = masksBySize(n);
  for (let size = 1; size < n; size++) {
    for (const mask of groups[size]) {
      for (const last of citiesOf(mask)) {
        let state: TspState;
        if (size === 1) {
          state = { mask, last, value: dist[START_CITY][last], candidates: [], from: START_CITY };
        } else {
          const rest = mask & ~(1 << (last - 1));
          const candidates = citiesOf(rest).map((from) => ({ from, cost: table.get(key(rest, from))!.value + dist[from][last] }));
          transitions += candidates.length;
          const win = candidates.reduce((b, c) => (c.cost < b.cost ? c : b));
          state = { mask, last, value: win.cost, candidates, from: win.from };
        }
        table.set(key(mask, last), state);
        states.push(state);
      }
    }
  }
  const full = (1 << (n - 1)) - 1;
  const closing = citiesOf(full).reduce((b, c) => (table.get(key(full, c))!.value + dist[c][START_CITY] < table.get(key(full, b))!.value + dist[b][START_CITY] ? c : b));
  const best = table.get(key(full, closing))!.value + dist[closing][START_CITY];
  const tour = [START_CITY];
  const reverse: number[] = [];
  for (let mask = full, last = closing; mask; ) {
    reverse.push(last);
    const s = table.get(key(mask, last))!;
    mask &= ~(1 << (last - 1));
    last = s.from;
  }
  tour.push(...reverse.reverse(), START_CITY);
  return { n, states, table, best, tour, closing, transitions };
}

/** The tour's length by adding its edges, for checking a reconstruction against the table. */
export const tourLength = (dist: Matrix, tour: readonly number[]): number => tour.slice(1).reduce((sum, c, i) => sum + dist[tour[i]][c], 0);

/**
 * The wrong state dp[mask]: the cheapest path found for each set of cities, with only the city it ends at remembered.
 * A set's path is extended from the single best path of the smaller set, which may be standing in the wrong place.
 */
export function tspMaskOnly(dist: Matrix): { best: number; table: Map<number, { cost: number; end: number }> } {
  const n = dist.length;
  const table = new Map<number, { cost: number; end: number }>();
  const groups = masksBySize(n);
  for (let size = 1; size < n; size++) {
    for (const mask of groups[size]) {
      if (size === 1) {
        const c = citiesOf(mask)[0];
        table.set(mask, { cost: dist[START_CITY][c], end: c });
        continue;
      }
      let win: { cost: number; end: number } | null = null;
      for (const c of citiesOf(mask)) {
        const p = table.get(mask & ~(1 << (c - 1)))!;
        const cost = p.cost + dist[p.end][c];
        if (win === null || cost < win.cost) win = { cost, end: c };
      }
      table.set(mask, win!);
    }
  }
  const full = (1 << (n - 1)) - 1;
  const f = table.get(full)!;
  return { best: f.cost + dist[f.end][START_CITY], table };
}

/**
 * The wrong state dp[last]: the cheapest walk of k edges from the start city ending at each city, with no memory of
 * which cities were visited, so the walk may revisit cities. The answer is the cheapest closed walk of n edges.
 */
export function tspLastOnly(dist: Matrix): { best: number; rows: number[][] } {
  const n = dist.length;
  const rows: number[][] = [dist.map((_, c) => (c === START_CITY ? 0 : Infinity))];
  for (let k = 1; k <= n; k++) {
    rows.push(dist.map((_, c) => Math.min(...rows[k - 1].map((cost, from) => (from === c ? Infinity : cost + dist[from][c])))));
  }
  return { best: rows[n][START_CITY], rows };
}

/** A seeded symmetric distance matrix with integer distances in [MIN_DIST, MAX_DIST]. */
export const MIN_DIST = 1;
export const MAX_DIST = 99;
export function seededDistances(n: number, rnd: () => number): Matrix {
  const d: Matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      d[a][b] = d[b][a] = MIN_DIST + Math.floor(rnd() * (MAX_DIST - MIN_DIST + 1));
    }
  }
  return d;
}

/** The count of tours a brute force checks once the start city is fixed. */
export const tourCount = (n: number): number => {
  let f = 1;
  for (let k = 2; k < n; k++) f *= k;
  return f;
};

/** Table size n * 2^n (the lesson's nominal state count) and the transition bound n^2 * 2^n. */
export const nominalStates = (n: number): number => n * 2 ** n;
export const transitionBound = (n: number): number => n * n * 2 ** n;

/** States the bitmask table really holds: (n-1) cities, a non-empty set of them, one of its cities last, so (n-1) 2^(n-2). */
export const tableStates = (n: number): number => (n - 1) * 2 ** (n - 2);

/** Transitions the table really evaluates: a state of size k >= 2 reads k - 1 predecessors, which sums to (n-1)(n-2) 2^(n-3). */
export const countedTransitions = (n: number): number => (n - 1) * (n - 2) * 2 ** (n - 3);

/** The smallest n at which the counted transitions drop below the tour count, or null. */
export function countedBreakEven(maxN: number): number | null {
  for (let n = 4; n <= maxN; n++) if (countedTransitions(n) < tourCount(n)) return n;
  return null;
}

/** The smallest n at which the transition bound drops below the tour count (the break-even the plot shows), or null. */
export function breakEven(maxN: number): number | null {
  for (let n = 3; n <= maxN; n++) if (transitionBound(n) < tourCount(n)) return n;
  return null;
}
