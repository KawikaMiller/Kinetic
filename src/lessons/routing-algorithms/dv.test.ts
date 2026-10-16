import { describe, expect, it } from 'vitest';
import { SPLIT_MODES, coldTables, dvRound, dvRun, sceneRun, settled, type SplitMode, type Tables } from './dv';
import { dijkstra, nextHops, treeEdges } from './paths';
import { floydWarshall, oracleNext, randomTopo } from './testkit';
import { INFINITY_COST, PRESETS, adjacency, intactTopo, presetById, presetTopo, withLink, type Topo } from './topology';

const costs = (run: { tables: Tables[] }, router: string, dest: string, from: number, to: number) =>
  run.tables.slice(from, to + 1).map((t) => t[router][dest].cost);

/** Random graphs whose every shortest path costs 15 or less, so the 16 limit never hides a real route. */
function shortGraphs(count: number): Topo[] {
  const out: Topo[] = [];
  for (let seed = 1; out.length < count && seed < 5000; seed++) {
    const t = randomTopo(seed);
    const d = floydWarshall(t);
    if (t.routers.every((a) => t.routers.every((b) => d[a][b] <= INFINITY_COST - 1))) out.push(t);
  }
  return out;
}

describe('distance vector against independent oracles', () => {
  const graphs = shortGraphs(200);

  it('finds 200 random connected graphs of 6-10 routers to test on', () => {
    expect(graphs).toHaveLength(200);
    expect(Math.min(...graphs.map((g) => g.routers.length))).toBe(6);
    expect(Math.max(...graphs.map((g) => g.routers.length))).toBe(10);
  });

  it('a cold start converges to Floyd-Warshall costs and cheapest next hops, in at most n-1 rounds', () => {
    for (const g of graphs) {
      const run = dvRun(coldTables(g.routers), g, 'plain');
      const fw = floydWarshall(g);
      const last = run.tables[run.tables.length - 1];
      expect(run.hitCap).toBe(false);
      expect(run.rounds).toBeLessThanOrEqual(g.routers.length - 1);
      for (const a of g.routers) {
        for (const b of g.routers) {
          expect(last[a][b].cost).toBe(fw[a][b]);
          expect(last[a][b].next).toBe(oracleNext(g, fw, a, b));
        }
      }
    }
  });

  it('every mode settles on the same costs after a random link is cut, when the network stays connected', () => {
    let cutsChecked = 0;
    for (const g of graphs) {
      for (const l of g.links) {
        const cut = withLink(g, l.id, { up: false });
        const fw = floydWarshall(cut);
        if (!cut.routers.every((a) => cut.routers.every((b) => fw[a][b] <= INFINITY_COST - 1))) continue;
        cutsChecked++;
        for (const mode of SPLIT_MODES) {
          const run = sceneRun(g, cut, 'change', mode);
          const last = run.tables[run.tables.length - 1];
          expect(run.hitCap).toBe(false);
          for (const a of g.routers) for (const b of g.routers) expect(last[a][b].cost).toBe(fw[a][b]);
        }
        if (cutsChecked >= 120) return;
      }
    }
    expect(cutsChecked).toBeGreaterThan(50);
  });

  it('a true distance of 16 or more reads as unreachable: the limit is a rule of the model, not a bug', () => {
    const chain: Topo = { routers: ['A', 'B', 'C', 'D'], links: [
      { id: 'AB', a: 'A', b: 'B', cost: 9, up: true },
      { id: 'BC', a: 'B', b: 'C', cost: 9, up: true },
      { id: 'CD', a: 'C', b: 'D', cost: 9, up: true },
    ] };
    const last = settled(chain);
    expect(last.A.B.cost).toBe(9);
    expect(last.A.C.cost).toBe(INFINITY_COST);
    expect(last.A.C.next).toBeNull();
    expect(floydWarshall(chain).A.C).toBe(18);
  });

  it('Dijkstra, next hops and the tree agree with Floyd-Warshall', () => {
    for (const g of graphs) {
      const fw = floydWarshall(g);
      const adj = adjacency(g);
      for (const src of g.routers) {
        const dist = dijkstra(adj, src);
        const next = nextHops(adj, src);
        for (const d of g.routers) {
          expect(dist[d]).toBe(fw[src][d]);
          expect(next[d]).toBe(oracleNext(g, fw, src, d));
        }
        const tree = treeEdges(adj, src);
        expect(tree).toHaveLength(g.routers.length - 1);
        for (const [p, c] of tree) expect(dist[p] + adj[p][c]).toBe(dist[c]);
      }
    }
  });
});

describe('count to infinity, hand-worked', () => {
  const chain = presetById('chain');
  const cut = presetTopo(chain);
  const intact = intactTopo(cut);

  it('plain, chain A-B-C, B-C cut: A\'s cost to C after rounds 1-6 is 2, 4, 4, 6, 6, 8 and B\'s is 3, 3, 5, 5, 7, 7', () => {
    const run = sceneRun(intact, cut, 'change', 'plain');
    expect(costs(run, 'A', 'C', 1, 6)).toEqual([2, 4, 4, 6, 6, 8]);
    expect(costs(run, 'B', 'C', 1, 6)).toEqual([3, 3, 5, 5, 7, 7]);
  });

  it('reaches 16 and stops there: A is at 16 in round 14, B in round 15, and nothing changes after', () => {
    // By hand: A = 1 + B's advertised cost, B = 1 + A's, both from the previous round. A rises in rounds 2, 4, ..., 14
    // (to 16 in round 14, since B is at 15 in round 13); B rises in rounds 3, 5, ..., 13 to 15, then to 16 in round 15.
    const run = sceneRun(intact, cut, 'change', 'plain');
    expect(run.rounds).toBe(15);
    expect(run.hitCap).toBe(false);
    expect(run.tables[14].A.C.cost).toBe(INFINITY_COST);
    expect(run.tables[13].B.C.cost).toBe(15);
    expect(run.tables[15].B.C).toEqual({ cost: INFINITY_COST, next: null, alts: [] });
    expect(dvRound(cut, run.tables[15], 'plain').changed.size).toBe(0);
  });

  it('split horizon and poisoned reverse settle the chain in 2 rounds: B drops C in round 1, A in round 2', () => {
    for (const mode of ['split', 'poison'] as SplitMode[]) {
      const run = sceneRun(intact, cut, 'change', mode);
      expect(run.rounds).toBe(2);
      expect(costs(run, 'B', 'C', 0, 2)).toEqual([1, 16, 16]);
      expect(costs(run, 'A', 'C', 0, 2)).toEqual([2, 2, 16]);
    }
  });
});

