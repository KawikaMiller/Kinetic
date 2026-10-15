import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { MAX_NODES, PRESETS, addEdge, addNode, adjacency, canonical, condense, edgeEffect, kosaraju, presetById, tarjan, type Arc, type Digraph } from './model';

const NO_POS = { x: 0, y: 0 };
const make = (n: number, edges: Arc[]): Digraph => ({ names: Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i)), at: Array(n).fill(NO_POS), edges });

function randomDigraph(rnd: () => number, maxN = 8, p = 0.25): Digraph {
  const n = randInt(1, maxN, rnd);
  const edges: Arc[] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (rnd() < p) edges.push([a, b]);
  return make(n, edges);
}

/** Mutual reachability by Warshall's closure: an independent route to the components. */
function closureClasses(g: Digraph): number[][] {
  const n = g.names.length;
  const r = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => i === j));
  for (const [a, b] of g.edges) r[a][b] = true;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r[i][k] && r[k][j]) r[i][j] = true;
  const classes: number[][] = [];
  const done = new Set<number>();
  for (let u = 0; u < n; u++) {
    if (done.has(u)) continue;
    const c = [];
    for (let v = 0; v < n; v++) if (r[u][v] && r[v][u]) c.push(v);
    c.forEach((v) => done.add(v));
    classes.push(c);
  }
  return classes;
}

function permutations(xs: number[]): number[][] {
  if (xs.length < 2) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('the partition equals mutual reachability', () => {
  it('Kosaraju and Tarjan both match a Warshall closure on 2,000 seeded digraphs of up to 8 nodes', () => {
    const rnd = mulberry32(31);
    let multi = 0;
    for (let t = 0; t < 2000; t++) {
      const g = randomDigraph(rnd, 8, [0.1, 0.2, 0.35][t % 3]);
      const truth = canonical(closureClasses(g));
      expect(canonical(kosaraju(g).components)).toBe(truth);
      expect(canonical(tarjan(g))).toBe(truth);
      if (closureClasses(g).some((c) => c.length > 1)) multi++;
    }
    expect(multi).toBeGreaterThan(500);
  });

  it('the pass-1 start order changes the finish order but never the components (all orders of small graphs)', () => {
    const rnd = mulberry32(9);
    let finishOrdersDiffered = 0;
    for (let t = 0; t < 120; t++) {
      const g = randomDigraph(rnd, 5, 0.3);
      const truth = canonical(closureClasses(g));
      const orders = permutations(g.names.map((_, i) => i));
      const finishes = new Set<string>();
      for (const order of orders) {
        const run = kosaraju(g, order);
        expect(canonical(run.components)).toBe(truth);
        finishes.add(run.finishOrder.join());
      }
      if (finishes.size > 1) finishOrdersDiffered++;
    }
    expect(finishOrdersDiffered).toBeGreaterThan(30);
  });

  it('a second pass over the forward graph instead of the reversed one gets components wrong (broken variant is rejected)', () => {
    const g = presetById('tangle').graph;
    const run = kosaraju(g);
    const fwd = adjacency(g.names.length, g.edges);
    const comp = new Array<number>(g.names.length).fill(-1);
    const classes: number[][] = [];
    const grow = (v: number) => {
      comp[v] = classes.length - 1;
      classes[classes.length - 1].push(v);
      for (const w of fwd[v]) if (comp[w] < 0) grow(w);
    };
    for (const v of [...run.finishOrder].reverse()) if (comp[v] < 0) { classes.push([]); grow(v); }
    expect(canonical(classes)).not.toBe(canonical(closureClasses(g)));
  });
});

describe('the condensation', () => {
  it('is acyclic with a valid topological order, on 2,000 digraphs; a DAG has as many components as nodes', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 2000; t++) {
      const g = randomDigraph(rnd, 8, 0.25);
      const run = kosaraju(g);
      const c = condense(g, run.comp, run.components.length);
      expect(c.order).not.toBeNull();
      const pos = new Map(c.order!.map((x, i) => [x, i]));
      for (const [a, b] of c.edges) expect(pos.get(a)!).toBeLessThan(pos.get(b)!);
      // No edge of the condensation joins a component to itself.
      expect(c.edges.every(([a, b]) => a !== b)).toBe(true);
    }
    for (let t = 0; t < 300; t++) {
      const n = randInt(1, 8, rnd);
      const edges: Arc[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < 0.4) edges.push([a, b]);
      expect(kosaraju(make(n, edges)).components).toHaveLength(n);
    }
  });
});

