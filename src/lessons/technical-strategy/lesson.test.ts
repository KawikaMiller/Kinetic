import { describe, expect, it } from 'vitest';
import { choose, dominatedChoices, enumeratePaths, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { TECHNICAL_STRATEGY } from '../../core/testing/leadScenarios';
import { canvasCaption, conflictText, storyCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { REMOVABLE, read, toggle, type NodeId } from './model';
import { OPENING } from './opening';
import { METER, METERS, STORAGE } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const walkTo = (ids: string[]) => ids.reduce((w, id) => choose(STORAGE, w, id), startWalk(STORAGE));
const press = (removed: ReadonlySet<NodeId>, ...ids: NodeId[]) => ids.reduce(toggle, removed);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('technical-strategy');
    expect(els).toHaveLength(2);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('technical-strategy')).toEqual([]);
  });

  it('opens on the canvas with every node present', () => {
    expect(OPENING.scene).toBe('canvas');
    expect(OPENING.removed.size).toBe(0);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: 0 orphans, 0 uncovered, 2 conflicts', () => {
    const r = read(OPENING.removed);
    expect([r.orphans.length, r.uncovered.length, r.conflicts.map(([a, b]) => `${a}/${b}`)]).toEqual([0, 0, ['P2/P4', 'A4/A7']]);
    expect(lesson.tryThis[0]).toContain('0 orphaned actions, 0 uncovered diagnoses and 2 active conflicts');
  });

  it('try-this 2: removing P1 orphans A1 and A2', () => {
    const removed = press(OPENING.removed, 'P1');
    expect(read(removed).orphans).toEqual(['A1', 'A2']);
    expect(lesson.tryThis[1]).toContain('A1 and A2 turn orphaned');
  });

  it('try-this 3: restoring P1 and removing P4 orphans A6 and A7, clears P2/P4 and leaves A4/A7', () => {
    const removed = press(OPENING.removed, 'P1', 'P1', 'P4');
    const r = read(removed);
    expect([r.orphans, r.uncovered, r.conflicts]).toEqual([['A6', 'A7'], [], [['A4', 'A7']]]);
    expect(lesson.tryThis[2]).toContain('A6 and A7 are orphaned, the policy conflict clears and 1 action conflict (A4 against A7) remains');
  });

  it('try-this 4: restoring P4 and removing P3 uncovers D2 and orphans A5', () => {
    const removed = press(OPENING.removed, 'P1', 'P1', 'P4', 'P4', 'P3');
    const r = read(removed);
    expect([r.orphans, r.uncovered]).toEqual([['A5'], ['D2']]);
    expect(lesson.tryThis[3]).toContain('D2 is uncovered and A5 is orphaned');
  });

  it('try-this 5: hybrid then exception reads autonomy 5, effort 6, drag 4 with no meter red', () => {
    const w = walkTo(['hybrid', 'exception']);
    expect([w.meters[METER.autonomy], w.meters[METER.effort], w.meters[METER.drag]]).toEqual([5, 6, 4]);
    expect(redMeters(STORAGE, w.meters)).toEqual([]);
    expect(lesson.tryThis[4]).toContain('autonomy 5, migration effort 6, delivery drag 4');
  });
});

