/** Test helpers only: an independent shortest-path oracle (Floyd-Warshall) and seeded random connected graphs. */
import { mulberry32 } from '../../core/random';
import { COST_MAX, COST_MIN, linkId, type Topo } from './topology';

/** All-pairs shortest path costs by Floyd-Warshall over the links that are up. */
export function floydWarshall(t: Topo): Record<string, Record<string, number>> {
  const d: Record<string, Record<string, number>> = {};
  for (const a of t.routers) {
    d[a] = {};
    for (const b of t.routers) d[a][b] = a === b ? 0 : Infinity;
  }
  for (const l of t.links) {
    if (!l.up) continue;
    d[l.a][l.b] = Math.min(d[l.a][l.b], l.cost);
    d[l.b][l.a] = Math.min(d[l.b][l.a], l.cost);
  }
  for (const k of t.routers) for (const i of t.routers) for (const j of t.routers) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return d;
}

/** The neighbour a cheapest path starts with, by the distance matrix; smallest id on a tie. */
export function oracleNext(t: Topo, d: Record<string, Record<string, number>>, from: string, to: string): string | null {
  if (from === to || d[from][to] === Infinity) return null;
  const options = t.links
    .filter((l) => l.up && (l.a === from || l.b === from))
    .map((l) => ({ n: l.a === from ? l.b : l.a, cost: l.cost }))
    .filter(({ n, cost }) => cost + d[n][to] === d[from][to])
    .map(({ n }) => n)
    .sort();
  return options[0] ?? null;
}

const NAMES = 'ABCDEFGHIJ';

/** A seeded connected graph of 6-10 routers: a random spanning tree plus extra links, costs 1-9. */
export function randomTopo(seed: number): Topo {
  const rnd = mulberry32(seed);
  const n = 6 + Math.floor(rnd() * 5);
  const routers = [...NAMES].slice(0, n);
  const links = new Map<string, { id: string; a: string; b: string; cost: number; up: boolean }>();
  const add = (x: string, y: string) => {
    const id = linkId(x, y);
    if (x !== y && !links.has(id)) links.set(id, { id, a: id[0], b: id[1], cost: COST_MIN + Math.floor(rnd() * (COST_MAX - COST_MIN + 1)), up: true });
  };
  for (let i = 1; i < n; i++) add(routers[i], routers[Math.floor(rnd() * i)]);
  const extra = Math.floor(rnd() * n);
  for (let k = 0; k < extra; k++) add(routers[Math.floor(rnd() * n)], routers[Math.floor(rnd() * n)]);
  return { routers, links: [...links.values()] };
}
