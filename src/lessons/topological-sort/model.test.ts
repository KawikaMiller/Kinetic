import { describe, expect, it } from 'vitest';
import { layeredLayout } from '../../core/graphLayout';
import { mulberry32, randInt, shuffle, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { topoFrames } from './frames';
import { countOrders, cycleEdges, dfsTopo, findCycle, isValidOrder, kahn, layoutEdges, refuseEdge, type Dag } from './model';
import { PRESETS } from './presets';

const names = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

/** A random DAG: edges only run forward along a hidden shuffled order. */
function randomDag(rnd: Rnd, maxNodes: number): Dag {
  const nodes = names(randInt(1, maxNodes, rnd));
  const hidden = shuffle(nodes, rnd);
  const p = rnd() * 0.5;
  const edges: Dag['edges'][number][] = [];
  for (let i = 0; i < hidden.length; i++) for (let j = i + 1; j < hidden.length; j++) if (rnd() < p) edges.push({ from: hidden[i], to: hidden[j] });
  return { nodes, edges: shuffle(edges, rnd) };
}

/** Any directed graph without self-loops. */
function randomDigraph(rnd: Rnd, maxNodes: number): Dag {
  const nodes = names(randInt(1, maxNodes, rnd));
  const p = rnd() * 0.4;
  const edges = nodes.flatMap((a) => nodes.filter((b) => b !== a && rnd() < p).map((b) => ({ from: a, to: b })));
  return { nodes, edges };
}

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
const bruteCount = (g: Dag) => permutations(g.nodes).filter((p) => isValidOrder(g, p)).length;

function isRealCycle(g: Dag, cycle: readonly string[], within: readonly string[] = g.nodes) {
  return (
    cycle.length > 0 &&
    new Set(cycle).size === cycle.length &&
    cycle.every((n) => within.includes(n)) &&
    cycleEdges(g, cycle).every((i) => i >= 0)
  );
}

describe('topological sort on DAGs', () => {
  it('Kahn and DFS both give valid orders on 500 seeded DAGs of up to 12 nodes', () => {
    const rnd = mulberry32(11);
    for (let t = 0; t < 500; t++) {
      const g = randomDag(rnd, 12);
      const k = kahn(g);
      const d = dfsTopo(g);
      expect(k.stuck).toEqual([]);
      expect(d.cycle).toBeNull();
      expect(isValidOrder(g, k.order)).toBe(true);
      expect(isValidOrder(g, d.order)).toBe(true);
      expect(findCycle(g)).toBeNull();
    }
  });

  it('counts valid orders exactly: matches brute force over every permutation (up to 8 nodes)', () => {
    const rnd = mulberry32(12);
    for (let t = 0; t < 150; t++) {
      const g = t % 2 ? randomDag(rnd, 8) : randomDigraph(rnd, 7);
      expect(countOrders(g)).toBe(bruteCount(g));
    }
    expect(countOrders({ nodes: names(4), edges: [] })).toBe(24);
  });

  it('rejects orders that miss a node, repeat one, or break an arrow', () => {
    const g: Dag = { nodes: ['a', 'b', 'c'], edges: [{ from: 'a', to: 'b' }] };
    expect(isValidOrder(g, ['a', 'b', 'c'])).toBe(true);
    expect(isValidOrder(g, ['b', 'a', 'c'])).toBe(false);
    expect(isValidOrder(g, ['a', 'b'])).toBe(false);
    expect(isValidOrder(g, ['a', 'a', 'b'])).toBe(false);
  });
});

describe('topological sort on cyclic graphs', () => {
  it('Kahn emits fewer than V exactly when no valid order exists, and the outlined cycle is real', () => {
    const rnd = mulberry32(13);
    let cyclic = 0;
    for (let t = 0; t < 400; t++) {
      const g = randomDigraph(rnd, 7);
      const k = kahn(g);
      const hasCycle = bruteCount(g) === 0;
      expect(k.order.length < g.nodes.length).toBe(hasCycle);
      const d = dfsTopo(g);
      expect(d.cycle !== null).toBe(hasCycle);
      if (hasCycle) {
        cyclic++;
        expect(isRealCycle(g, findCycle(g, k.stuck)!, k.stuck)).toBe(true);
        expect(isRealCycle(g, d.cycle!)).toBe(true);
        expect(countOrders(g)).toBe(0);
      }
    }
    expect(cyclic).toBeGreaterThan(50);
  });
});

describe('presets', () => {
  it('load acyclic, and each trap edge closes a real cycle', () => {
    for (const p of PRESETS) {
      expect(kahn(p.graph).stuck).toEqual([]);
      expect(refuseEdge(p.graph, p.trap.from, p.trap.to)).toBeNull();
      const trapped = { ...p.graph, edges: [...p.graph.edges, p.trap] };
      expect(findCycle(trapped)).not.toBeNull();
      expect(countOrders(trapped)).toBe(0);
    }
  });

  it('draw every arrow across exactly one layer, so no arrow runs behind a node', () => {
    for (const p of PRESETS) {
      const { layerOf } = layeredLayout(p.graph.nodes, p.graph.edges);
      for (const e of p.graph.edges) expect(layerOf.get(e.to)! - layerOf.get(e.from)!, `${p.id}: ${e.from} → ${e.to}`).toBe(1);
    }
  });

  it('lay out the same with or without the trap: the cycle-closing edge never moves a node', () => {
    for (const p of PRESETS) {
      const trapped = { ...p.graph, edges: [...p.graph.edges, p.trap] };
      expect(layoutEdges(trapped, p.graph)).toEqual(p.graph.edges);
      expect(findCycle({ nodes: trapped.nodes, edges: layoutEdges(trapped, p.graph) })).toBeNull();
    }
  });

  it('refuses self-loops, unknown nodes and duplicate arrows', () => {
    const g = PRESETS[0].graph;
    const e = g.edges[0];
    expect(refuseEdge(g, 'Prog 1', 'Prog 1')).toMatch(/itself/);
    expect(refuseEdge(g, 'Prog 1', 'Nope')).toMatch(/nodes/);
    expect(refuseEdge(g, e.from, e.to)).toMatch(/already/);
  });
});

describe('frames', () => {
  const combos = PRESETS.flatMap((p) =>
    [false, true].flatMap((trap) =>
      (['kahn', 'dfs'] as const).map((algo) => ({ p, trap, algo, g: trap ? { ...p.graph, edges: [...p.graph.edges, p.trap] } : p.graph })),
    ),
  );

  it.each(combos.map((c) => [`${c.p.id}${c.trap ? '+cycle' : ''} ${c.algo}`, c] as const))('%s: the ending is driven by what was emitted', (_, { g, algo }) => {
    const frames = topoFrames(g, algo);
    const last = frames[frames.length - 1];
    const text = captionText(last.say);
    const stuck = algo === 'kahn' ? kahn(g).order.length < g.nodes.length : dfsTopo(g).cycle !== null;
    if (stuck) {
      expect(text).toMatch(algo === 'kahn' ? /Jammed/ : /Cycle/);
      expect(last.output.length).toBeLessThan(g.nodes.length);
      expect(isRealCycle(g, last.cycle!)).toBe(true);
      expect(last.cycleEdges.every((i) => i >= 0)).toBe(true);
      // The cycle named in the caption is the one outlined.
      expect(text).toContain([...last.cycle!, last.cycle![0]].join(' → '));
    } else {
      expect(last.output.length).toBe(g.nodes.length);
      expect(isValidOrder(g, last.output)).toBe(true);
      expect(text).toContain(last.output.join(', '));
      expect(text).toContain(countOrders(g).toLocaleString('en'));
      expect(last.cycle).toBeNull();
    }
  });

  it('Kahn badges always equal the arrows not yet crossed off, and the caption quotes them', () => {
    for (const { g, algo } of combos.filter((c) => c.algo === 'kahn')) {
      for (const f of topoFrames(g, algo)) {
        if (!f.indeg) continue;
        const crossed = new Set(f.consumed);
        for (const n of g.nodes) expect(f.indeg[n]).toBe(g.edges.filter((e, i) => e.to === n && !crossed.has(i)).length);
        for (const m of captionText(f.say).matchAll(/(\S[^,:]*?) to (\d+)/g)) {
          if (g.nodes.includes(m[1])) expect(f.indeg[m[1]]).toBe(Number(m[2]));
        }
      }
    }
  });

  it('the DFS output is always placed at the front: each finish frame grows the output by its node', () => {
    for (const { g } of combos.filter((c) => c.algo === 'dfs' && !c.trap)) {
      const frames = topoFrames(g, 'dfs');
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].output.length > frames[i - 1].output.length) expect(frames[i].output.slice(1)).toEqual(frames[i - 1].output);
      }
    }
  });
});
