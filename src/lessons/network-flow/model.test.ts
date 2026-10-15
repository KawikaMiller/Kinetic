import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  CAP_MAX, CAP_MIN, MAX_NODES, PRESETS, addEdge, addNode, adversarialRun, applyPath, backEdges, bottleneck, checkFlow, crossingEdges, cutCapacity, edmondsKarp, flowValue, isMaximum,
  nudgeCap, presetById, reachableSet, removeEdge, residualArcs, shortestPath, unluckyNetwork, zeroFlow, type Network,
} from './model';

const NO_POS = { x: 0, y: 0 };

/** A seeded random network: node 0 is the source, the last node the sink, one direction per connected pair, capacities 1..maxCap. */
function randomNetwork(rnd: () => number, maxCap = 20): Network {
  const n = randInt(3, 8, rnd);
  const edges: Network['edges'] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (rnd() > 0.45) continue;
      const forward = rnd() < 0.75;
      edges.push({ from: forward ? a : b, to: forward ? b : a, cap: randInt(1, maxCap, rnd) });
    }
  }
  return { names: Array.from({ length: n }, (_, i) => String(i)), at: Array(n).fill(NO_POS), edges, source: 0, sink: n - 1 };
}

/** The minimum capacity over every cut: all 2^(n-2) subsets that hold the source and not the sink. */
function bruteMinCut(net: Network): number {
  const middle = net.names.map((_, v) => v).filter((v) => v !== net.source && v !== net.sink);
  let best = Infinity;
  for (let mask = 0; mask < 1 << middle.length; mask++) {
    const side = new Set([net.source, ...middle.filter((_, i) => mask & (1 << i))]);
    let cap = 0;
    for (const e of net.edges) if (side.has(e.from) && !side.has(e.to)) cap += e.cap;
    best = Math.min(best, cap);
  }
  return best;
}

const networks = (count = 1000, maxCap = 20): Network[] => {
  const rnd = mulberry32(99);
  return Array.from({ length: count }, () => randomNetwork(rnd, maxCap));
};

describe('max flow = min cut, checked by brute force', () => {
  it('Edmonds-Karp equals the minimum over all 2^(n-2) cuts on 1,000 seeded networks', () => {
    let nonTrivial = 0;
    for (const net of networks()) {
      const run = edmondsKarp(net);
      expect(run.value).toBe(bruteMinCut(net));
      if (run.value > 0) nonTrivial++;
    }
    expect(nonTrivial).toBeGreaterThan(600);
  });

  it('every result flow respects capacity, conserves flow, and its value is the net out of s and the net into t', () => {
    for (const net of networks()) {
      const run = edmondsKarp(net);
      expect(checkFlow(net, run.flow)).toEqual([]);
      const intoSink = net.edges.reduce((s, e, i) => s + (e.to === net.sink ? run.flow[i] : 0) - (e.from === net.sink ? run.flow[i] : 0), 0);
      expect(run.value).toBe(intoSink);
      expect(isMaximum(net, run.flow)).toBe(true);
    }
  });

  it('the residually-reachable side is a minimum cut: its S-to-T edges are full, its T-to-S edges are empty, its capacity is the flow', () => {
    for (const net of networks()) {
      const run = edmondsKarp(net);
      const side = reachableSet(net, run.flow);
      expect(side.has(net.source)).toBe(true);
      expect(side.has(net.sink)).toBe(false);
      expect(cutCapacity(net, side)).toBe(run.value);
      for (const i of crossingEdges(net, side)) expect(run.flow[i]).toBe(net.edges[i].cap);
      for (const i of backEdges(net, side)) expect(run.flow[i]).toBe(0);
    }
  });

  it('any cut is at least the flow, whatever the flow is (a partial flow after a few pushes)', () => {
    const rnd = mulberry32(4);
    for (const net of networks(300)) {
      const run = edmondsKarp(net);
      const partial = run.steps.slice(0, Math.floor(run.steps.length / 2));
      let flow = zeroFlow(net);
      for (const s of partial) flow = applyPath(flow, s.path, s.delta);
      const middle = net.names.map((_, v) => v).filter((v) => v !== net.source && v !== net.sink);
      const side = new Set([net.source, ...middle.filter(() => rnd() < 0.5)]);
      expect(cutCapacity(net, side)).toBeGreaterThanOrEqual(flowValue(net, flow));
    }
  });
});

describe('the cut counts only edges from the S side to the T side', () => {
  it('a back edge from T into S adds nothing to the capacity', () => {
    const net: Network = {
      names: ['s', 'a', 'b', 't'],
      at: Array(4).fill(NO_POS),
      edges: [{ from: 0, to: 1, cap: 5 }, { from: 1, to: 3, cap: 7 }, { from: 2, to: 1, cap: 50 }, { from: 0, to: 2, cap: 9 }, { from: 2, to: 3, cap: 4 }],
      source: 0,
      sink: 3,
    };
    // S = {s, a}: s->b 9 and a->t 7 cross; b->a (50) goes the other way and is not counted.
    expect(cutCapacity(net, new Set([0, 1]))).toBe(9 + 7);
    expect(backEdges(net, new Set([0, 1]))).toEqual([2]);
  });
});

