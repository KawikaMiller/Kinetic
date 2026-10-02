import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/random';
import { PRESETS, type PresetId, type World } from './presets';
import { ALGOS, COLS, MUD_COST, N, ROWS, idx, runSearch, stepCost, xy, type Algo, type Cell } from './search';

/** Independent reference: Bellman-Ford relaxation over the grid, with every step costing `cost(i)`. */
function reference(grid: Cell[], start: number, cost: (i: number) => number): number[] {
  const d = new Array<number>(N).fill(Infinity);
  d[start] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < N; i++) {
      if (d[i] === Infinity) continue;
      const [x, y] = xy(i);
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = idx(nx, ny);
        if (grid[j] === 1 || d[i] + cost(j) >= d[j]) continue;
        d[j] = d[i] + cost(j);
        changed = true;
      }
    }
  }
  return d;
}
const stepsFrom = (grid: Cell[], start: number) => reference(grid, start, () => 1);
const costsFrom = (grid: Cell[], start: number) => reference(grid, start, (i) => stepCost(grid, i));
const manhattan = (a: number, b: number) => Math.abs(xy(a)[0] - xy(b)[0]) + Math.abs(xy(a)[1] - xy(b)[1]);

/** A seeded board: some walls, some mud, start and goal on open cells. */
function board(seed: number, walls = 0.26, mud = 0.12): World {
  const rand = mulberry32(seed);
  const grid = Array.from({ length: N }, (): Cell => {
    const r = rand();
    return r < walls ? 1 : r < walls + mud ? 2 : 0;
  });
  const start = Math.floor(rand() * N);
  let goal = Math.floor(rand() * N);
  if (goal === start) goal = (start + 1) % N;
  grid[start] = 0;
  grid[goal] = 0;
  return { grid, start, goal };
}
const BOARDS = Array.from({ length: 150 }, (_, s) => board(s + 1));

function expectValidPath(w: World, path: number[], cost: number) {
  expect(path[0]).toBe(w.start);
  expect(path.at(-1)).toBe(w.goal);
  for (let k = 1; k < path.length; k++) {
    expect(manhattan(path[k - 1], path[k])).toBe(1);
    expect(w.grid[path[k]]).not.toBe(1);
  }
  expect(cost).toBe(path.slice(1).reduce((s, c) => s + stepCost(w.grid, c), 0));
}

/** Presets roll Math.random; pin it to a seed so a preset is reproducible. */
function preset(id: PresetId, seed: number): World {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  return PRESETS[id].make();
}
afterEach(() => vi.restoreAllMocks());

describe('every algorithm on 150 seeded boards', () => {
  it('finds a valid path exactly when the goal is reachable, with the cost it reports', () => {
    for (const w of BOARDS) {
      const reachable = stepsFrom(w.grid, w.start)[w.goal] < Infinity;
      for (const a of ALGOS) {
        const t = runSearch(w.grid, w.start, w.goal, a);
        expect(t.path !== null, `${a}`).toBe(reachable);
        if (t.path) expectValidPath(w, t.path, t.cost);
      }
    }
  });

  it('BFS finds the fewest steps, matching a Bellman-Ford reference', () => {
    for (const w of BOARDS) {
      const t = runSearch(w.grid, w.start, w.goal, 'bfs');
      if (t.path) expect(t.path.length - 1).toBe(stepsFrom(w.grid, w.start)[w.goal]);
    }
  });

  it(`Dijkstra finds the cheapest cost with mud at ${MUD_COST}, matching the reference`, () => {
    for (const w of BOARDS) {
      const t = runSearch(w.grid, w.start, w.goal, 'dijkstra');
      if (t.path) expect(t.cost).toBe(costsFrom(w.grid, w.start)[w.goal]);
    }
  });

  it('A* finds the same optimal cost as Dijkstra, and never visits more cells', () => {
    for (const w of BOARDS) {
      const d = runSearch(w.grid, w.start, w.goal, 'dijkstra');
      const a = runSearch(w.grid, w.start, w.goal, 'astar');
      expect(a.cost).toBe(d.cost);
      expect(a.visits.length).toBeLessThanOrEqual(d.visits.length);
    }
  });

  it("A*'s heuristic (Manhattan distance) never overestimates the real remaining cost", () => {
    for (const w of BOARDS.slice(0, 30)) {
      // Walking the goal-to-i route backwards pays i's neighbours' entry costs instead of i's, and the goal's at the end.
      const fromGoal = costsFrom(w.grid, w.goal);
      for (let i = 0; i < N; i++) {
        if (w.grid[i] === 1 || fromGoal[i] === Infinity) continue;
        const remaining = i === w.goal ? 0 : fromGoal[i] - stepCost(w.grid, i) + stepCost(w.grid, w.goal);
        expect(manhattan(i, w.goal)).toBeLessThanOrEqual(remaining);
      }
    }
  });

  it('with no path, every algorithm visits every reachable cell to prove it', () => {
    const w = board(99, 0, 0);
    const [gx, gy] = xy(w.goal);
    for (const [x, y] of [[gx, gy - 1], [gx + 1, gy], [gx, gy + 1], [gx - 1, gy]]) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) w.grid[idx(x, y)] = 1;
    }
    const reachable = stepsFrom(w.grid, w.start).filter((d) => d < Infinity).length;
    for (const a of ALGOS) {
      const t = runSearch(w.grid, w.start, w.goal, a);
      expect(t.path).toBeNull();
      expect(new Set(t.visits).size).toBe(reachable);
      expect(t.visits).toHaveLength(reachable);
    }
  });
});

