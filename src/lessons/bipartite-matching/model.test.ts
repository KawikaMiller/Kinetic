import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  COST_MAX, COST_MIN, DEFAULT_COSTS, MAX_SIDE, PRESETS, addJob, addWorker, assignmentCost, emptyMatching, findAugmenting, flip, greedy, greedyAssignment, hallViolator, hasEdge, hungarian,
  isMatching, matchingSize, maximumMatching, minimumVertexCover, neighbours, presetById, removeJob, removeWorker, setCost, toggleEdge, type Bipartite, type CostMatrix,
} from './model';

/** A seeded random bipartite graph, up to 6 x 6, with at most `maxEdges` edges so brute force over edge subsets stays cheap. */
function randomGraph(rnd: () => number, maxEdges = 12): Bipartite {
  const workers = randInt(1, 6, rnd);
  const jobs = randInt(1, 6, rnd);
  const all: [number, number][] = [];
  for (let w = 0; w < workers; w++) for (let j = 0; j < jobs; j++) all.push([w, j]);
  const edges = all.filter(() => rnd() < 0.35).slice(0, maxEdges);
  return { workers, jobs, edges };
}

/** The largest matching, by trying every subset of edges. */
function bruteMaxMatching(g: Bipartite): number {
  let best = 0;
  for (let mask = 0; mask < 1 << g.edges.length; mask++) {
    const chosen = g.edges.filter((_, i) => mask & (1 << i));
    if (chosen.length <= best) continue;
    if (new Set(chosen.map(([w]) => w)).size === chosen.length && new Set(chosen.map(([, j]) => j)).size === chosen.length) best = chosen.length;
  }
  return best;
}

/** Edmonds-Karp on the unit network s -> workers -> jobs -> t: independent of the lesson's Kuhn code. */
function unitNetworkFlow(g: Bipartite): number {
  const n = g.workers + g.jobs + 2;
  const s = n - 2;
  const t = n - 1;
  const cap = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let w = 0; w < g.workers; w++) cap[s][w] = 1;
  for (let j = 0; j < g.jobs; j++) cap[g.workers + j][t] = 1;
  for (const [w, j] of g.edges) cap[w][g.workers + j] = 1;
  let flow = 0;
  for (;;) {
    const prev = Array<number>(n).fill(-1);
    prev[s] = s;
    const queue = [s];
    while (queue.length && prev[t] < 0) {
      const u = queue.shift()!;
      for (let v = 0; v < n; v++) if (prev[v] < 0 && cap[u][v] > 0) { prev[v] = u; queue.push(v); }
    }
    if (prev[t] < 0) return flow;
    for (let v = t; v !== s; v = prev[v]) {
      cap[prev[v]][v]--;
      cap[v][prev[v]]++;
    }
    flow++;
  }
}

const graphs = (count = 2000): Bipartite[] => {
  const rnd = mulberry32(17);
  return Array.from({ length: count }, () => randomGraph(rnd));
};

describe('matching size against brute force and an independent flow', () => {
  it('Kuhn equals the best subset of edges and the unit-network max flow on 2,000 seeded graphs', () => {
    let positive = 0;
    for (const g of graphs()) {
      const m = maximumMatching(g);
      expect(isMatching(g, m)).toBe(true);
      expect(matchingSize(m)).toBe(bruteMaxMatching(g));
      expect(matchingSize(m)).toBe(unitNetworkFlow(g));
      if (matchingSize(m) > 0) positive++;
    }
    expect(positive).toBeGreaterThan(1200);
  });

  it('greedy gives a legal matching that is never larger than the maximum, and is strictly smaller on some graphs', () => {
    let stuck = 0;
    for (const g of graphs()) {
      const gm = greedy(g);
      expect(isMatching(g, gm)).toBe(true);
      expect(matchingSize(gm)).toBeLessThanOrEqual(matchingSize(maximumMatching(g)));
      if (matchingSize(gm) < matchingSize(maximumMatching(g))) stuck++;
    }
    expect(stuck).toBeGreaterThan(30);
  });

  it('an augmenting path found from a free worker is alternating, ends at a free job, and flipping it grows the matching by one', () => {
    let paths = 0;
    for (const g of graphs(600)) {
      let m = greedy(g);
      for (let w = 0; w < g.workers; w++) {
        if (m[w] >= 0) continue;
        const s = findAugmenting(g, m, w);
        if (!s.path) continue;
        paths++;
        // Alternating: every pair is an edge; every job but the last is held by the next worker.
        s.path.forEach((step, i) => {
          expect(hasEdge(g, step.worker, step.job)).toBe(true);
          if (i + 1 < s.path!.length) expect(m[s.path![i + 1].worker]).toBe(step.job);
        });
        expect(m.includes(s.path[s.path.length - 1].job)).toBe(false);
        expect(s.path[0].worker).toBe(w);
        const next = flip(m, s.path);
        expect(isMatching(g, next)).toBe(true);
        expect(matchingSize(next)).toBe(matchingSize(m) + 1);
        m = next;
      }
    }
    expect(paths).toBeGreaterThan(50);
  });
});

