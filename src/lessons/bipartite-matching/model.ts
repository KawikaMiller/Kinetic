export const MAX_SIDE = 6;
export const COST_MIN = 1;
export const COST_MAX = 99;

/** Workers on the left, jobs on the right; `edges` are unique [worker, job] pairs. */
export interface Bipartite {
  workers: number;
  jobs: number;
  edges: [number, number][];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const make = (workers: number, jobs: number, lists: number[][]): Bipartite => ({
  workers,
  jobs,
  edges: lists.flatMap((js, w) => js.map((j) => [w, j] as [number, number])),
});

export type PresetId = 'greedy' | 'none' | 'balanced';

export interface Preset {
  id: PresetId;
  label: string;
  graph: Bipartite;
}

/** Job lists are 0-based: [0, 1] means J1 and J2. */
export const PRESETS: readonly Preset[] = [
  { id: 'greedy', label: 'Greedy fails', graph: make(4, 4, [[0, 1], [0], [2], [1, 3]]) },
  { id: 'none', label: 'No perfect matching', graph: make(3, 3, [[0, 1], [0, 1], [0, 1]]) },
  { id: 'balanced', label: 'Balanced 5 x 5', graph: make(5, 5, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0, 2]]) },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

export const workerName = (w: number) => `W${w + 1}`;
export const jobName = (j: number) => `J${j + 1}`;

// ---- editing (hostile input is defined here) ---------------------------------------------

export const hasEdge = (g: Bipartite, w: number, j: number): boolean => g.edges.some(([a, b]) => a === w && b === j);

/** Toggle the edge between worker `w` and job `j`. Workers and jobs are the only things an edge can join. */
export function toggleEdge(g: Bipartite, w: number, j: number): Bipartite {
  return hasEdge(g, w, j) ? { ...g, edges: g.edges.filter(([a, b]) => !(a === w && b === j)) } : { ...g, edges: [...g.edges, [w, j]] };
}

export function addWorker(g: Bipartite): Result<Bipartite> {
  return g.workers >= MAX_SIDE ? { ok: false, error: `At most ${MAX_SIDE} workers.` } : { ok: true, value: { ...g, workers: g.workers + 1 } };
}

export function addJob(g: Bipartite): Result<Bipartite> {
  return g.jobs >= MAX_SIDE ? { ok: false, error: `At most ${MAX_SIDE} jobs.` } : { ok: true, value: { ...g, jobs: g.jobs + 1 } };
}

export function removeWorker(g: Bipartite): Result<Bipartite> {
  if (g.workers <= 1) return { ok: false, error: 'Keep at least one worker.' };
  return { ok: true, value: { ...g, workers: g.workers - 1, edges: g.edges.filter(([w]) => w < g.workers - 1) } };
}

export function removeJob(g: Bipartite): Result<Bipartite> {
  if (g.jobs <= 1) return { ok: false, error: 'Keep at least one job.' };
  return { ok: true, value: { ...g, jobs: g.jobs - 1, edges: g.edges.filter(([, j]) => j < g.jobs - 1) } };
}

// ---- matchings -----------------------------------------------------------------------------

/** A matching as the job each worker holds, or -1. */
export type Matching = number[];

export const emptyMatching = (g: Bipartite): Matching => Array<number>(g.workers).fill(-1);

export const matchingSize = (m: Matching): number => m.filter((j) => j >= 0).length;

/** The worker holding job j, or -1. */
export const holderOf = (m: Matching, j: number): number => m.indexOf(j);

export const neighbours = (g: Bipartite, w: number): number[] => g.edges.filter(([a]) => a === w).map(([, j]) => j).sort((a, b) => a - b);

/** A legal matching: every matched pair is an edge and no job is held twice. */
export function isMatching(g: Bipartite, m: Matching): boolean {
  const used = new Set<number>();
  return m.every((j, w) => j < 0 || (hasEdge(g, w, j) && !used.has(j) && !!used.add(j)));
}

/** Greedy: each worker in order takes the first free job it likes, or stays unmatched. */
export function greedy(g: Bipartite): Matching {
  const m = emptyMatching(g);
  const taken = new Set<number>();
  for (let w = 0; w < g.workers; w++) {
    const j = neighbours(g, w).find((x) => !taken.has(x));
    if (j !== undefined) {
      m[w] = j;
      taken.add(j);
    }
  }
  return m;
}

/** One step of an alternating path. */
export interface PathStep {
  worker: number;
  job: number;
}

export interface Search {
  start: number;
  /** The augmenting path as worker-job pairs: each worker goes to a job, which is held by the next worker (the last job is free). Null when none exists. */
  path: PathStep[] | null;
  /** Workers and jobs the search reached (all of them when it fails). */
  workers: number[];
  jobs: number[];
}

