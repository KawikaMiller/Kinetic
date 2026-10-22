import { describe, expect, it } from 'vitest';
import { allSorted } from '../../core/classify';
import { choose, dominatedChoices, enumeratePaths, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { REVERSIBLE_DECISIONS } from '../../core/testing/leadScenarios';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { curveCaption, doorsCaption, placeCaption, storyCaption, techniqueCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  DECISIONS, DOORS, RIGOUR_BOUNDS, TECHNIQUES, crossoverCost, decisionOf, rigourOf, techniqueRow, techniqueOf, totalCost, undoAt, type Rigour,
} from './model';
import { OPENING, curveFor } from './opening';
import { METER, METERS, QUEUE_SERVICE } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const walkTo = (ids: string[]) => ids.reduce((w, id) => choose(QUEUE_SERVICE, w, id), startWalk(QUEUE_SERVICE));
const stateModel = (s: { undo: number; p0: number; tau: number; w: number }): Rigour => ({ undo: s.undo, p0: s.p0, tau: s.tau, w: s.w });
const labelOf = (id: string) => decisionOf(id).label;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('reversible-decisions');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('reversible-decisions')).toEqual([]);
  });

  it('opens with the ten decisions unplaced and scene 2 on the database engine (C 800, p0 0.35, tau 10, w 1, r 0)', () => {
    expect(OPENING.scene).toBe('place');
    expect(allSorted(DECISIONS, OPENING.board.answers)).toBe(false);
    expect(Object.values(OPENING.board.answers).every((a) => a === null)).toBe(true);
    expect(OPENING.curve).toEqual({ decision: 'database', undo: 800, p0: 0.35, tau: 10, w: 1, hours: 0 });
  });

  it('picking a decision sets its own C and p0 and keeps tau, w and the hours the learner set', () => {
    const next = curveFor('rename', { tau: 25, w: 2, hours: 80 });
    expect(next).toEqual({ decision: 'rename', undo: 1, p0: 0.3, tau: 25, w: 2, hours: 80 });
  });

  it('keeps every default inside its slider and on its step, and every decision reachable on the C and p0 sliders', () => {
    for (const d of DECISIONS) {
      expect(d.undo).toBeGreaterThanOrEqual(RIGOUR_BOUNDS.undo.min);
      expect(d.undo).toBeLessThanOrEqual(RIGOUR_BOUNDS.undo.max);
      expect(d.undo % RIGOUR_BOUNDS.undo.step).toBe(0);
      expect(d.p0).toBeGreaterThanOrEqual(RIGOUR_BOUNDS.p0.min);
      expect(d.p0).toBeLessThanOrEqual(RIGOUR_BOUNDS.p0.max);
      expect(Math.abs(Math.round((d.p0 - RIGOUR_BOUNDS.p0.min) / RIGOUR_BOUNDS.p0.step) * RIGOUR_BOUNDS.p0.step + RIGOUR_BOUNDS.p0.min - d.p0)).toBeLessThan(1e-9);
    }
    expect(RIGOUR_BOUNDS.p0.max).toBe(0.9);
    expect(33 % RIGOUR_BOUNDS.hours.step).toBe(0);
    expect(DOORS.c0.min).toBeLessThanOrEqual(20);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: placing all ten reveals five worth rigour; the database crossover is 28.6 h, best rigour 33.3 h, cost 43.3 against 280', () => {
    const board = { answers: Object.fromEntries(DECISIONS.map((d) => [d.id, 'cheap-right'])), checked: false };
    expect(allSorted(DECISIONS, board.answers)).toBe(true);
    expect([FACTS.deliberate, FACTS.dbCrossover, FACTS.dbBest, FACTS.dbBestTotal, FACTS.dbNone]).toEqual([5, '28.6', '33.3', '43.3', '280']);
    expect(lesson.tryThis[0]).toContain('rigour pays for 5 of them');
    expect(lesson.tryThis[0]).toContain('crossover is 28.6 hours, the best rigour 33.3 hours and the expected cost 43.3 against 280 with none');
  });

  it('try-this 2: the curve opens on the database engine; at r = 33 the cost is 43.3 and at 80 it is 80.1', () => {
    const m = stateModel(OPENING.curve);
    expect(totalCost(0, m)).toBe(280);
    expect(totalCost(33, m)).toBeCloseTo(33 + 280 * Math.exp(-3.3), 9);
    expect([FACTS.dbAt33, FACTS.dbAt80]).toEqual(['43.3', '80.1']);
    expect(lesson.tryThis[1]).toContain('falls from 280 to 43.3');
    expect(lesson.tryThis[1]).toContain('rises again to 80.1');
  });

  it('try-this 3: on Rename with r still at 80 it is decide now (crossover 33.3 against 1), and 80 hours cost 80 against 0.3', () => {
    const next = curveFor('rename', { ...OPENING.curve, hours: 80 });
    const m = stateModel(next);
    expect(crossoverCost(m.p0, m.tau, m.w)).toBeCloseTo(33.333, 3);
    expect(expectCaption(curveCaption(labelOf('rename'), m, 80))).toContain('Decide now');
    expect([FACTS.renameCrossover, FACTS.renameAt80, FACTS.renameNone]).toEqual(['33.3', '80', '0.3']);
    expect(lesson.tryThis[2]).toContain('your 80 hours cost 80 against 0.3');
  });

  it('try-this 4: p0 0.9 on the rename gives a crossover of 11.1 and it is still decide now', () => {
    const m = { ...stateModel(curveFor('rename', OPENING.curve)), p0: 0.9 };
    expect(crossoverCost(m.p0, m.tau, m.w)).toBeCloseTo(11.111, 3);
    expect(m.undo).toBe(1);
    expect(expectCaption(curveCaption(labelOf('rename'), m, 0))).toContain('Decide now');
    expect(FACTS.renameSureCrossover).toBe('11.1');
    expect(lesson.tryThis[3]).toContain('crossover is 11.1 hours');
  });

  it('try-this 5: C0 20, g 10%: the door closes at month 2.3, month 3 costs 26.6 against 25; the adapter layer saves 6.9 against 12 and does not pay', () => {
    expect([FACTS.doorMonth, FACTS.doorCostAt3, FACTS.doorCrossover]).toEqual(['2.3', '26.6', '25']);
    const row = techniqueRow(rigourOf(decisionOf('database')), techniqueOf('adapter'));
    expect([row.saving.toFixed(1), row.technique.setup, row.pays]).toEqual(['6.9', 12, false]);
    expect(expectCaption(techniqueCaption(labelOf('database'), row))).toContain('It does not pay');
    expect(lesson.tryThis[4]).toContain('door closes at month 2.3');
    expect(lesson.tryThis[4]).toContain('saves 6.9 hours against 12 to set up');
  });
});

