import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH, applyEffects, choose, enumeratePaths, findEnding, isBad, isEnding, ledger, redMeters, startWalk, undo, validateScenario,
  type Problem, type ProblemKind, type Scenario,
} from './scenario';

/** A small valid scenario to break one way at a time: four paths, two decisions each. */
const GOOD: Scenario = {
  start: 'a',
  meters: [{ id: 'm', label: 'Meter', start: 5, min: 0, max: 10, bad: { above: 8 } }],
  nodes: [
    { id: 'a', prompt: 'First?', choices: [{ id: 'a1', label: 'Up', to: 'b', effects: { m: 2 }, because: 'It goes up.' }, { id: 'a2', label: 'Down', to: 'b', effects: { m: -2 }, because: 'It goes down.' }] },
    { id: 'b', prompt: 'Second?', choices: [{ id: 'b1', label: 'Stay', to: 'end1', because: 'No change.' }, { id: 'b2', label: 'Up', to: 'end2', effects: { m: 3 }, because: 'It goes up.' }] },
  ],
  endings: [{ id: 'end1', title: 'One', text: 'One.' }, { id: 'end2', title: 'Two', text: 'Two.' }],
};

const problems = (s: Scenario, allowCycles = false): Problem[] => validateScenario(s, { allowCycles });
const kinds = (s: Scenario): ProblemKind[] => problems(s).map((p) => p.kind);
const nodeEdit = (s: Scenario, id: string, patch: Partial<Scenario['nodes'][number]>): Scenario => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

describe('validateScenario', () => {
  it('passes a good scenario', () => {
    expect(validateScenario(GOOD)).toEqual([]);
  });

  it('names a start that is not a node', () => {
    expect(problems({ ...GOOD, start: 'nowhere' })).toContainEqual({ kind: 'start', detail: 'the start nowhere is not a node' });
  });

  it('finds an id that two things share, node and ending alike', () => {
    expect(kinds({ ...GOOD, endings: [...GOOD.endings, { id: 'a', title: 'Dup', text: '' }] })).toContain('duplicate-id');
    expect(kinds({ ...GOOD, nodes: [...GOOD.nodes, { ...GOOD.nodes[0] }] })).toContain('duplicate-id');
  });

  it('finds a choice that leads nowhere, and names it', () => {
    const broken = nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'x', to: 'ghost', because: 'x' }] });
    expect(problems(broken).find((p) => p.kind === 'missing-target')!.detail).toContain('a/a1 leads to ghost');
  });

  it('finds a node no path reaches and an ending no path reaches', () => {
    const orphan = { ...GOOD, nodes: [...GOOD.nodes, { id: 'orphan', prompt: '?', choices: [{ id: 'o1', label: 'x', to: 'end1', because: 'x' }] }] };
    expect(problems(orphan)).toEqual([{ kind: 'unreachable-node', detail: 'orphan cannot be reached from the start' }]);
    expect(problems({ ...GOOD, endings: [...GOOD.endings, { id: 'end3', title: 'Never', text: '' }] })).toEqual([{ kind: 'unreachable-ending', detail: 'end3 cannot be reached from the start' }]);
  });

  it('finds a node with no choices that is not an ending', () => {
    expect(problems(nodeEdit(GOOD, 'b', { choices: [] })).map((p) => p.kind)).toContain('dead-end');
    expect(problems(nodeEdit(GOOD, 'b', { choices: [] })).find((p) => p.kind === 'dead-end')!.detail).toContain('b has no choices');
  });

  it('finds a cycle by default, and a path that runs past the depth cap', () => {
    expect(kinds(nodeEdit(GOOD, 'b', { choices: [{ id: 'b1', label: 'Back', to: 'a', because: 'x' }] }))).toContain('cycle');
    const length = MAX_DEPTH + 5;
    const chain: Scenario = {
      start: 'n0',
      meters: [],
      nodes: Array.from({ length }, (_, i) => ({ id: `n${i}`, prompt: '?', choices: [{ id: 'go', label: 'Go', to: i === length - 1 ? 'end' : `n${i + 1}`, because: 'x' }] })),
      endings: [{ id: 'end', title: 'End', text: '' }],
    };
    expect(problems(chain).map((p) => p.kind)).toEqual(['cycle']);
  });

  it('finds a choice that moves something that is not a meter', () => {
    expect(kinds(nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'Odd', to: 'b', effects: { nope: 1 }, because: 'x' }] }))).toContain('unknown-meter');
  });

  it('finds a meter that starts outside its bounds', () => {
    expect(problems({ ...GOOD, meters: [{ ...GOOD.meters[0], start: 99 }] })[0]).toEqual({ kind: 'out-of-bounds', detail: 'm starts outside its bounds' });
  });

  it('reports every kind of problem in one scenario, once each kind is present', () => {
    const everything: Scenario = {
      start: 'nowhere',
      meters: [{ id: 'm', label: 'M', start: 99, min: 0, max: 10, bad: { above: 8 } }],
      nodes: [
        { id: 'a', prompt: '?', choices: [{ id: 'a1', label: 'x', to: 'ghost', effects: { nope: 1 }, because: 'x' }] },
        { id: 'a', prompt: '?', choices: [] },
        { id: 'orphan', prompt: '?', choices: [{ id: 'o1', label: 'x', to: 'end', because: 'x' }] },
      ],
      endings: [{ id: 'end', title: 'End', text: '' }, { id: 'lost', title: 'Lost', text: '' }],
    };
    expect(new Set(kinds(everything))).toEqual(new Set<ProblemKind>(['start', 'duplicate-id', 'missing-target', 'unknown-meter', 'out-of-bounds', 'dead-end', 'unreachable-node', 'unreachable-ending']));
  });
});

