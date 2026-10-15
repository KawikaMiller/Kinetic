import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { scenarioCaption } from './captions';
import { BECAUSE_CLAIM, CLARITY, DAYS, PROPOSAL, SURPRISE } from './proposal';
import {
  applyEffects, choose, enumeratePaths, findEnding, isBad, ledger, redMeters, startWalk, undo, validateScenario, type Problem, type ProblemKind, type Scenario,
} from './scenario';

/** A small valid scenario to break one way at a time. */
const GOOD: Scenario = {
  start: 'a',
  meters: [{ id: 'm', label: 'Meter', start: 5, min: 0, max: 10, bad: { above: 8 } }],
  nodes: [
    { id: 'a', prompt: 'First?', choices: [{ id: 'a1', label: 'Up', to: 'b', effects: { m: 2 }, because: 'It goes up.' }, { id: 'a2', label: 'Down', to: 'b', effects: { m: -2 }, because: 'It goes down.' }] },
    { id: 'b', prompt: 'Second?', choices: [{ id: 'b1', label: 'Stay', to: 'end1', because: 'No change.' }, { id: 'b2', label: 'Up', to: 'end2', effects: { m: 3 }, because: 'It goes up.' }] },
  ],
  endings: [{ id: 'end1', title: 'One', text: 'One.' }, { id: 'end2', title: 'Two', text: 'Two.' }],
};

const kinds = (s: Scenario): ProblemKind[] => validateScenario(s).map((p: Problem) => p.kind);
const nodeEdit = (s: Scenario, id: string, patch: Partial<Scenario['nodes'][number]>): Scenario => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

describe('validateScenario', () => {
  it('passes a good scenario and the lesson’s own review scenario', () => {
    expect(validateScenario(GOOD)).toEqual([]);
    expect(validateScenario(PROPOSAL)).toEqual([]);
  });

  it('fails a deliberately broken scenario, once for each way it can be broken', () => {
    expect(kinds({ ...GOOD, start: 'nowhere' })).toContain('start');
    expect(kinds({ ...GOOD, endings: [...GOOD.endings, { id: 'a', title: 'Dup', text: '' }] })).toContain('duplicate-id');
    expect(kinds(nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'x', to: 'ghost', because: 'x' }] }))).toContain('missing-target');
    expect(kinds({ ...GOOD, nodes: [...GOOD.nodes, { id: 'orphan', prompt: '?', choices: [{ id: 'o1', label: 'x', to: 'end1', because: 'x' }] }] })).toContain('unreachable-node');
    expect(kinds({ ...GOOD, endings: [...GOOD.endings, { id: 'end3', title: 'Never', text: '' }] })).toContain('unreachable-ending');
    expect(kinds(nodeEdit(GOOD, 'b', { choices: [] }))).toContain('dead-end');
    expect(kinds(nodeEdit(GOOD, 'b', { choices: [{ id: 'b1', label: 'Back', to: 'a', because: 'x' }] }))).toContain('cycle');
    expect(kinds(nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'Huge', to: 'b', effects: { m: 20 }, because: 'x' }] }))).toContain('out-of-bounds');
    expect(kinds(nodeEdit(GOOD, 'a', { choices: [{ id: 'a1', label: 'Odd', to: 'b', effects: { nope: 1 }, because: 'x' }] }))).toContain('unknown-meter');
    expect(kinds({ ...GOOD, meters: [{ ...GOOD.meters[0], start: 99 }] })).toContain('out-of-bounds');
  });

  it('names an out-of-bounds path, not just the fact: the sum along the path, with no clamping', () => {
    const broken = nodeEdit(GOOD, 'b', { choices: [{ id: 'b1', label: 'Big', to: 'end1', effects: { m: 4 }, because: 'x' }, GOOD.nodes[1].choices[1]] });
    // 5 + 2 + 4 = 11 > 10 on the path a1, b1
    expect(validateScenario(broken).find((p) => p.kind === 'out-of-bounds')!.detail).toContain('11');
  });
});

describe('validateScenario with allowCycles', () => {
  const looping = nodeEdit(GOOD, 'b', { choices: [...GOOD.nodes[1].choices, { id: 'b3', label: 'Again', to: 'a', because: 'Go round once more.' }] });

  it('rejects a looping scenario by default and accepts it when the loop is meant, while every other problem is still reported', () => {
    expect(kinds(looping)).toContain('cycle');
    expect(validateScenario(looping, { allowCycles: true })).toEqual([]);
    const huge = nodeEdit(looping, 'a', { choices: [{ id: 'a1', label: 'Huge', to: 'b', effects: { m: 20 }, because: 'x' }] });
    expect(validateScenario(huge, { allowCycles: true }).map((p) => p.kind)).toContain('out-of-bounds');
    expect(validateScenario({ ...looping, endings: [...looping.endings, { id: 'end3', title: 'Never', text: '' }] }, { allowCycles: true }).map((p) => p.kind)).toContain('unreachable-ending');
    expect(validateScenario(nodeEdit(looping, 'a', { choices: [] }), { allowCycles: true }).map((p) => p.kind)).toContain('dead-end');
  });
});