describe('the greedy-fails preset, with the spec\'s pinned path', () => {
  const g = presetById('greedy').graph;

  it('greedy matches W1-J1, W3-J3, W4-J2 and leaves W2; augmenting from W2 follows W2-J1-W1-J2-W4-J4 and reaches 4', () => {
    const m = greedy(g);
    expect(m).toEqual([0, -1, 2, 1]);
    expect(matchingSize(m)).toBe(3);
    const s = findAugmenting(g, m, 1);
    expect(s.path).toEqual([{ worker: 1, job: 0 }, { worker: 0, job: 1 }, { worker: 3, job: 3 }]);
    const grown = flip(m, s.path!);
    expect(grown).toEqual([1, 0, 2, 3]);
    expect(isMatching(g, grown)).toBe(true);
    expect(matchingSize(maximumMatching(g))).toBe(4);
  });
});

describe('Hall violators and Konig covers', () => {
  it('a violator is a set of workers with strictly fewer neighbours, and exists exactly when no matching covers all workers (every subset checked)', () => {
    let violators = 0;
    for (const g of graphs()) {
      const maxSize = matchingSize(maximumMatching(g));
      let anySubsetViolates = false;
      for (let mask = 1; mask < 1 << g.workers; mask++) {
        const set = Array.from({ length: g.workers }, (_, w) => w).filter((w) => mask & (1 << w));
        const nb = new Set(set.flatMap((w) => neighbours(g, w)));
        if (nb.size < set.length) anySubsetViolates = true;
      }
      const v = hallViolator(g);
      expect(v !== null).toBe(anySubsetViolates);
      expect(anySubsetViolates).toBe(maxSize < g.workers);
      if (v) {
        violators++;
        const nb = new Set(v.workers.flatMap((w) => neighbours(g, w)));
        expect(v.neighbourhood).toEqual([...nb].sort((a, b) => a - b));
        expect(nb.size).toBeLessThan(v.workers.length);
      }
    }
    expect(violators).toBeGreaterThan(500);
  });

  it('no perfect matching: {W1, W2, W3} has only {J1, J2}', () => {
    const v = hallViolator(presetById('none').graph)!;
    expect(v.workers).toEqual([0, 1, 2]);
    expect(v.neighbourhood).toEqual([0, 1]);
  });

  it('the minimum vertex cover has the matching\'s size, touches every edge, and equals a brute-force minimum cover', () => {
    for (const g of graphs(800)) {
      const m = maximumMatching(g);
      const cover = minimumVertexCover(g, m);
      expect(cover.workers.length + cover.jobs.length).toBe(matchingSize(m));
      for (const [w, j] of g.edges) expect(cover.workers.includes(w) || cover.jobs.includes(j)).toBe(true);
      // Brute force over every set of vertices.
      const nodes = g.workers + g.jobs;
      let best = Infinity;
      for (let mask = 0; mask < 1 << nodes; mask++) {
        const size = mask.toString(2).split('1').length - 1;
        if (size >= best) continue;
        if (g.edges.every(([w, j]) => mask & (1 << w) || mask & (1 << (g.workers + j)))) best = size;
      }
      expect(best).toBe(matchingSize(m));
    }
  });
});