describe('validateScenario: meter bounds on every path', () => {
  const huge = nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'Huge', to: 'b', effects: { m: 20 }, because: 'x' }] });

  it('fails when any single path leaves the bounds at any step, above or below', () => {
    expect(kinds(huge)).toContain('out-of-bounds');
    expect(kinds(nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'Drop', to: 'b', effects: { m: -6 }, because: 'x' }] }))).toContain('out-of-bounds');
  });

  it('names the nodes on the path, the last choice, the meter and the sum, with no clamping', () => {
    const broken = nodeEdit(GOOD, 'b', { choices: [{ id: 'b1', label: 'Big', to: 'end1', effects: { m: 4 }, because: 'x' }, GOOD.nodes[1].choices[1]] });
    // 5 + 2 + 4 = 11 > 10 on the path a1, b1 (the detail lists the nodes passed, then the choice that broke it)
    expect(problems(broken).find((p) => p.kind === 'out-of-bounds')!.detail).toBe('a > b > b1 puts m at 11, outside 0 to 10');
  });

  it('catches a path that crosses the edge and comes back, though it ends inside', () => {
    const detour: Scenario = {
      ...GOOD,
      nodes: [
        { id: 'a', prompt: '?', choices: [{ id: 'up', label: 'Up', to: 'b', effects: { m: 9 }, because: 'x' }] },
        { id: 'b', prompt: '?', choices: [{ id: 'down', label: 'Down', to: 'end1', effects: { m: -9 }, because: 'x' }] },
      ],
    };
    expect(kinds({ ...detour, endings: [GOOD.endings[0]] })).toEqual(['out-of-bounds']);
  });

  it('still reports a bound break on a path whose next step is a dead end', () => {
    const cut = nodeEdit(huge, 'b', { choices: [] });
    expect(kinds(cut)).toEqual(expect.arrayContaining(['out-of-bounds', 'dead-end']));
  });
});

describe('validateScenario with allowCycles', () => {
  const looping = nodeEdit(GOOD, 'b', { choices: [...GOOD.nodes[1].choices, { id: 'b3', label: 'Again', to: 'a', because: 'Go round once more.' }] });

  it('rejects a looping scenario by default and accepts it when the loop is meant, while every other problem is still reported', () => {
    expect(kinds(looping)).toContain('cycle');
    expect(validateScenario(looping, { allowCycles: true })).toEqual([]);
    const huge = nodeEdit(looping, 'a', { choices: [{ id: 'a1', label: 'Huge', to: 'b', effects: { m: 20 }, because: 'x' }] });
    expect(problems(huge, true).map((p) => p.kind)).toContain('out-of-bounds');
    expect(problems({ ...looping, endings: [...looping.endings, { id: 'end3', title: 'Never', text: '' }] }, true).map((p) => p.kind)).toContain('unreachable-ending');
    expect(problems(nodeEdit(looping, 'a', { choices: [] }), true).map((p) => p.kind)).toContain('dead-end');
  });
});