describe('captions across the controls', () => {
  it('the curve caption is clean at every slider extreme and one step beyond, for every decision', () => {
    for (const d of DECISIONS) for (const p0 of [RIGOUR_BOUNDS.p0.min, RIGOUR_BOUNDS.p0.max]) for (const tau of [RIGOUR_BOUNDS.tau.min, RIGOUR_BOUNDS.tau.max]) {
      for (const w of [RIGOUR_BOUNDS.w.min, RIGOUR_BOUNDS.w.max]) for (const hours of [0, RIGOUR_BOUNDS.hours.max]) {
        const text = expectCaption(curveCaption(d.label, { undo: d.undo, p0, tau, w }, hours));
        expect(text, `${d.id}`).not.toMatch(NO_JUNK);
      }
    }
    for (const undo of [0, RIGOUR_BOUNDS.undo.max]) expect(expectCaption(curveCaption('x', { undo, p0: 0.5, tau: 10, w: 1 }, 0))).not.toMatch(NO_JUNK);
  });

  it('the curve caption says "Decide now" below the crossover and "Rigour pays" above it', () => {
    expect(expectCaption(curveCaption('a', { undo: 20, p0: 0.4, tau: 10, w: 1 }, 0))).toContain('Decide now');
    expect(expectCaption(curveCaption('a', { undo: 26, p0: 0.4, tau: 10, w: 1 }, 0))).toContain('Rigour pays');
  });

  it('the doors caption covers never, already and a month, at the slider extremes', () => {
    expect(expectCaption(doorsCaption(20, 0, 25, 12))).toContain('never reaches the crossover');
    expect(expectCaption(doorsCaption(30, 10, 25, 0))).toContain('one-way from month 0');
    expect(expectCaption(doorsCaption(20, 10, 25, 3))).toContain('month 2.3');
    expect(expectCaption(doorsCaption(20, 10, 25, 3))).toContain('26.6 hours to undo: one-way');
    expect(expectCaption(doorsCaption(20, 10, 25, 2))).toContain('24.2 hours to undo: two-way');
    for (const c0 of [DOORS.c0.min, DOORS.c0.max]) for (const g of [DOORS.growth.min, DOORS.growth.max]) {
      for (const month of [DOORS.month.min, DOORS.month.max]) expect(expectCaption(doorsCaption(c0, g, 25, month))).not.toMatch(NO_JUNK);
    }
  });

  it('the technique caption names the margin both ways, and asks for a pick when none is chosen', () => {
    const db = rigourOf(decisionOf('database'));
    expect(expectCaption(techniqueCaption('x', null))).toContain('pick a technique');
    expect(expectCaption(techniqueCaption('x', techniqueRow(db, techniqueOf('pilot'))))).toContain('It pays, by 0.5');
    for (const t of TECHNIQUES) for (const tau of [RIGOUR_BOUNDS.tau.min, RIGOUR_BOUNDS.tau.max]) {
      expect(expectCaption(techniqueCaption('x', techniqueRow({ ...db, tau }, t)))).not.toMatch(NO_JUNK);
    }
  });

  it('the place caption counts the placed decisions and the model split once all are placed', () => {
    expect(expectCaption(placeCaption(0))).toContain('0 of 10 decisions placed');
    expect(expectCaption(placeCaption(9))).toContain('9 of 10');
    expect(expectCaption(placeCaption(10))).toContain('rigour pays for 5 of them and the other 5 are decide-now');
  });

  it('the story caption reads the meters and the red ones', () => {
    expect(expectCaption(storyCaption(QUEUE_SERVICE, startWalk(QUEUE_SERVICE)))).toContain('Nothing is in the red');
    const text = expectCaption(storyCaption(QUEUE_SERVICE, walkTo(['r3', 'ship'])));
    expect(text).toContain('Slack 3 days, regret 14, cost to reverse 10, upkeep 0 hours a week');
    expect(text).toContain('In the red: slack before the review.');
  });
});