describe('a flow checker that rejects broken flows', () => {
  it('flags a conservation violation and a capacity violation on a tampered maximum flow', () => {
    const net = presetById('textbook').net;
    const good = edmondsKarp(net).flow;
    expect(checkFlow(net, good)).toEqual([]);
    const leaking = [...good];
    leaking[2] -= 1; // v1->v3 sends one less than v1 receives
    expect(checkFlow(net, leaking).some((p) => p.startsWith('conservation'))).toBe(true);
    const over = [...good];
    over[8] = net.edges[8].cap + 1;
    expect(checkFlow(net, over).some((p) => p.startsWith('capacity'))).toBe(true);
    expect(checkFlow(net, good.map(() => -1)).length).toBeGreaterThan(0);
  });
});

describe('the textbook network and the unlucky one, with the spec\'s numbers', () => {
  it('textbook: max flow 23 in 3 shortest-path augmentations, and the unique minimum cut is v1-v3, v4-v3, v4-t', () => {
    const net = presetById('textbook').net;
    const run = edmondsKarp(net);
    expect(run.value).toBe(23);
    expect(run.steps).toHaveLength(3);
    const side = reachableSet(net, run.flow);
    expect([...side].map((v) => net.names[v]).sort()).toEqual(['s', 'v1', 'v2', 'v4']);
    expect(crossingEdges(net, side).map((i) => `${net.names[net.edges[i].from]}>${net.names[net.edges[i].to]}`)).toEqual(['v1>v3', 'v4>v3', 'v4>t']);
    expect(cutCapacity(net, side)).toBe(12 + 7 + 4);
    // Unique: no other cut reaches 23.
    const middle = [1, 2, 3, 4];
    let cutsAt23 = 0;
    for (let mask = 0; mask < 16; mask++) {
      const s = new Set([0, ...middle.filter((_, i) => mask & (1 << i))]);
      if (cutCapacity(net, s) === 23) cutsAt23++;
    }
    expect(cutsAt23).toBe(1);
  });

  it('unlucky: 2,000 augmentations in the scripted adversarial order, 2 in shortest-path order, both reaching flow 2,000', () => {
    const adv = adversarialRun(1000);
    expect(adv.steps).toHaveLength(2000);
    expect(adv.value).toBe(2000);
    expect(adv.steps.every((s) => s.delta === 1)).toBe(true);
    const net = unluckyNetwork(1000);
    expect(checkFlow(net, adv.flow)).toEqual([]);
    const ek = edmondsKarp(net);
    expect(ek.steps).toHaveLength(2);
    expect(ek.value).toBe(2000);
  });

  it('the adversarial count is twice the capacity, for any capacity, and each step is a legal residual path', () => {
    for (const k of [1, 2, 7, 50, 333]) {
      const net = unluckyNetwork(k);
      const adv = adversarialRun(k);
      expect(adv.steps).toHaveLength(2 * k);
      let flow = zeroFlow(net);
      for (const step of adv.steps) {
        for (const a of step.path) expect(residualArcs(net, flow).some((r) => r.edge === a.edge && r.back === a.back && r.res >= step.delta)).toBe(true);
        flow = applyPath(flow, step.path, step.delta);
        expect(checkFlow(net, flow)).toEqual([]);
      }
      expect(edmondsKarp(net).steps.length).toBeLessThanOrEqual(2);
    }
  });

  it('shortest-path-first stays under V x E augmentations whatever the capacities (caps up to 99, and the same networks with every cap x 1000)', () => {
    for (const net of networks(400, 99)) {
      const bound = net.names.length * net.edges.length;
      expect(edmondsKarp(net).steps.length).toBeLessThanOrEqual(bound);
      const huge = { ...net, edges: net.edges.map((e) => ({ ...e, cap: e.cap * 1000 })) };
      expect(edmondsKarp(huge).steps.length).toBeLessThanOrEqual(bound);
    }
  });
});

describe('once you push flow you can take it back, through a backward arc', () => {
  it('after the greedy s-a-b-t on the small unlucky network no forward-only path is left, yet the backward arc repairs it to the maximum', () => {
    const net = unluckyNetwork(1);
    const first = shortestPath(net, zeroFlow(net))!;
    // The shortest path is s-a-t (two edges); take the three-edge s-a-b-t instead, as a careless choice would.
    const careless = [0, 2, 4].map((i) => residualArcs(net, zeroFlow(net)).find((a) => a.edge === i && !a.back)!);
    expect(first).toHaveLength(2);
    const flow = applyPath(zeroFlow(net), careless, bottleneck(careless));
    expect(flowValue(net, flow)).toBe(1);
    // Forward arcs only: s-b-t cannot start (s-b has room but b-t is full) ... check by search over forward arcs.
    const forwardOnly = residualArcs(net, flow).filter((a) => !a.back);
    const reach = new Set([0]);
    for (let round = 0; round < 4; round++) for (const a of forwardOnly) if (reach.has(a.from)) reach.add(a.to);
    expect(reach.has(3)).toBe(false);
    // With backward arcs allowed, a path exists and it uses one.
    const repair = shortestPath(net, flow)!;
    expect(repair.some((a) => a.back)).toBe(true);
    expect(edmondsKarp(net, flow).value).toBe(2);
  });
});