describe('costs: greedy per row against the Hungarian method', () => {
  const permutations = (xs: number[]): number[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

  it('the Hungarian cost equals the minimum over all n! permutations for n up to 6, on 300 seeded matrices per size', () => {
    const rnd = mulberry32(8);
    for (let n = 1; n <= 6; n++) {
      const perms = permutations(Array.from({ length: n }, (_, i) => i));
      for (let t = 0; t < 300; t++) {
        const c: CostMatrix = Array.from({ length: n }, () => Array.from({ length: n }, () => randInt(COST_MIN, COST_MAX, rnd)));
        const a = hungarian(c);
        expect(new Set(a).size).toBe(n);
        expect(assignmentCost(c, a)).toBe(Math.min(...perms.map((p) => assignmentCost(c, p))));
      }
    }
  });

  it('the default matrix: greedy per row costs 14, the optimum is 13, and W1-J2, W2-J1, W3-J3, W4-J4 is the only assignment at 13', () => {
    expect(assignmentCost(DEFAULT_COSTS, greedyAssignment(DEFAULT_COSTS))).toBe(14);
    const a = hungarian(DEFAULT_COSTS);
    expect(assignmentCost(DEFAULT_COSTS, a)).toBe(13);
    expect(a).toEqual([1, 0, 2, 3]);
    const at13 = permutations([0, 1, 2, 3]).filter((p) => assignmentCost(DEFAULT_COSTS, p) === 13);
    expect(at13).toEqual([[1, 0, 2, 3]]);
  });

  it('greedy per row is never below the optimum, and is above it on some matrices', () => {
    const rnd = mulberry32(12);
    let worse = 0;
    for (let t = 0; t < 500; t++) {
      const n = randInt(2, 6, rnd);
      const c: CostMatrix = Array.from({ length: n }, () => Array.from({ length: n }, () => randInt(COST_MIN, COST_MAX, rnd)));
      const g = assignmentCost(c, greedyAssignment(c));
      const h = assignmentCost(c, hungarian(c));
      expect(g).toBeGreaterThanOrEqual(h);
      if (g > h) worse++;
    }
    expect(worse).toBeGreaterThan(50);
  });

  it('setCost clamps to 1..99', () => {
    expect(setCost(DEFAULT_COSTS, 0, 0, 500)[0][0]).toBe(COST_MAX);
    expect(setCost(DEFAULT_COSTS, 0, 0, -3)[0][0]).toBe(COST_MIN);
    expect(setCost(DEFAULT_COSTS, 0, 0, 40)[0][0]).toBe(40);
  });
});

describe('the editor refuses hostile input', () => {
  it('caps each side at 6, keeps at least one of each, and drops edges of a removed node', () => {
    let g = presetById('greedy').graph;
    for (let i = 0; i < 10; i++) {
      const w = addWorker(g);
      if (w.ok) g = w.value;
      const j = addJob(g);
      if (j.ok) g = j.value;
    }
    expect([g.workers, g.jobs]).toEqual([MAX_SIDE, MAX_SIDE]);
    expect(addWorker(g).ok).toBe(false);
    expect(addJob(g).ok).toBe(false);
    const withLast = toggleEdge(g, 5, 5);
    const smaller = removeWorker(withLast);
    expect(smaller.ok && smaller.value.edges.every(([w]) => w < 5)).toBe(true);
    let tiny = presetById('none').graph;
    for (let i = 0; i < 10; i++) {
      const a = removeWorker(tiny);
      if (a.ok) tiny = a.value;
      const b = removeJob(tiny);
      if (b.ok) tiny = b.value;
    }
    expect([tiny.workers, tiny.jobs]).toEqual([1, 1]);
    expect(removeWorker(tiny).ok).toBe(false);
  });

  it('random edits keep every edge between an existing worker and an existing job, without duplicates', () => {
    const rnd = mulberry32(2);
    let g = presetById('balanced').graph;
    for (let step = 0; step < 600; step++) {
      const roll = rnd();
      if (roll < 0.5) g = toggleEdge(g, randInt(0, g.workers - 1, rnd), randInt(0, g.jobs - 1, rnd));
      else {
        const r = [addWorker, addJob, removeWorker, removeJob][randInt(0, 3, rnd)](g);
        if (r.ok) g = r.value;
      }
      expect(g.workers).toBeLessThanOrEqual(MAX_SIDE);
      expect(g.jobs).toBeLessThanOrEqual(MAX_SIDE);
      expect(new Set(g.edges.map(([w, j]) => `${w}-${j}`)).size).toBe(g.edges.length);
      for (const [w, j] of g.edges) {
        expect(w).toBeLessThan(g.workers);
        expect(j).toBeLessThan(g.jobs);
      }
      expect(isMatching(g, maximumMatching(g))).toBe(true);
    }
  });

  it('every preset is a legal graph, and an empty matching is legal everywhere', () => {
    for (const p of PRESETS) expect(isMatching(p.graph, emptyMatching(p.graph))).toBe(true);
  });
});
