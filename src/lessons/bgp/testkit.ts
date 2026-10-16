/** Test helpers only: seeded valley-free AS graphs, a three-phase reference for the converged routes, and a path enumerator. */
import { mulberry32 } from '../../core/random';
import { relOf, type Asn, type AsEdge, type AsGraph, type Rel } from './asgraph';
import { isValleyFree } from './bgp';

/** A customer-provider DAG (providers sit at a higher level) plus peer links between ASes of one level; 6-10 ASes. */
export function randomValleyFreeGraph(seed: number): AsGraph {
  const rnd = mulberry32(seed);
  const n = 6 + Math.floor(rnd() * 5);
  const ases = Array.from({ length: n }, (_, i) => 64496 + i);
  const level = ases.map(() => Math.floor(rnd() * 4));
  const edges: AsEdge[] = [];
  const linked = (x: Asn, y: Asn) => edges.some((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));
  ases.forEach((a, i) => {
    const above = ases.filter((_, j) => level[j] > level[i]);
    if (above.length === 0) return;
    const providers = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < providers; k++) {
      const p = above[Math.floor(rnd() * above.length)];
      if (!linked(a, p)) edges.push({ a, b: p, kind: 'c2p' });
    }
  });
  ases.forEach((a, i) => {
    ases.forEach((b, j) => {
      if (i < j && level[i] === level[j] && !linked(a, b) && rnd() < 0.4) edges.push({ a, b, kind: 'p2p' });
    });
  });
  return { ases, edges };
}

const levelOrder = (g: AsGraph): Asn[] => {
  // Providers before customers: repeat until every AS is placed after all of its providers.
  const placed: Asn[] = [];
  const providersOf = (x: Asn) => g.edges.filter((e) => e.kind === 'c2p' && e.a === x).map((e) => e.b);
  while (placed.length < g.ases.length) {
    for (const a of g.ases) if (!placed.includes(a) && providersOf(a).every((p) => placed.includes(p))) placed.push(a);
  }
  return placed;
};

type Best = Record<Asn, { path: Asn[]; rel: Rel | 'origin' } | null>;

/**
 * The stable routes of the Gao-Rexford setting, computed class by class (customer routes, then peer routes, then provider routes),
 * each class by shortest path and lowest neighbour. A different algorithm from the synchronous rounds in bgp.ts.
 */
export function threePhase(g: AsGraph, origin: Asn): Best {
  const best: Best = Object.fromEntries(g.ases.map((a) => [a, null]));
  best[origin] = { path: [], rel: 'origin' };
  const nbrs = (x: Asn, rel: Rel) => g.edges.flatMap((e) => (relOf([e], x, e.a === x ? e.b : e.a) === rel ? [e.a === x ? e.b : e.a] : [])).sort((p, q) => p - q);
  const pick = (cands: { via: Asn; path: Asn[] }[]) => cands.sort((p, q) => p.path.length - q.path.length || p.via - q.via)[0];
  // Phase 1: customer routes climb from the origin.
  for (let changed = true; changed; ) {
    changed = false;
    for (const x of g.ases) {
      if (x === origin) continue;
      const cands = nbrs(x, 'customer').flatMap((c) => (best[c] && (best[c]!.rel === 'origin' || best[c]!.rel === 'customer') ? [{ via: c, path: [c, ...best[c]!.path] }] : []));
      if (cands.length === 0) continue;
      const p = pick(cands);
      if (!best[x] || best[x]!.path.join() !== p.path.join()) {
        best[x] = { path: p.path, rel: 'customer' };
        changed = true;
      }
    }
  }
  // Phase 2: one peer hop, for ASes with no customer route.
  const customerHolders = new Set(g.ases.filter((a) => best[a]));
  for (const x of g.ases) {
    if (best[x]) continue;
    const cands = nbrs(x, 'peer').flatMap((q) => (customerHolders.has(q) ? [{ via: q, path: [q, ...best[q]!.path] }] : []));
    if (cands.length > 0) best[x] = { path: pick(cands).path, rel: 'peer' };
  }
  // Phase 3: provider routes flow down, providers first.
  for (const x of levelOrder(g)) {
    if (best[x]) continue;
    const cands = nbrs(x, 'provider').flatMap((p) => (best[p] ? [{ via: p, path: [p, ...best[p]!.path] }] : []));
    if (cands.length > 0) best[x] = { path: pick(cands).path, rel: 'provider' };
  }
  return best;
}

/** Every simple path from `from` to `to` over the graph's links (depth-first). */
export function simplePaths(g: AsGraph, from: Asn, to: Asn): Asn[][] {
  const out: Asn[][] = [];
  const walk = (path: Asn[]) => {
    const at = path[path.length - 1];
    if (at === to) {
      out.push(path);
      return;
    }
    for (const e of g.edges) {
      const next = e.a === at ? e.b : e.b === at ? e.a : null;
      if (next !== null && !path.includes(next)) walk([...path, next]);
    }
  };
  walk([from]);
  return out;
}

/** The best relationship class available to `from`: the class of the first hop of the best valley-free simple path. */
export function bestClassByEnumeration(g: AsGraph, from: Asn, to: Asn): Rel | null {
  const order: Rel[] = ['customer', 'peer', 'provider'];
  const classes = simplePaths(g, from, to)
    .filter((p) => isValleyFree(g, p))
    .map((p) => relOf(g.edges, p[0], p[1]) as Rel);
  return order.find((c) => classes.includes(c)) ?? null;
}