describe('captions across the states', () => {
  it('the canvas caption is clean in all 2^11 states of the removable nodes and counts what the reading counts', () => {
    for (let mask = 0; mask < 1 << REMOVABLE.length; mask += 1) {
      const removed = new Set(REMOVABLE.filter((_, i) => mask & (1 << i)));
      const r = read(removed);
      const text = expectCaption(canvasCaption(removed, r));
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain(`${r.orphans.length} orphaned action`);
      expect(text).toContain(`${r.conflicts.length} active conflict`);
    }
  });

  it('names what it counts', () => {
    expect(expectCaption(canvasCaption(OPENING.removed, read(OPENING.removed)))).toContain('Nothing is removed.');
    const text = expectCaption(canvasCaption(press(OPENING.removed, 'P3'), read(press(OPENING.removed, 'P3'))));
    expect(text).toContain('Removed: P3.');
    expect(text).toContain('1 orphaned action (A5: no policy supports it)');
    expect(text).toContain('1 uncovered diagnosis (D2: no policy answers it)');
    expect(conflictText(['P2', 'P4'])).toContain('P2 against P4');
  });

  it('the story caption reads the meters and the red ones', () => {
    expect(expectCaption(storyCaption(STORAGE, startWalk(STORAGE)))).toContain('Nothing is in the red');
    const text = expectCaption(storyCaption(STORAGE, walkTo(['consolidate', 'hard-rule'])));
    expect(text).toContain('Autonomy 2, migration effort 7, delivery drag 2');
    expect(text).toContain('In the red: autonomy.');
  });
});

describe('the storage story', () => {
  it('has the structure of the fixture the kit was proven against', () => {
    expect(STORAGE.meters).toEqual(TECHNICAL_STRATEGY.meters);
    for (const [i, node] of STORAGE.nodes.entries()) expect(node.choices.map((c) => [c.id, c.to, c.effects])).toEqual(TECHNICAL_STRATEGY.nodes[i].choices.map((c) => [c.id, c.to, c.effects]));
    expect(STORAGE.endings.map((e) => e.id)).toEqual(TECHNICAL_STRATEGY.endings.map((e) => e.id));
  });

  it('passes every trade-off check under all three readings, with 9 paths', () => {
    expect(validateScenario(STORAGE, { tradeoffs: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(STORAGE, { destinations }), destinations).toEqual([]);
    expect(enumeratePaths(STORAGE)).toHaveLength(9);
    expect(METERS).toHaveLength(3);
  });

  it('has the spec\'s ledgers: hybrid-exception (5, 6, 4) with no red, consolidate-hard-rule (2, 7, 2) autonomy red, team-choice-advice (8, 2, 7) drag red', () => {
    const red = (ids: string[]) => redMeters(STORAGE, walkTo(ids).meters).map((m) => m.id);
    expect(walkTo(['consolidate', 'hard-rule']).meters).toEqual({ autonomy: 2, effort: 7, drag: 2 });
    expect(walkTo(['team-choice', 'advice']).meters).toEqual({ autonomy: 8, effort: 2, drag: 7 });
    expect(red(['hybrid', 'exception'])).toEqual([]);
    expect(red(['consolidate', 'hard-rule'])).toEqual(['autonomy']);
    expect(red(['team-choice', 'advice'])).toEqual(['drag']);
  });

  it('has no path best on every meter (a separate argmax and argmin pass)', () => {
    const paths = enumeratePaths(STORAGE);
    const best = (id: string, higher: boolean) => {
      const values = paths.map((p) => p.meters[id]);
      const target = higher ? Math.max(...values) : Math.min(...values);
      return paths.filter((p) => p.meters[id] === target).map((p) => p.choices.join('-'));
    };
    const sets = [best(METER.autonomy, true), best(METER.effort, false), best(METER.drag, false)];
    expect(sets.reduce((common, s) => common.filter((k) => s.includes(k)))).toEqual([]);
  });

  it('has no ending marked correct, and states every reason as a condition', () => {
    for (const e of STORAGE.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
    for (const c of STORAGE.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
  });
});

describe('the text quotes what the model computes', () => {
  it('has one "it depends" question that names its X, a misconception question and the kernel question', () => {
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('It depends on who pays the coordination cost');
    expect(lesson.quiz[1].q).toContain('our roadmap is our strategy');
    expect(lesson.quiz[2].q).toContain('P1 and 2 roadmap items turn orphaned');
    expect(FACTS.p1OrphanCount).toBe(2);
    expect(FACTS.supportEdges).toBe(11);
  });
});