describe('the triangle with a stub, where split horizon is not enough', () => {
  const triangle = presetById('triangle');
  const cut = presetTopo(triangle);
  const intact = intactTopo(cut);

  it('split horizon: round 1 drops A\'s route to X, round 2 has B and C pick each other at cost 3 (hand-worked)', () => {
    // Round 1: B and C only advertise X to each other (their route is through A), A gets nothing from them, so A drops X.
    // B and C still read A's old vector, so they keep cost 2. Round 2: A's table now says 16, B reads C's cost 2 + 1 = 3 (and C reads B's).
    const run = sceneRun(intact, cut, 'change', 'split');
    expect([run.tables[1].A.X.cost, run.tables[1].B.X.cost, run.tables[1].C.X.cost]).toEqual([INFINITY_COST, 2, 2]);
    expect([run.tables[2].A.X.cost, run.tables[2].B.X.cost, run.tables[2].C.X.cost]).toEqual([INFINITY_COST, 3, 3]);
    expect(run.tables[2].B.X.next).toBe('C');
    expect(run.tables[2].C.X.next).toBe('B');
  });

  it('the cheapest finite cost to X rises by one every round, so all three modes still count upward', () => {
    for (const mode of SPLIT_MODES) {
      const run = sceneRun(intact, cut, 'change', mode);
      const cheapest = (k: number) => Math.min(...['A', 'B', 'C'].map((r) => run.tables[k][r].X.cost));
      for (let k = 1; k <= 8; k++) expect(cheapest(k)).toBe(k + 1);
    }
  });

  it('round counts: 15 for plain, split horizon and poisoned reverse, and plain is never faster than the others', () => {
    const rounds = Object.fromEntries(SPLIT_MODES.map((m) => [m, sceneRun(intact, cut, 'change', m).rounds]));
    expect(rounds).toEqual({ plain: 15, split: 15, poison: 15 });
  });
});

describe('across the presets', () => {
  it('plain is never faster than split horizon or poisoned reverse on the chain and the triangle; split and poison build the same tables', () => {
    for (const p of PRESETS) {
      const cut = presetTopo(p);
      const runs = Object.fromEntries(SPLIT_MODES.map((m) => [m, sceneRun(intactTopo(cut), cut, p.start, m)])) as Record<SplitMode, ReturnType<typeof sceneRun>>;
      expect(runs.split.tables).toEqual(runs.poison.tables);
      expect(runs.split.hitCap || runs.plain.hitCap || runs.poison.hitCap).toBe(false);
      if (p.id === 'chain' || p.id === 'triangle') expect(runs.plain.rounds).toBeGreaterThanOrEqual(runs.split.rounds);
    }
  });

  it('on the ring, split horizon is slower than plain: the lesson must not claim it is always faster', () => {
    const ring = presetTopo(presetById('ring'));
    const plain = sceneRun(intactTopo(ring), ring, 'change', 'plain').rounds;
    const split = sceneRun(intactTopo(ring), ring, 'change', 'split').rounds;
    expect(split).toBeGreaterThan(plain);
  });

  it('the equal-cost preset lists both next hops for A to D, from a cold boot', () => {
    const eq = presetTopo(presetById('equal'));
    const run = sceneRun(intactTopo(eq), eq, 'boot', 'plain');
    const last = run.tables[run.tables.length - 1];
    expect(last.A.D).toEqual({ cost: 2, next: 'B', alts: ['B', 'C'] });
    expect(run.rounds).toBe(2);
  });

  it('a cold boot starts with every router knowing only itself', () => {
    const eq = presetTopo(presetById('equal'));
    const first = sceneRun(intactTopo(eq), eq, 'boot', 'plain').tables[0];
    expect(first.A.D.cost).toBe(INFINITY_COST);
    expect(first.A.A.cost).toBe(0);
  });
});

describe('hostile networks', () => {
  it('cutting every link leaves each router alone: every other entry is unreachable, never NaN or Infinity, and it settles', () => {
    for (const p of PRESETS) {
      let t = presetTopo(p);
      for (const l of t.links) t = withLink(t, l.id, { up: false });
      for (const mode of SPLIT_MODES) {
        const run = sceneRun(intactTopo(t), t, 'change', mode);
        const last = run.tables[run.tables.length - 1];
        expect(run.hitCap).toBe(false);
        for (const a of t.routers) {
          for (const b of t.routers) {
            const e = last[a][b];
            expect(Number.isFinite(e.cost)).toBe(true);
            expect(e.cost).toBe(a === b ? 0 : INFINITY_COST);
            expect(e.next).toBeNull();
          }
        }
      }
    }
  });
});