describe('the pipeline and matching presets', () => {
  it('pipeline: the narrow pipe is the minimum cut and the flow equals it', () => {
    const net = presetById('pipeline').net;
    const run = edmondsKarp(net);
    expect(run.value).toBe(4);
    const side = reachableSet(net, run.flow);
    expect(crossingEdges(net, side).map((i) => net.edges[i].cap)).toEqual([4]);
  });

  it('matching as flow: the flow equals the largest matching, counted by brute force over edge subsets', () => {
    const net = presetById('matching').net;
    const pairs = net.edges.filter((e) => e.from >= 1 && e.from <= 3 && e.to >= 4 && e.to <= 6);
    let best = 0;
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const chosen = pairs.filter((_, i) => mask & (1 << i));
      const workers = new Set(chosen.map((e) => e.from));
      const jobs = new Set(chosen.map((e) => e.to));
      if (workers.size === chosen.length && jobs.size === chosen.length) best = Math.max(best, chosen.length);
    }
    expect(edmondsKarp(net).value).toBe(best);
    expect(best).toBe(2);
  });
});

describe('the editor refuses hostile input', () => {
  const base = presetById('textbook').net;

  it('refuses a self-loop, a parallel pipe and a pipe in the opposite direction, each with a message', () => {
    expect(addEdge(base, 1, 1)).toMatchObject({ ok: false });
    expect(addEdge(base, 0, 1)).toMatchObject({ ok: false });
    const opposite = addEdge(base, 3, 1);
    expect(opposite).toMatchObject({ ok: false });
    expect((opposite as { error: string }).error).toContain('one direction per pair');
    expect(addEdge(base, 1, 4).ok).toBe(true);
  });

  it('stops at 8 nodes, clamps capacity edits to 1..99, and steps a preset capacity above 99 down to 99 but never up', () => {
    let net = presetById('pipeline').net;
    for (let i = 0; i < 10; i++) {
      const r = addNode(net);
      if (r.ok) net = r.value;
    }
    expect(net.names).toHaveLength(MAX_NODES);
    expect(addNode(net).ok).toBe(false);
    let up = base;
    for (let i = 0; i < 30; i++) {
      const r = nudgeCap(up, 0, 5);
      if (r.ok) up = r.value;
    }
    expect(up.edges[0].cap).toBeLessThanOrEqual(CAP_MAX);
    expect(nudgeCap(up, 0, 1).ok).toBe(up.edges[0].cap < CAP_MAX);
    expect(nudgeCap({ ...base, edges: base.edges.map((e) => ({ ...e, cap: CAP_MIN })) }, 0, -1).ok).toBe(false);
    const big = unluckyNetwork(1000);
    expect(nudgeCap(big, 0, 1).ok).toBe(false);
    expect(nudgeCap(big, 0, -1)).toMatchObject({ ok: true });
    expect((nudgeCap(big, 0, -1) as { value: Network }).value.edges[0].cap).toBe(CAP_MAX);
  });

  it('random edits keep the network legal: node count, unique pairs, capacities for edited edges, s and t unchanged', () => {
    const rnd = mulberry32(21);
    let net = base;
    for (let step = 0; step < 500; step++) {
      const roll = rnd();
      const n = net.names.length;
      if (roll < 0.3) {
        const r = addEdge(net, randInt(0, n - 1, rnd), randInt(0, n - 1, rnd));
        if (r.ok) net = r.value;
      } else if (roll < 0.45) {
        const r = addNode(net);
        if (r.ok) net = r.value;
      } else if (roll < 0.55 && net.edges.length) {
        net = removeEdge(net, randInt(0, net.edges.length - 1, rnd));
      } else if (net.edges.length) {
        const r = nudgeCap(net, randInt(0, net.edges.length - 1, rnd), randInt(-5, 5, rnd));
        if (r.ok) net = r.value;
      }
      expect(net.names.length).toBeLessThanOrEqual(MAX_NODES);
      expect(net.at).toHaveLength(net.names.length);
      expect([net.source, net.sink]).toEqual([0, 5]);
      const pairs = new Set(net.edges.map((e) => [e.from, e.to].sort().join('-')));
      expect(pairs.size).toBe(net.edges.length);
      for (const e of net.edges) {
        expect(e.from).not.toBe(e.to);
        expect(e.cap).toBeGreaterThanOrEqual(CAP_MIN);
        expect(e.cap).toBeLessThanOrEqual(CAP_MAX);
      }
      expect(checkFlow(net, edmondsKarp(net).flow)).toEqual([]);
    }
  });

  it('every preset is a legal network', () => {
    for (const p of PRESETS) {
      expect(checkFlow(p.net, zeroFlow(p.net))).toEqual([]);
      expect(p.net.names.length).toBeLessThanOrEqual(MAX_NODES);
    }
  });
});
