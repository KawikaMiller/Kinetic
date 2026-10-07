// Pure logic for shuffle-reservoir: Fisher-Yates, the naive "swap with anyone" shuffle and a
// random-comparator sort, exhaustive path enumeration, seeded position × value counts, and
// reservoir sampling (Algorithm R) with its exact inclusion counts.
import { mulberry32, randInt, type Rnd } from '../../core/random';

export type Algo = 'fisher-yates' | 'naive' | 'comparator';

/** One swap: position i with position j. */
export interface Swap {
  i: number;
  j: number;
}

/** The range j is drawn from at step i, inclusive. Fisher-Yates: [i, n − 1] for i < n − 1. Naive: [0, n − 1] for every i. */
export function choiceRange(algo: 'fisher-yates' | 'naive', n: number, i: number): [number, number] {
  return algo === 'fisher-yates' ? [i, n - 1] : [0, n - 1];
}

/** Steps each algorithm takes: Fisher-Yates stops before the last position (it has one choice), naive visits all n. */
export const stepCount = (algo: 'fisher-yates' | 'naive', n: number) => (algo === 'fisher-yates' ? n - 1 : n);

export const identity = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Apply a list of swaps to 1..n. */
export function applySwaps(n: number, swaps: readonly Swap[]): number[] {
  const a = identity(n);
  for (const { i, j } of swaps) [a[i], a[j]] = [a[j], a[i]];
  return a;
}

/** One seeded run's swaps. */
export function drawSwaps(algo: 'fisher-yates' | 'naive', n: number, rnd: Rnd): Swap[] {
  return Array.from({ length: stepCount(algo, n) }, (_, i) => {
    const [lo, hi] = choiceRange(algo, n, i);
    return { i, j: randInt(lo, hi, rnd) };
  });
}

/** `arr.sort(() => rnd() − 0.5)`, run by this JavaScript engine's own sort. */
export const comparatorShuffle = (n: number, rnd: Rnd) => identity(n).sort(() => rnd() - 0.5);

/** One shuffle of 1..n by any of the three algorithms. */
export function shuffleOnce(algo: Algo, n: number, rnd: Rnd): number[] {
  return algo === 'comparator' ? comparatorShuffle(n, rnd) : applySwaps(n, drawSwaps(algo, n, rnd));
}

export interface Path {
  choices: number[];
  result: number[];
}

/** Every equally likely sequence of choices, with the arrangement it produces: nⁿ naive paths, n! Fisher-Yates paths. */
export function enumeratePaths(algo: 'fisher-yates' | 'naive', n: number): Path[] {
  const out: Path[] = [];
  const steps = stepCount(algo, n);
  const walk = (i: number, choices: number[]) => {
    if (i === steps) {
      out.push({ choices: [...choices], result: applySwaps(n, choices.map((j, k) => ({ i: k, j }))) });
      return;
    }
    const [lo, hi] = choiceRange(algo, n, i);
    for (let j = lo; j <= hi; j++) walk(i + 1, [...choices, j]);
  };
  walk(0, []);
  return out;
}

export const permKey = (p: readonly number[]) => p.join('');

/** How many paths land on each arrangement. */
export function pathCounts(paths: readonly Path[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of paths) m.set(permKey(p.result), (m.get(permKey(p.result)) ?? 0) + 1);
  return m;
}

/** All n! arrangements of 1..n in lexicographic order. */
export function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, k) => [...p.slice(0, k), n, ...p.slice(k)]))
    .sort((a, b) => permKey(a).localeCompare(permKey(b)));
}



/** counts[value − 1][position]: how often each value ended at each position over `runs` seeded shuffles. */
export function heat(algo: Algo, n: number, runs: number, seed: number): number[][] {
  const counts = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rnd = mulberry32(seed);
  for (let r = 0; r < runs; r++) shuffleOnce(algo, n, rnd).forEach((v, pos) => counts[v - 1][pos]++);
  return counts;
}

/** One standard error of a cell's count when every position is equally likely (binomial, p = 1/n). */
export const cellSE = (n: number, runs: number) => Math.sqrt((runs * (1 / n) * (1 - 1 / n)));

/** Cells further than `z` standard errors from runs/n. */
export function flagged(counts: readonly (readonly number[])[], runs: number, z = 3): { r: number; c: number }[] {
  const n = counts.length;
  const expected = runs / n;
  const se = cellSE(n, runs);
  const out: { r: number; c: number }[] = [];
  counts.forEach((row, r) => row.forEach((v, c) => {
    if (Math.abs(v - expected) > z * se) out.push({ r, c });
  }));
  return out;
}

// ── Reservoir sampling (Algorithm R) ─────────────────────────────────

export interface ReservoirStep {
  /** 1-based item number. */
  item: number;
  /** For item > k: the uniform draw in 1..item; the item is kept when it's ≤ k. */
  draw: number | null;
  /** 0-based slot it went into, or null when skipped. */
  slot: number | null;
  /** The item it pushed out, if any. */
  evicted: number | null;
  /** Reservoir contents after this step. */
  reservoir: number[];
}

/** Choices are given explicitly (draw for each item k+1..n), so runs can be both seeded and enumerated. */
export function reservoirRun(n: number, k: number, draws: readonly number[]): ReservoirStep[] {
  const res: number[] = [];
  const steps: ReservoirStep[] = [];
  for (let item = 1; item <= n; item++) {
    if (item <= k) {
      res.push(item);
      steps.push({ item, draw: null, slot: item - 1, evicted: null, reservoir: [...res] });
      continue;
    }
    const draw = draws[item - k - 1];
    if (draw <= k) {
      const evicted = res[draw - 1];
      res[draw - 1] = item;
      steps.push({ item, draw, slot: draw - 1, evicted, reservoir: [...res] });
    } else {
      steps.push({ item, draw, slot: null, evicted: null, reservoir: [...res] });
    }
  }
  return steps;
}

/** Seeded draws for one run: for item i > k, a uniform integer in 1..i. */
export const reservoirDraws = (n: number, k: number, rnd: Rnd) => Array.from({ length: n - k }, (_, t) => randInt(1, k + t + 1, rnd));

/** How many of `runs` seeded runs kept each item (index = item − 1). */
export function inclusionCounts(n: number, k: number, runs: number, seed: number): number[] {
  const counts = new Array<number>(n).fill(0);
  const rnd = mulberry32(seed);
  for (let r = 0; r < runs; r++) {
    const steps = reservoirRun(n, k, reservoirDraws(n, k, rnd));
    for (const v of steps[steps.length - 1].reservoir) counts[v - 1]++;
  }
  return counts;
}

/** Exact: over all n!/k! equally likely draw sequences, how many keep each item. */
export function exactInclusion(n: number, k: number): { counts: number[]; paths: number } {
  const counts = new Array<number>(n).fill(0);
  let paths = 0;
  const walk = (draws: number[]) => {
    if (draws.length === n - k) {
      paths++;
      const steps = reservoirRun(n, k, draws);
      for (const v of steps[steps.length - 1].reservoir) counts[v - 1]++;
      return;
    }
    const i = k + draws.length + 1;
    for (let d = 1; d <= i; d++) walk([...draws, d]);
  };
  walk([]);
  return { counts, paths };
}