/** Depth-first search for an alternating path from a free worker to a free job, trying jobs in ascending order (Kuhn's algorithm). */
export function findAugmenting(g: Bipartite, m: Matching, start: number): Search {
  const seenJobs = new Set<number>();
  const seenWorkers = new Set<number>([start]);
  const walk = (w: number): PathStep[] | null => {
    for (const j of neighbours(g, w)) {
      if (seenJobs.has(j)) continue;
      seenJobs.add(j);
      const holder = holderOf(m, j);
      if (holder < 0) return [{ worker: w, job: j }];
      seenWorkers.add(holder);
      const rest = walk(holder);
      if (rest) return [{ worker: w, job: j }, ...rest];
    }
    return null;
  };
  const path = walk(start);
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { start, path, workers: sorted(seenWorkers), jobs: sorted(seenJobs) };
}

/** Flip the path: each worker on it takes the job it points at, so the matching grows by one. */
export function flip(m: Matching, path: readonly PathStep[]): Matching {
  const next = [...m];
  for (const { worker, job } of path) next[worker] = job;
  return next;
}

/** Kuhn's algorithm from every worker in turn: a maximum matching. */
export function maximumMatching(g: Bipartite, start: Matching = emptyMatching(g)): Matching {
  let m = start;
  for (let w = 0; w < g.workers; w++) {
    if (m[w] >= 0) continue;
    const s = findAugmenting(g, m, w);
    if (s.path) m = flip(m, s.path);
  }
  return m;
}

// ---- Hall violators and Konig's cover ------------------------------------------------------

export interface HallViolator {
  workers: number[];
  /** Every job any of those workers likes. */
  neighbourhood: number[];
}

/** A set of workers with fewer neighbouring jobs than members, from the failed search of the first worker a maximum matching leaves out; null when every worker is matched. */
export function hallViolator(g: Bipartite): HallViolator | null {
  const m = maximumMatching(g);
  const free = m.findIndex((j) => j < 0);
  if (free < 0) return null;
  const search = findAugmenting(g, m, free);
  const nb = new Set(g.edges.filter(([w]) => search.workers.includes(w)).map(([, j]) => j));
  return { workers: search.workers, neighbourhood: [...nb].sort((a, b) => a - b) };
}

export interface Cover {
  workers: number[];
  jobs: number[];
}

/** Konig's construction: from the free workers go along non-matching edges to jobs and back along matching edges; cover = unreached workers + reached jobs. */
export function minimumVertexCover(g: Bipartite, m: Matching): Cover {
  const reachedWorkers = new Set<number>(m.flatMap((j, w) => (j < 0 ? [w] : [])));
  const reachedJobs = new Set<number>();
  const queue = [...reachedWorkers];
  while (queue.length) {
    const w = queue.shift()!;
    for (const j of neighbours(g, w)) {
      if (m[w] === j || reachedJobs.has(j)) continue;
      reachedJobs.add(j);
      const holder = holderOf(m, j);
      if (holder >= 0 && !reachedWorkers.has(holder)) {
        reachedWorkers.add(holder);
        queue.push(holder);
      }
    }
  }
  return {
    workers: Array.from({ length: g.workers }, (_, w) => w).filter((w) => !reachedWorkers.has(w)),
    jobs: [...reachedJobs].sort((a, b) => a - b),
  };
}

// ---- costs: greedy per row and the Hungarian method ----------------------------------------

export type CostMatrix = number[][];

export const DEFAULT_COSTS: CostMatrix = [[9, 2, 7, 8], [6, 4, 3, 7], [5, 8, 1, 8], [7, 6, 9, 4]];

/** Each worker in row order takes the cheapest job still free. */
export function greedyAssignment(c: CostMatrix): number[] {
  const taken = new Set<number>();
  return c.map((row) => {
    let best = -1;
    row.forEach((x, j) => {
      if (!taken.has(j) && (best < 0 || x < row[best])) best = j;
    });
    taken.add(best);
    return best;
  });
}

export const assignmentCost = (c: CostMatrix, a: readonly number[]): number => a.reduce((s, j, w) => s + c[w][j], 0);

/** The Hungarian method in O(n^3) with potentials (an n x n matrix); returns the job for each worker. */
export function hungarian(c: CostMatrix): number[] {
  const n = c.length;
  const u = Array<number>(n + 1).fill(0);
  const v = Array<number>(n + 1).fill(0);
  const p = Array<number>(n + 1).fill(0);
  const way = Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array<number>(n + 1).fill(Infinity);
    const used = Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const assign = Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) assign[p[j] - 1] = j - 1;
  return assign;
}

export function setCost(c: CostMatrix, r: number, col: number, value: number): CostMatrix {
  return c.map((row, i) => (i === r ? row.map((x, j) => (j === col ? Math.min(COST_MAX, Math.max(COST_MIN, value)) : x)) : row));
}
