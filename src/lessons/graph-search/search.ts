export const COLS = 24;
export const ROWS = 14;
export const N = COLS * ROWS;
export const MUD_COST = 5;

/** 0 = open, 1 = wall, 2 = mud (costs MUD_COST to enter). */
export type Cell = 0 | 1 | 2;
export type Algo = 'bfs' | 'dfs' | 'dijkstra' | 'astar';
export const ALGOS: Algo[] = ['bfs', 'dfs', 'dijkstra', 'astar'];
export const ALGO_NAMES: Record<Algo, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', astar: 'A*' };

export const idx = (x: number, y: number) => y * COLS + x;
export const xy = (i: number): [number, number] => [i % COLS, Math.floor(i / COLS)];
export const stepCost = (grid: Cell[], i: number) => (grid[i] === 2 ? MUD_COST : 1);

function neighbors(i: number) {
  const [x, y] = xy(i);
  const out: number[] = [];
  if (y > 0) out.push(i - COLS);
  if (x < COLS - 1) out.push(i + 1);
  if (y < ROWS - 1) out.push(i + COLS);
  if (x > 0) out.push(i - 1);
  return out;
}

const manhattan = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
};

export interface DsEntry {
  cell: number;
  pri?: number;
}

/** What the search's data structure looked like right after one visit. */
export interface Snap {
  frontier: number[];
  ds: DsEntry[];
  dsSize: number;
}

export interface Trace {
  visits: number[];
  snaps: Snap[];
  path: number[] | null;
  cost: number;
}

const DS_SHOW = 7;

interface PqEntry {
  cell: number;
  g: number;
  h: number;
  pri: number;
  seq: number;
}

const pqLess = (a: PqEntry, b: PqEntry) => a.pri - b.pri || a.h - b.h || a.seq - b.seq;

class MinHeap {
  items: PqEntry[] = [];
  get size() {
    return this.items.length;
  }
  push(e: PqEntry) {
    const a = this.items;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (pqLess(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): PqEntry | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pqLess(a[l], a[m]) < 0) m = l;
        if (r < a.length && pqLess(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

export function runSearch(grid: Cell[], start: number, goal: number, algo: Algo): Trace {
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const visits: number[] = [];
  const snaps: Snap[] = [];
  let found = false;

  if (algo === 'bfs') {
    const q = [start];
    let head = 0;
    closed[start] = 1; // "seen" when enqueued
    while (head < q.length) {
      const cur = q[head++];
      visits.push(cur);
      if (cur === goal) found = true;
      else {
        for (const nb of neighbors(cur)) {
          if (closed[nb] || grid[nb] === 1) continue;
          closed[nb] = 1;
          parent[nb] = cur;
          q.push(nb);
        }
      }
      snaps.push({
        frontier: q.slice(head),
        ds: q.slice(head, head + DS_SHOW).map((cell) => ({ cell })),
        dsSize: q.length - head,
      });
      if (found) break;
    }
  } else if (algo === 'dfs') {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (closed[cur]) continue;
      closed[cur] = 1;
      visits.push(cur);
      if (cur === goal) found = true;
      else {
        // push in reverse so the first neighbour (up) is explored first
        for (const nb of neighbors(cur).reverse()) {
          if (closed[nb] || grid[nb] === 1) continue;
          parent[nb] = cur; // latest push is popped first, so this parent sticks
          stack.push(nb);
        }
      }
      const pending: number[] = [];
      const seen = new Set<number>();
      for (let i = stack.length - 1; i >= 0; i--) {
        const c = stack[i];
        if (!closed[c] && !seen.has(c)) {
          seen.add(c);
          pending.push(c);
        }
      }
      snaps.push({ frontier: pending, ds: pending.slice(0, DS_SHOW).map((cell) => ({ cell })), dsSize: pending.length });
      if (found) break;
    }
  } else {
    const astar = algo === 'astar';
    const dist = new Float64Array(N).fill(Infinity);
    const heap = new MinHeap();
    let seq = 0;
    dist[start] = 0;
    const h0 = astar ? manhattan(start, goal) : 0;
    heap.push({ cell: start, g: 0, h: h0, pri: h0, seq: seq++ });
    while (heap.size) {
      const e = heap.pop()!;
      if (closed[e.cell]) continue;
      closed[e.cell] = 1;
      visits.push(e.cell);
      if (e.cell === goal) found = true;
      else {
        for (const nb of neighbors(e.cell)) {
          if (closed[nb] || grid[nb] === 1) continue;
          const g = e.g + stepCost(grid, nb);
          if (g < dist[nb]) {
            dist[nb] = g;
            parent[nb] = e.cell;
            const h = astar ? manhattan(nb, goal) : 0;
            heap.push({ cell: nb, g, h, pri: g + h, seq: seq++ });
          }
        }
      }
      const best = new Map<number, PqEntry>();
      for (const it of heap.items) {
        if (closed[it.cell]) continue;
        const prev = best.get(it.cell);
        if (!prev || pqLess(it, prev) < 0) best.set(it.cell, it);
      }
      const sorted = [...best.values()].sort(pqLess);
      snaps.push({
        frontier: sorted.map((x) => x.cell),
        ds: sorted.slice(0, DS_SHOW).map((x) => ({ cell: x.cell, pri: x.pri })),
        dsSize: sorted.length,
      });
      if (found) break;
    }
  }

  let path: number[] | null = null;
  let cost = 0;
  if (found) {
    path = [];
    for (let c = goal; c !== -1; c = c === start ? -1 : parent[c]) path.push(c);
    path.reverse();
    for (const c of path.slice(1)) cost += stepCost(grid, c);
  }
  return { visits, snaps, path, cost };
}
