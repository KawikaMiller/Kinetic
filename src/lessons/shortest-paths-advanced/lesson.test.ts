import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { mulberry32, randInt } from '../../core/random';
import { bfFrames, dijkstraFrames, fwFrames } from './frames';
import lesson from './index';
import { EPS, PRESETS, bellmanFord, costs, dijkstraVisited, floydWarshall, presetById, type Graph } from './model';
import { costVerdict, cycleText, distText } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const textbook = presetById('textbook');
const negCycle = presetById('negative-cycle');
const breaks = presetById('dijkstra-breaks');
const nodeIndex = (g: Graph, name: string) => g.names.indexOf(name);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the textbook graph changes 6, 1 and 0 distances in rounds 1 to 3 and stops after round 3 of a worst case of 4', () => {
    const run = bellmanFord(textbook.graph, textbook.source);
    expect(run.roundChanges).toEqual([6, 1, 0]);
    const frames = bfFrames(textbook.graph, run);
    const last = text(frames[frames.length - 1].say);
    expect(last).toContain('Done after 3 rounds (30 edge tests), not the 4 rounds the worst case allows');
    expect(lesson.tryThis[0]).toContain('rounds 1 to 3 change 6, 1, 0 distances');
    expect(lesson.tryThis[0]).toContain('after round 3 instead of the 4 rounds');
    const roundDone = frames.map((f) => text(f.say)).filter((t) => t.startsWith('Round') && t.includes('done:'));
    expect(roundDone[0]).toContain('Round 1 done: 6 distances changed');
    expect(roundDone[1]).toContain('Round 2 done: 1 distance changed');
    expect(roundDone[2]).toContain('Round 3 done: 0 distances changed');
  });

  it('try-this 2: the negative-cycle preset runs 4 rounds, the check finds edges that still lower a distance, and every node has no shortest path', () => {
    const run = bellmanFord(negCycle.graph, negCycle.source);
    expect(run.roundChanges).toHaveLength(4);
    expect(run.checkEdges.length).toBeGreaterThan(0);
    const frames = bfFrames(negCycle.graph, run);
    const all = frames.map((f) => text(f.say));
    const cycle = cycleText(negCycle.graph, run.cycle!);
    expect(cycle).toBe('t→z→x→t');
    expect(all.some((t) => t.includes(`Negative cycle ${cycle}, summing to -3`))).toBe(true);
    expect(all[all.length - 1]).toContain('No shortest path exists for s, t, y, x, z');
    expect(frames[frames.length - 1].noPath).toEqual([0, 1, 2, 3, 4]);
    expect(lesson.tryThis[1]).toContain(`after 4 rounds the check round still finds ${run.checkEdges.length} edges`);
    expect(lesson.tryThis[1]).toContain('the cycle t→z→x→t (sum -3)');
    expect(lesson.tryThis[1]).toContain('all 5 nodes read "no shortest path"');
  });

  it('try-this 3: on Dijkstra breaks, Dijkstra finalises a at 2 and skips b→a, and the true distance is 1', () => {
    const frames = dijkstraFrames(breaks.graph, breaks.source);
    const all = frames.map((f) => text(f.say));
    expect(all.some((t) => t.includes('Dijkstra finalises a at 2'))).toBe(true);
    expect(all.some((t) => t.includes('b→a (-2) would give a 1, below its 2, but a is already finalised'))).toBe(true);
    expect(all[all.length - 1]).toContain('Dijkstra is wrong at a: a 2 against the true 1');
    expect(frames[frames.length - 1].wrong).toEqual([nodeIndex(breaks.graph, 'a')]);
    expect(lesson.tryThis[2]).toContain('finalises a at 2 and skips b→a, but the true distance is 1');
  });

  it('try-this 4: on the negative-cycle preset Floyd-Warshall stops at k = t where x→x reads -1', () => {
    const run = floydWarshall(negCycle.graph);
    const frames = fwFrames(negCycle.graph, run);
    const last = text(frames[frames.length - 1].say);
    expect(last).toContain('x→x is now -1');
    expect(last).toContain('The run stops at the first sign, at k = t');
    expect(lesson.tryThis[3]).toContain('at k = t the diagonal entry x→x reads -1');
    // Nothing after the stop: the final step is the one with the negative diagonal.
    expect(run.steps[run.steps.length - 1].negativeDiagonal).toEqual([nodeIndex(negCycle.graph, 'x')]);
    expect(run.steps.slice(0, -1).every((s) => s.negativeDiagonal.length === 0)).toBe(true);
  });

  it('try-this 5: on the textbook graph Bellman-Ford makes 30 edge tests from s, 150 over every source, and Floyd-Warshall 125', () => {
    const c = costs(textbook.graph, bellmanFord(textbook.graph, 0), floydWarshall(textbook.graph));
    // Independent count: 5 sources, each run's rounds (until a no-change round or n - 1 plus the check) x 10 edges.
    let independent = 0;
    for (let s = 0; s < 5; s++) {
      const d = Array<number>(5).fill(Infinity);
      d[s] = 0;
      let rounds = 0;
      let changed = false;
      for (;;) {
        rounds++;
        changed = false;
        for (const e of textbook.graph.edges) {
          if (d[e.from] + e.w < d[e.to] - EPS) {
            d[e.to] = d[e.from] + e.w;
            changed = true;
          }
        }
        if (!changed || rounds === 4) break;
      }
      independent += (rounds + (changed ? 1 : 0)) * 10; // a last round that still changed is followed by the check round
    }
    expect(c.bellmanFordAll).toBe(independent);
    expect(c).toMatchObject({ bellmanFordOne: 30, floydWarshall: 125 });
    expect(lesson.tryThis[4]).toContain(`Bellman-Ford from s makes 30 edge tests, from every node ${independent}, and Floyd-Warshall 125`);
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every preset x every source node through all three step-through scenes: no NaN, no raw Infinity, no glued sentence', () => {
    let frames = 0;
    for (const p of PRESETS) {
      for (let source = 0; source < p.graph.names.length; source++) {
        const run = bellmanFord(p.graph, source);
        const lists = [bfFrames(p.graph, run), dijkstraFrames(p.graph, source), fwFrames(p.graph, floydWarshall(p.graph))];
        for (const list of lists) {
          for (const f of list) {
            const t = text(f.say);
            expect(t, `${p.id} from ${source}`).not.toMatch(/NaN|undefined|Infinity|null/);
            frames++;
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(300);
  });

  it('every Bellman-Ford frame shows the distances an independent step-by-step run has at that edge test', () => {
    const rnd = mulberry32(77);
    for (let trial = 0; trial < 150; trial++) {
      const n = randInt(2, 6, rnd);
      const edges: Graph['edges'] = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b && rnd() < 0.4) edges.push({ from: a, to: b, w: randInt(-9, 9, rnd) });
      const g: Graph = { names: Array.from({ length: n }, (_, i) => String(i)), at: Array(n).fill({ x: 0, y: 0 }), edges };
      const frames = bfFrames(g, bellmanFord(g, 0));
      const d = Array<number>(n).fill(Infinity);
      d[0] = 0;
      expect(frames[0].dist).toEqual(d);
      let k = 1;
      for (let round = 1; round <= n - 1; round++) {
        let changed = 0;
        for (const e of edges) {
          if (d[e.from] !== Infinity && d[e.from] + e.w < d[e.to]) {
            d[e.to] = d[e.from] + e.w;
            changed++;
          }
          if (frames[k].edge !== null) expect(frames[k].dist).toEqual(d);
          k++;
        }
        k++; // the round-done frame
        if (changed === 0) break;
      }
    }
  });

  it('the cost sentence quotes the counts on screen, and names the cheaper side', () => {
    for (const p of PRESETS) {
      const c = costs(p.graph, bellmanFord(p.graph, p.source), floydWarshall(p.graph));
      const t = costVerdict(c);
      expect(t).toContain(String(c.bellmanFordAll < c.floydWarshall ? c.bellmanFordAll : c.floydWarshall));
      expect(t).toContain(String(Math.max(c.bellmanFordAll, c.floydWarshall)));
      if (c.bellmanFordAll < c.floydWarshall) expect(t).toContain('Bellman-Ford from every source is cheaper');
      else if (c.floydWarshall < c.bellmanFordAll) expect(t).toContain('Floyd-Warshall is cheaper');
      else expect(t).toContain('cost the same');
      expect(t.includes('partial run')).toBe(c.floydWarshall < c.floydWarshallFull);
    }
  });

  it('distance text: infinity reads as the symbol, a missing shortest path as its words, a market weight to three decimals', () => {
    expect(distText(textbook.graph, Infinity)).toBe('∞');
    expect(distText(textbook.graph, -Infinity)).toBe('no shortest path');
    expect(distText(presetById('arbitrage').graph, -0.0516432)).toBe('-0.052');
  });
});

describe('claims on screen that the tests have to back', () => {
  it('"the same graph with its edges listed the other way round can need a different number of rounds, and the distances are the same"', () => {
    const reversed: Graph = { ...textbook.graph, edges: [...textbook.graph.edges].reverse() };
    const a = bellmanFord(textbook.graph, 0);
    const b = bellmanFord(reversed, 0);
    expect(b.dist).toEqual(a.dist);
    expect(b.roundChanges).not.toEqual(a.roundChanges);
  });

  it('on the Dijkstra breaks graph the visited-set answer for a is above the true distance', () => {
    const truth = bellmanFord(breaks.graph, 0);
    expect(dijkstraVisited(breaks.graph, 0).dist[1]).toBeGreaterThan(truth.dist[1]);
  });
});