describe('how each one explores', () => {
  it("BFS visits cells in order of steps, and its queue only ever holds two neighbouring distances", () => {
    for (const w of BOARDS.slice(0, 40)) {
      const steps = stepsFrom(w.grid, w.start);
      const t = runSearch(w.grid, w.start, w.goal, 'bfs');
      t.visits.forEach((c, k) => k && expect(steps[c]).toBeGreaterThanOrEqual(steps[t.visits[k - 1]]));
      for (const s of t.snaps) {
        if (!s.frontier.length) continue;
        const ds = s.frontier.map((c) => steps[c]);
        expect(Math.max(...ds) - Math.min(...ds)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Dijkstra settles cells in order of their cheapest cost', () => {
    for (const w of BOARDS.slice(0, 40)) {
      const costs = costsFrom(w.grid, w.start);
      const t = runSearch(w.grid, w.start, w.goal, 'dijkstra');
      t.visits.forEach((c, k) => k && expect(costs[c]).toBeGreaterThanOrEqual(costs[t.visits[k - 1]]));
    }
  });

  it('the side panel lists the frontier in pop order, and its size is the whole frontier', () => {
    for (const a of ALGOS) {
      const w = BOARDS[3];
      const t = runSearch(w.grid, w.start, w.goal, a);
      for (const s of t.snaps) {
        expect(s.dsSize).toBe(s.frontier.length);
        expect(s.ds.map((e) => e.cell)).toEqual(s.frontier.slice(0, s.ds.length));
        expect(new Set(s.frontier).size).toBe(s.frontier.length); // stale duplicates are hidden
      }
    }
  });

  it('priorities shown for Dijkstra are cost so far, and for A* cost so far + Manhattan distance', () => {
    const w = BOARDS[5];
    const costs = costsFrom(w.grid, w.start);
    for (const a of ['dijkstra', 'astar'] as Algo[]) {
      const t = runSearch(w.grid, w.start, w.goal, a);
      t.visits.forEach((_, k) => {
        // The head of the queue is about to be settled, so its cost so far is final.
        const head = t.snaps[k].ds[0];
        if (head) expect(head.pri).toBe(costs[head.cell] + (a === 'astar' ? manhattan(head.cell, w.goal) : 0));
      });
    }
  });
});

describe('the presets back up the lesson', () => {
  it('Mud field: BFS ploughs through mud and pays more than Dijkstra', () => {
    for (let s = 1; s <= 25; s++) {
      const w = preset('mud', s);
      const bfs = runSearch(w.grid, w.start, w.goal, 'bfs');
      const dij = runSearch(w.grid, w.start, w.goal, 'dijkstra');
      expect(bfs.path!.some((c) => w.grid[c] === 2)).toBe(true);
      expect(dij.cost).toBeLessThan(bfs.cost);
    }
  });

  it('Maze: DFS usually finds a longer path than BFS', () => {
    let longer = 0;
    for (let s = 1; s <= 25; s++) {
      const w = preset('maze', s);
      const bfs = runSearch(w.grid, w.start, w.goal, 'bfs');
      const dfs = runSearch(w.grid, w.start, w.goal, 'dfs');
      expect(dfs.path!.length).toBeGreaterThanOrEqual(bfs.path!.length);
      if (dfs.path!.length > bfs.path!.length) longer++;
    }
    expect(longer).toBeGreaterThan(15);
  });

  it('Random walls: a route through on the default board', () => {
    let routed = 0;
    for (let s = 1; s <= 25; s++) {
      const w = preset('walls', s);
      if (runSearch(w.grid, w.start, w.goal, 'bfs').path) routed++;
    }
    expect(routed).toBe(25);
  });

  it('Empty: A* visits far fewer cells than Dijkstra', () => {
    const w = PRESETS.empty.make();
    const d = runSearch(w.grid, w.start, w.goal, 'dijkstra');
    const a = runSearch(w.grid, w.start, w.goal, 'astar');
    expect(a.visits.length * 3).toBeLessThan(d.visits.length);
  });
});