describe('the queue-service story', () => {
  const paths = () => enumeratePaths(QUEUE_SERVICE);
  const final = (ids: string[]) => walkTo(ids).meters;

  it('has the graph and meters of the fixture the kit was proven against', () => {
    expect(QUEUE_SERVICE.start).toBe(REVERSIBLE_DECISIONS.start);
    expect(QUEUE_SERVICE.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad])).toEqual(REVERSIBLE_DECISIONS.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad]));
    for (const [i, node] of QUEUE_SERVICE.nodes.entries()) {
      expect(node.choices.map((c) => [c.id, c.to, c.effects])).toEqual(REVERSIBLE_DECISIONS.nodes[i].choices.map((c) => [c.id, c.to, c.effects]));
    }
    expect(QUEUE_SERVICE.endings.map((e) => e.id)).toEqual(REVERSIBLE_DECISIONS.endings.map((e) => e.id));
  });

  it('passes every trade-off check under all three readings and the strict cross-ending reading, with 6 paths', () => {
    expect(validateScenario(QUEUE_SERVICE, { tradeoffs: true })).toEqual([]);
    expect(validateScenario(QUEUE_SERVICE, { tradeoffs: true, crossEndings: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(QUEUE_SERVICE, { destinations }), destinations).toEqual([]);
    expect(paths()).toHaveLength(6);
  });

  it('has the spec\'s six endings, equal to a hand-worked sum from the start (10 / 20 / 10 / 0)', () => {
    // slack 10, regret 20, undo 10, upkeep 0, plus the two picked effects.
    expect(final(['r1', 'migrate'])).toEqual({ slack: 6, regret: 30, undo: 5, upkeep: 0 }); // -1-3, +10, +5-10
    expect(final(['r1', 'freeze'])).toEqual({ slack: 9, regret: 50, undo: 30, upkeep: 0 }); // -1, +10+20, +5+15
    expect(final(['r2', 'extend'])).toEqual({ slack: 6, regret: 25, undo: 4, upkeep: 6 }); // -2-2, +5, -3-3, +4+2
    expect(final(['r2', 'asis'])).toEqual({ slack: 8, regret: 29, undo: 7, upkeep: 4 }); // -2, +5+4, -3, +4
    expect(final(['r3', 'ship'])).toEqual({ slack: 3, regret: 14, undo: 10, upkeep: 0 }); // -5-2, -8+2
    expect(final(['r3', 'more'])).toEqual({ slack: 2, regret: 8, undo: 10, upkeep: 0 }); // -5-3, -8-4
  });

  it('has no path that is best on every meter, and no path that stays out of the red and ends no worse everywhere', () => {
    const all = paths().map((p) => p.meters);
    const better = [(v: number, u: number) => v >= u, (v: number, u: number) => v <= u, (v: number, u: number) => v <= u, (v: number, u: number) => v <= u];
    const ids = [METER.slack, METER.regret, METER.undo, METER.upkeep];
    const bestOnAll = all.filter((v) => all.every((u) => ids.every((id, i) => better[i](v[id], u[id]))));
    expect(bestOnAll).toEqual([]);
    expect(METERS).toHaveLength(4);
  });

  it('puts slack in the red on the two bake-off endings and upkeep at the edge of the red on the second vendor; says only what it shows', () => {
    const redOf = (ids: string[]) => redMeters(QUEUE_SERVICE, final(ids)).map((m) => m.id);
    expect(redOf(['r3', 'ship'])).toEqual([METER.slack]);
    expect(redOf(['r3', 'more'])).toEqual([METER.slack]);
    expect(redOf(['r2', 'extend'])).toEqual([]);
    expect(final(['r2', 'extend'])[METER.upkeep]).toBe(6);
    const text = (id: string) => QUEUE_SERVICE.endings.find((e) => e.id === id)!.text;
    expect(text('E_slow')).toContain('Regret is the lowest of the six');
    const regrets = paths().map((p) => p.meters[METER.regret]);
    expect(Math.min(...regrets)).toBe(final(['r3', 'more'])[METER.regret]);
    expect(final(['r3', 'more'])[METER.slack]).toBeLessThan(4);
  });

  it('has no ending marked correct, states every reason as a condition, and keeps the unrecommended endings defensible with a price', () => {
    for (const e of QUEUE_SERVICE.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
    for (const c of QUEUE_SERVICE.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
    expect(final(['r1', 'freeze'])[METER.regret]).toBe(50);
    expect(final(['r1', 'freeze'])[METER.slack]).toBe(9);
  });
});

describe('the text quotes what the model computes', () => {
  it('the second quiz question is the "it depends on X" question and names X', () => {
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('It depends on the cost to undo against the crossover');
  });

  it('the numeric quiz answers match the model: 20.8 hours at C 200 (80 with none), and the adapter layer saves 6.9 of the 12', () => {
    expect([FACTS.quizBest, FACTS.quizNone, FACTS.quizRatio]).toEqual(['20.8', '80', '8']);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('About 20.8 hours, which is tau times the natural log of the ratio 8');
    expect(lesson.quiz[4].options[lesson.quiz[4].answer]).toContain('saves 6.9 expected hours and costs 12');
    expect(FACTS.adapterClosed).toBe(FACTS.adapterSaving);
    expect(FACTS.week).toBe(40);
  });

  it('quotes the crossover as the model computes it at the other quiz inputs', () => {
    expect(crossoverCost(0.4, 10, 1)).toBe(25);
    expect(undoAt(20, 10, 3)).toBeCloseTo(26.62, 9);
    expect(lesson.quiz[2].why).toContain('reaches 25 hours at month 2.3');
  });
});