describe('the presets and the hand-worked case', () => {
  const names = (g: Digraph, vs: readonly number[]) => vs.map((v) => g.names[v]).join('');

  it('dependency tangle: finish order c h g f e d b a, then components {a b c}, {d e f}, {g}, {h}', () => {
    const g = presetById('tangle').graph;
    const run = kosaraju(g);
    // Worked by hand: DFS a, b, c (c finishes first), back, d, e, f, g, h (h first of those), then f, e, d, b, a.
    expect(names(g, run.finishOrder)).toBe('chgfedba');
    expect(run.components.map((c) => names(g, [...c].sort()))).toEqual(['abc', 'def', 'g', 'h']);
    expect(run.pass1.filter((e) => e.kind === 'finish').map((e) => e.time)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('deadlock: the ring of three tasks is one component and the task waiting on it is alone; the DAG preset has one component per node; one big loop is one', () => {
    const dead = presetById('deadlock').graph;
    expect(kosaraju(dead).components.map((c) => names(dead, [...c].sort())).sort()).toEqual(['T1T2T3', 'T4']);
    const dag = presetById('dag').graph;
    expect(kosaraju(dag).components).toHaveLength(dag.names.length);
    const loop = presetById('loop').graph;
    expect(kosaraju(loop).components).toHaveLength(1);
  });

  it('every preset agrees with the closure oracle', () => {
    for (const p of PRESETS) expect(canonical(kosaraju(p.graph).components)).toBe(canonical(closureClasses(p.graph)));
  });
});

describe('adding an edge', () => {
  const tangle = presetById('tangle').graph;
  const idx = (n: string) => tangle.names.indexOf(n);

  it('d to a closes a cycle in the condensation and fuses {a b c} with {d e f}: 4 components become 3', () => {
    const e = edgeEffect(tangle, idx('d'), idx('a'));
    expect([e.before, e.after]).toEqual([4, 3]);
    expect(e.merged.map((c) => c.map((v) => tangle.names[v]).join(''))).toEqual(['abcdef']);
  });

  it('h to a closes a longer cycle and fuses everything: 4 become 1; an edge inside a component, or forward in the DAG order, changes nothing', () => {
    const all = edgeEffect(tangle, idx('h'), idx('a'));
    expect([all.before, all.after]).toEqual([4, 1]);
    const inside = edgeEffect(tangle, idx('e'), idx('d'));
    expect([inside.before, inside.after, inside.merged]).toEqual([4, 4, []]);
    const forward = edgeEffect(tangle, idx('a'), idx('g'));
    expect([forward.before, forward.after, forward.merged]).toEqual([4, 4, []]);
  });

  it('the effect equals the closure oracle for random graphs and random edges', () => {
    const rnd = mulberry32(12);
    for (let t = 0; t < 600; t++) {
      const g = randomDigraph(rnd, 7, 0.2);
      const a = randInt(0, g.names.length - 1, rnd);
      const b = randInt(0, g.names.length - 1, rnd);
      const added = addEdge(g, a, b);
      const e = edgeEffect(g, a, b);
      expect(e.before).toBe(closureClasses(g).length);
      expect(e.after).toBe(closureClasses(added.ok ? added.value : g).length);
    }
  });
});

describe('the editor refuses hostile input', () => {
  it('refuses a duplicate edge, allows a self-loop as a one-node component, and stops at 9 nodes', () => {
    const g = presetById('tangle').graph;
    expect(addEdge(g, 0, 1)).toMatchObject({ ok: false });
    const looped = addEdge(g, 7, 7);
    expect(looped.ok).toBe(true);
    if (looped.ok) {
      expect(kosaraju(looped.value).components).toHaveLength(4);
      expect(kosaraju(looped.value).components.some((c) => c.length === 1 && c[0] === 7)).toBe(true);
    }
    let big = g;
    for (let i = 0; i < 12; i++) {
      const r = addNode(big);
      if (r.ok) big = r.value;
    }
    expect(big.names).toHaveLength(MAX_NODES);
    expect(new Set(big.names).size).toBe(MAX_NODES);
    expect(addNode(big).ok).toBe(false);
  });

  it('a random sequence of edits keeps the graph valid', () => {
    const rnd = mulberry32(3);
    let g = presetById('dag').graph;
    for (let i = 0; i < 400; i++) {
      if (rnd() < 0.3) {
        const r = addNode(g);
        if (r.ok) g = r.value;
      } else {
        const r = addEdge(g, randInt(0, g.names.length - 1, rnd), randInt(0, g.names.length - 1, rnd));
        if (r.ok) g = r.value;
      }
      expect(g.names.length).toBeLessThanOrEqual(MAX_NODES);
      expect(g.at).toHaveLength(g.names.length);
      expect(new Set(g.edges.map(([a, b]) => `${a}>${b}`)).size).toBe(g.edges.length);
      expect(canonical(kosaraju(g).components)).toBe(canonical(closureClasses(g)));
    }
  });
});