describe('enumeratePaths', () => {
  const paths = enumeratePaths(GOOD);

  it('lists every path from the start to an ending, in choice order', () => {
    expect(paths.map((p) => p.choices.join('/'))).toEqual(['a1/b1', 'a1/b2', 'a2/b1', 'a2/b2']);
    expect(paths.map((p) => p.endingId)).toEqual(['end1', 'end2', 'end1', 'end2']);
  });

  it('sums the effects along each path from the meters’ start', () => {
    expect(paths.map((p) => p.meters.m)).toEqual([7, 10, 3, 6]);
  });

  it('counts a branching scenario by hand: two choices at each of two decisions is four paths, and every ending is reached', () => {
    expect(paths).toHaveLength(4);
    expect(new Set(paths.map((p) => p.endingId))).toEqual(new Set(GOOD.endings.map((e) => e.id)));
  });

  it('agrees with the validator: a scenario that validates has every path inside the bounds', () => {
    expect(validateScenario(GOOD)).toEqual([]);
    for (const p of paths) {
      for (const m of GOOD.meters) {
        expect(p.meters[m.id]).toBeGreaterThanOrEqual(m.min);
        expect(p.meters[m.id]).toBeLessThanOrEqual(m.max);
      }
    }
  });
});

describe('walking a scenario', () => {
  it('applies a choice’s effects to the meters and records the path, and ignores a choice that is not at this node', () => {
    const w = choose(GOOD, startWalk(GOOD), 'a1');
    expect(w).toMatchObject({ at: 'b', meters: { m: 7 }, path: [{ node: 'a', choice: 'a1' }] });
    expect(choose(GOOD, w, 'a2')).toBe(w);
    const end = choose(GOOD, w, 'b2');
    expect(end.at).toBe('end2');
    expect(isEnding(GOOD, end.at)).toBe(true);
    expect(findEnding(GOOD, end.at)!.title).toBe('Two');
    expect(choose(GOOD, end, 'a1')).toBe(end);
  });

  it('undoes by replaying the rest of the path, so the meters always equal the sum of the effects chosen, for every path', () => {
    for (const p of enumeratePaths(GOOD)) {
      let w = startWalk(GOOD);
      for (const id of p.choices) w = choose(GOOD, w, id);
      let back = w;
      for (let k = p.choices.length - 1; k >= 0; k--) {
        back = undo(GOOD, back);
        expect(back.path).toHaveLength(k);
        for (const m of GOOD.meters) {
          const summed = ledger(GOOD, back).reduce((s, r) => s + (r.choice.effects?.[m.id] ?? 0), m.start);
          expect(back.meters[m.id]).toBe(summed);
        }
      }
      expect(back).toEqual(startWalk(GOOD));
    }
    expect(undo(GOOD, startWalk(GOOD))).toEqual(startWalk(GOOD));
  });

  it('reads a meter as in the red exactly beyond its edge, on both kinds of edge', () => {
    const above = { id: 'x', label: 'x', start: 0, min: 0, max: 10, bad: { above: 5 } };
    const below = { id: 'y', label: 'y', start: 10, min: 0, max: 10, bad: { below: 5 } };
    expect([4, 5, 6].map((v) => isBad(above, v))).toEqual([false, false, true]);
    expect([4, 5, 6].map((v) => isBad(below, v))).toEqual([true, false, false]);
    expect(applyEffects({ m: 1 }, { m: 2, n: 3 })).toEqual({ m: 3, n: 3 });
  });

  it('lists the meters in the red at a walk’s values', () => {
    const w = choose(GOOD, choose(GOOD, startWalk(GOOD), 'a1'), 'b2');
    expect(redMeters(GOOD, w.meters).map((m) => m.id)).toEqual(['m']);
    expect(redMeters(GOOD, startWalk(GOOD).meters)).toEqual([]);
  });
});