describe('the review scenario: every ending reachable, every path in bounds', () => {
  const paths = enumeratePaths(PROPOSAL);

  it('has 12 paths of three decisions, reaching every one of the six endings', () => {
    expect(paths).toHaveLength(12);
    for (const p of paths) expect(p.choices).toHaveLength(3);
    expect(new Set(paths.map((p) => p.endingId))).toEqual(new Set(PROPOSAL.endings.map((e) => e.id)));
  });

  it('keeps every meter inside its bounds on every path at the end and at each step, summed from the start with no clamping', () => {
    for (const p of paths) {
      for (const m of PROPOSAL.meters) {
        expect(p.meters[m.id]).toBeGreaterThanOrEqual(m.min);
        expect(p.meters[m.id]).toBeLessThanOrEqual(m.max);
      }
    }
  });

  it('puts at least one meter in the red on every path, so the best path is not free, while some path has just one', () => {
    const reds = paths.map((p) => redMeters(PROPOSAL, p.meters).length);
    expect(reds.every((n) => n >= 1)).toBe(true);
    expect(reds.some((n) => n === 1)).toBe(true);
  });

  it('starts with no meter in the red', () => {
    expect(redMeters(PROPOSAL, startWalk(PROPOSAL).meters)).toEqual([]);
  });

  it('gives every choice a reason and a claim label', () => {
    for (const node of PROPOSAL.nodes) {
      for (const c of node.choices) {
        expect(c.because.length, c.id).toBeGreaterThan(20);
        expect(BECAUSE_CLAIM[c.id], c.id).toBeDefined();
      }
    }
  });

  it('try-this 5: one page, objectors invited first, dissent recorded leaves only days to a decision in the red', () => {
    let w = startWalk(PROPOSAL);
    for (const id of ['short', 'objectors-short-early', 'early-record']) w = choose(PROPOSAL, w, id);
    expect(findEnding(PROPOSAL, w.at)!.id).toBe('early-recorded');
    expect(w.meters[CLARITY]).toBe(11);
    expect(w.meters[DAYS]).toBe(7);
    expect(w.meters[SURPRISE]).toBe(5);
    expect(redMeters(PROPOSAL, w.meters).map((m) => m.id)).toEqual([DAYS]);
    expect(expectCaption(scenarioCaption(PROPOSAL, w))).toContain('days to a decision 7 days');
  });
});

describe('walking a scenario', () => {
  it('applies a choice’s effects to the meters and records the path, and ignores a choice that is not at this node', () => {
    const w = choose(GOOD, startWalk(GOOD), 'a1');
    expect(w).toMatchObject({ at: 'b', meters: { m: 7 }, path: [{ node: 'a', choice: 'a1' }] });
    expect(choose(GOOD, w, 'a2')).toBe(w);
    const end = choose(GOOD, w, 'b2');
    expect(end.at).toBe('end2');
    expect(choose(GOOD, end, 'a1')).toBe(end);
  });

  it('undoes by replaying the rest of the path, so the meters always equal the sum of the effects chosen, for every path', () => {
    for (const p of enumeratePaths(PROPOSAL)) {
      let w = startWalk(PROPOSAL);
      for (const id of p.choices) w = choose(PROPOSAL, w, id);
      let back = w;
      for (let k = p.choices.length - 1; k >= 0; k--) {
        back = undo(PROPOSAL, back);
        expect(back.path).toHaveLength(k);
        for (const m of PROPOSAL.meters) {
          const summed = ledger(PROPOSAL, back).reduce((s, r) => s + (r.choice.effects?.[m.id] ?? 0), m.start);
          expect(back.meters[m.id]).toBe(summed);
        }
      }
      expect(back).toEqual(startWalk(PROPOSAL));
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

  it('writes a caption for each decision and ending from the walk', () => {
    expect(expectCaption(scenarioCaption(PROPOSAL, startWalk(PROPOSAL)))).toContain('How long do you make the version you circulate');
    const w = choose(PROPOSAL, startWalk(PROPOSAL), 'long');
    const text = expectCaption(scenarioCaption(PROPOSAL, w));
    expect(text).toContain('You chose "A twelve-page doc"');
    expect(text).toContain('When do you bring them in');
  });
});
