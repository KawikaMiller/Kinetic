import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { greedyFrames } from './frames';
import lesson from './index';
import { ORDERS, PRESETS, byName, chromatic, greedyColour, identityOrder, presetById, twoColour } from './model';
import { bound, boundCaption, hardCaption, timetable, timetableCaption } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const crown = presetById('crown').graph;
const timetableGraph = presetById('timetable').graph;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the Crown graph in the order as given ends with 4 colours against a true minimum of 2, and the last caption says so', () => {
    const run = greedyColour(crown, identityOrder(8));
    expect(run.used).toBe(4);
    const frames = greedyFrames(crown, run);
    expect(frames[frames.length - 1].colours).toEqual(run.colours);
    const last = text(frames[frames.length - 1].say);
    expect(last).toContain('Greedy used 4 colours; the exact minimum is 2, so this order wasted 2 colours');
    expect(lesson.tryThis[0]).toContain('ends with 4 colours');
    expect(lesson.tryThis[0]).toContain('true minimum is 2');
  });

  it('try-this 2: by name (a1 to a4, then b1 to b4) needs 2 colours', () => {
    expect(byName(crown).map((v) => crown.names[v])).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']);
    const run = greedyColour(crown, byName(crown));
    expect(run.used).toBe(2);
    const frames = greedyFrames(crown, run);
    expect(text(frames[frames.length - 1].say)).toContain('Greedy used 2 colours, and the exact minimum is 2');
    expect(lesson.tryThis[1]).toContain('needs only 2 colours');
  });

  it('try-this 3: on the Crown graph the degree bound is 4, as given uses 4, smallest-last uses a number at or under the degeneracy + 1', () => {
    const b = bound(crown, identityOrder(8));
    expect(b.degreeBound).toBe(4);
    expect(b.yours).toBe(4);
    expect(b.smallestLast).toBeLessThanOrEqual(b.degeneracyBound);
    expect(b.optimum).toBe(2);
    expect(boundCaption(b)).toContain(`never above the maximum degree + 1 = 4`);
    expect(lesson.tryThis[2]).toContain('maximum degree + 1 is 4');
    expect(lesson.tryThis[2]).toContain(`smallest-last uses ${b.smallestLast}`);
    expect(lesson.tryThis[2]).toContain(`degeneracy + 1 is ${b.degeneracyBound}`);
  });

  it('try-this 4: on the timetable, greedy as listed is clash-free and uses more slots than the exact minimum, both clash-free', () => {
    const greedy = greedyColour(timetableGraph, identityOrder(timetableGraph.names.length));
    const best = chromatic(timetableGraph);
    expect(timetable(timetableGraph, greedy.colours)).toMatchObject({ conflicts: 0, complete: true, slots: greedy.used });
    expect(timetable(timetableGraph, best.colours)).toMatchObject({ conflicts: 0, complete: true, slots: best.number });
    expect(greedy.used).toBe(4);
    expect(best.number).toBe(3);
    expect(timetableCaption(timetable(timetableGraph, greedy.colours))).toContain('A clash-free timetable in 4 slots. Greedy (courses in the order listed) uses 4 slots; the exact minimum is 3.');
    expect(lesson.tryThis[3]).toContain('use 4 slots with no clashes');
    expect(lesson.tryThis[3]).toContain('uses 3');
  });

  it('try-this 5: the odd cycle fails the sweep on a cycle of 5 with an exact minimum of 3; the crown graph passes', () => {
    const odd = presetById('odd').graph;
    expect(hardCaption(odd)).toContain('v1–v2–v3–v4–v5 is an odd cycle');
    expect(hardCaption(odd)).toContain('The exact minimum here is 3');
    expect(twoColour(crown).ok).toBe(true);
    expect(hardCaption(crown)).toContain('finds a two-colouring');
    expect(lesson.tryThis[4]).toContain('odd cycle of 5');
    expect(lesson.tryThis[4]).toContain('exact minimum is 3');
  });
});

describe('every caption reads cleanly and is computed from the state', () => {
  it('walks every preset x every order through the step-through scene and the bound scene: no NaN, right counts, no glued sentence', () => {
    let frames = 0;
    for (const p of PRESETS) {
      for (const o of ORDERS) {
        const order = o.build(p.graph);
        const run = greedyColour(p.graph, order);
        const list = greedyFrames(p.graph, run);
        expect(list).toHaveLength(p.graph.names.length + 2);
        for (const f of list) {
          expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
          frames++;
        }
        expect(list[list.length - 1].colours).toEqual(run.colours);
        const b = bound(p.graph, order);
        expect(b.yours).toBe(run.used);
        expect(boundCaption(b)).toContain(`Greedy in your order used ${run.used} ${run.used === 1 ? 'colour' : 'colours'}`);
        expect(hardCaption(p.graph)).not.toMatch(/NaN|undefined|null/);
      }
    }
    expect(frames).toBeGreaterThan(150);
  });

  it('the bound caption calls the bound tight exactly when the exact minimum equals max degree + 1 (K5 and the odd cycle yes, the crown graph no)', () => {
    for (const p of PRESETS) {
      const b = bound(p.graph, identityOrder(p.graph.names.length));
      expect(boundCaption(b).includes('the bound is tight here')).toBe(b.optimum === b.degreeBound);
    }
    expect(boundCaption(bound(presetById('k5').graph, identityOrder(5)))).toContain('the bound is tight here');
    expect(boundCaption(bound(presetById('odd').graph, identityOrder(5)))).toContain('the bound is tight here');
  });

  it('the timetable caption never claims a minimum the placement does not have: partial, clashing and clean boards say different things', () => {
    const n = timetableGraph.names.length;
    const empty = timetable(timetableGraph, Array<number>(n).fill(0));
    expect(timetableCaption(empty)).toContain('Place every course');
    const clash = timetable(timetableGraph, Array<number>(n).fill(1));
    expect(clash.conflicts).toBe(timetableGraph.edges.length);
    expect(timetableCaption(clash)).toContain(`${timetableGraph.edges.length} clashes`);
    const best = chromatic(timetableGraph);
    expect(timetableCaption(timetable(timetableGraph, best.colours))).toContain('Yours matches the minimum.');
    const wasteful = timetable(timetableGraph, identityOrder(n).map((v) => v + 1));
    expect(timetableCaption(wasteful)).toContain(`Yours uses ${n - best.number} more than the minimum.`);
  });
});
