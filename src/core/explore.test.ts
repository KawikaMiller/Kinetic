import { describe, expect, it } from 'vitest';
import { explore, type Transition } from './explore';

/** A toy: a counter that starts at 0 and may add 1 or 2. The invariant forbids reaching `bad`. */
const counter = (bad: number, limit = 40) => ({
  init: 0,
  actions: (n: number): Transition<number, string>[] => (n >= limit ? [] : [{ label: '+1', next: n + 1 }, { label: '+2', next: n + 2 }]),
  key: String,
  invariant: (n: number) => (n === bad ? `reached ${bad}` : null),
});

/** The shortest number of +1/+2 steps to reach n, by the closed form ceil(n / 2). */
const fewestSteps = (n: number) => Math.ceil(n / 2);

describe('explore: shortest counterexample', () => {
  it('finds a planted violation at its shortest depth (closed form ceil(n / 2))', () => {
    for (const bad of [1, 2, 7, 10, 13]) {
      const r = explore(counter(bad));
      expect(r.violation?.message).toBe(`reached ${bad}`);
      expect(r.violation?.path.length).toBe(fewestSteps(bad));
      expect(r.violation?.path.at(-1)?.state).toBe(bad);
    }
  });

  it('the path replays: each step is one of the offered actions from the previous state', () => {
    const spec = counter(9);
    const r = explore(spec);
    let state = spec.init;
    for (const step of r.violation!.path) {
      expect(spec.actions(state).some((t) => t.label === step.label && t.next === step.state)).toBe(true);
      state = step.state;
    }
  });

  it('a violation in the initial state is a path of length 0', () => {
    const r = explore({ ...counter(0) });
    expect(r.violation?.path).toEqual([]);
  });

  it('reports no violation and a full count when the invariant holds everywhere', () => {
    const r = explore({ ...counter(-1, 10) });
    // 9 steps to 10 or 11, and a state at the limit has no actions: 0..11 is 12 states, the deepest (11) at depth 6
    expect(r.violation).toBeNull();
    expect(r.states).toBe(12);
    expect(r.truncated).toBe(false);
    expect(r.depth).toBe(6);
  });
});

describe('explore: budgets are reported honestly', () => {
  it('maxStates smaller than the space truncates, and larger does not', () => {
    const spec = counter(-1, 10);
    const small = explore({ ...spec, maxStates: 5 });
    expect(small.truncated).toBe(true);
    expect(small.states).toBe(5);
    expect(explore({ ...spec, maxStates: 12 }).truncated).toBe(false);
    expect(explore({ ...spec, maxStates: 11 }).truncated).toBe(true);
    expect(explore({ ...spec, maxStates: 100 }).truncated).toBe(false);
  });

  it('maxDepth truncates only when something lies beyond it', () => {
    const spec = counter(-1, 10);
    const cut = explore({ ...spec, maxDepth: 3 });
    expect(cut.truncated).toBe(true);
    expect(cut.depth).toBe(3);
    expect(explore({ ...spec, maxDepth: 6 }).truncated).toBe(false);
  });

  it('a violation beyond the budget is not found, and the result says it did not finish', () => {
    const r = explore({ ...counter(30), maxStates: 10 });
    expect(r.violation).toBeNull();
    expect(r.truncated).toBe(true);
  });

  it('defaults to 250,000 states', () => {
    const grid = {
      init: [0, 0] as [number, number],
      actions: ([x, y]: [number, number]): Transition<[number, number], string>[] => [{ label: 'x', next: [x + 1, y] }, { label: 'y', next: [x, y + 1] }],
      key: ([x, y]: [number, number]) => `${x},${y}`,
      maxDepth: 1000,
    };
    const r = explore(grid);
    expect(r.truncated).toBe(true);
    expect(r.states).toBe(250_000);
  });
});

describe('explore: visit callback and graph', () => {
  it('visits each state once in discovery order with its BFS depth', () => {
    const seen: [number, number, number][] = [];
    explore({ ...counter(-1, 4), onVisit: (v) => seen.push([v.index, v.state, v.depth]) });
    expect(seen.map((v) => v[0])).toEqual(seen.map((_, i) => i));
    expect(new Set(seen.map((v) => v[1])).size).toBe(seen.length);
    for (const [, n, depth] of seen) expect(depth).toBe(fewestSteps(n));
  });

  it('returns the graph on request: every expanded edge, including ones back to seen states', () => {
    const r = explore({ ...counter(-1, 3), graph: true });
    const g = r.graph!;
    expect(g.states).toHaveLength(r.states);
    expect(g.edges[0].map((e) => g.states[e.to])).toEqual([1, 2]);
    // from 1: +1 -> 2 (already seen), +2 -> 3
    expect(g.edges[g.states.indexOf(1)].map((e) => g.states[e.to])).toEqual([2, 3]);
    expect(explore(counter(-1, 3)).graph).toBeUndefined();
  });

  it('the graph supports valency-style back-propagation (which states can reach a target)', () => {
    const r = explore({ ...counter(-1, 6), graph: true });
    const { states, edges } = r.graph!;
    const reaches = states.map((s) => s === 5);
    for (let changed = true; changed; ) {
      changed = false;
      edges.forEach((out, i) => {
        if (!reaches[i] && out.some((e) => reaches[e.to])) {
          reaches[i] = true;
          changed = true;
        }
      });
    }
    // 5 is reachable from every n <= 5, and from 6 it is not
    expect(states.filter((_, i) => reaches[i]).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
