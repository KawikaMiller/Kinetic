import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { boardCaption, feedbackCaption, matrixCaption, type PaybackRow } from './captions';
import lesson from './index';
import {
  CONTEXTS, DEFAULT_PRESET, LEVEL_MAX, PRESETS, SEED, TASKS, TEAM, WORK, hoursSummary, payback, simulate, startPlacement, type Context,
} from './model';
import { OPENING } from './opening';
import { FEEDBACK, METER } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

const rowsFor = (assignments: Record<string, string>, level: number, context: Context): PaybackRow[] =>
  TASKS.flatMap((t) => (TEAM.some((p) => p.id === assignments[t.id]) ? [{ taskId: t.id, personId: assignments[t.id], payback: payback(t, assignments[t.id], level, context) }] : []));

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('mentoring-delegation');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('mentoring-delegation')).toEqual([]);
  });

  it('every scene opens on its documented state: the review preset, and the work as placed', () => {
    expect(OPENING.scene).toBe('board');
    expect(OPENING.board.plan).toBe(DEFAULT_PRESET.plan);
    expect(DEFAULT_PRESET.id).toBe('review');
    expect(OPENING.board).toMatchObject({ seed: 5, presetId: 'review' });
    expect(OPENING.matrix.placed).toEqual(startPlacement());
    expect(OPENING.matrix.chip).toBe('start');
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 46 done, 16 bounced, queue 2; everything myself ends at 21 with 2 to 4 finished a week', () => {
    const run = simulate(OPENING.board.plan, OPENING.board.seed);
    expect([run.totals.completed, run.totals.bounced, run.weeks[7].queue]).toEqual([46, 16, 2]);
    const mine = simulate(PRESETS[0].plan, OPENING.board.seed);
    expect(mine.weeks[7].queue).toBe(21);
    expect([Math.min(...mine.weeks.map((w) => w.completed)), Math.max(...mine.weeks.map((w) => w.completed))]).toEqual([2, 4]);
    expect(lesson.tryThis[0]).toContain('46 tasks finish in 8 weeks, 16 bounce back and your queue ends at 2');
    expect(lesson.tryThis[0]).toContain('climbs to 21 by week 8');
  });

  it('try-this 2: no context bounces 18 tasks instead of 16 with everything else the same', () => {
    expect(simulate({ ...OPENING.board.plan, context: 'none' }, SEED).totals.bounced).toBe(18);
    expect(lesson.tryThis[1]).toContain('bounce 18 tasks instead of 16');
  });

  it('try-this 3: the flaky test with Cy pays back after 4 repetitions, and it is the slowest row on the default board', () => {
    const rows = rowsFor(OPENING.board.plan.assignments, OPENING.board.plan.level, OPENING.board.plan.context);
    expect(rows.map((r) => [r.taskId, r.payback.reps])).toEqual([['flaky', 4], ['ratelimit', 1], ['forms', 1], ['report', 1]]);
    expect(lesson.tryThis[2]).toContain('pays back after 4 repetitions');
    expect([rows.filter((r) => r.payback.reps === 1).length, rows.length]).toEqual([3, 4]);
    expect(lesson.keyIdeas[1]).toContain('3 of 4 delegated tasks already cost fewer hours the first time');
  });

  it('try-this 4: taking the task back reads 12 hours (in the red) and delivery 8', () => {
    const w = choose(FEEDBACK, startWalk(FEEDBACK), 'solve');
    expect([w.meters[METER.hours], w.meters[METER.delivery]]).toEqual([12, 8]);
    expect(w.meters[METER.hours]).toBeGreaterThan(10);
    expect(lesson.tryThis[3]).toContain('Your hours read 12 h, in the red, and delivery reads 8');
  });

  it('try-this 5: 21 hours move and 15.75 return; "Everything is mine" moves none', () => {
    const h = hoursSummary(startPlacement());
    expect([h.moved, h.returned]).toEqual([21, 15.75]);
    const mine = hoursSummary(Object.fromEntries(WORK.map((w) => [w.id, { importance: w.importance, unique: 9 }])));
    expect(mine.moved).toBe(0);
    expect(lesson.tryThis[4]).toContain('21 hours a week move to others and 15.75 return');
  });
});

describe('captions across the control cross product', () => {
  it('the board caption is clean for every preset, level, context and a spread of seeds', () => {
    for (const preset of PRESETS) {
      for (let level = 0; level <= LEVEL_MAX; level++) {
        for (const c of CONTEXTS) {
          for (const seed of [1, 5, 40]) {
            const plan = { ...preset.plan, level, context: c.value };
            const run = simulate(plan, seed);
            const text = expectCaption(boardCaption(run, rowsFor(plan.assignments, level, c.value)));
            expect(text).not.toMatch(NO_JUNK);
            expect(text).toContain(`${run.totals.completed} tasks were finished and ${run.totals.bounced} bounced`);
          }
        }
      }
    }
  });

  it('a board with nobody assigned says tasks never started, and names no pay-back', () => {
    const nobody = { assignments: {}, level: 3, context: 'brief' as Context };
    const text = expectCaption(boardCaption(simulate(nobody, 1), []));
    expect(text).toContain('48 tasks had no assignee and never started');
    expect(text).not.toContain('pay-back');
  });

  it('the feedback and matrix captions read their numbers off the model', () => {
    const w = choose(FEEDBACK, startWalk(FEEDBACK), 'solve');
    expect(expectCaption(feedbackCaption(FEEDBACK, w))).toContain('your hours spent 12');
    expect(expectCaption(feedbackCaption(FEEDBACK, w))).toContain('In the red: their ownership of the work and your hours spent');
    expect(expectCaption(feedbackCaption(FEEDBACK, startWalk(FEEDBACK)))).toContain('Nothing is in the red');
    const h = hoursSummary(startPlacement());
    expect(expectCaption(matrixCaption(h, 5, WORK.length))).toContain('moves 21 hours a week');
  });
});

describe('the feedback conversation', () => {
  it('validates, has 12 paths reaching all three endings, and every meter stays in bounds', () => {
    expect(validateScenario(FEEDBACK)).toEqual([]);
    const paths = enumeratePaths(FEEDBACK);
    expect(paths).toHaveLength(12);
    expect(new Set(paths.map((p) => p.endingId)).size).toBe(FEEDBACK.endings.length);
  });

  it('no first answer is at least as good as another on every meter, and taking the task back is the fastest delivery', () => {
    const first = FEEDBACK.nodes[0].choices.map((c) => ({
      id: c.id, clarity: c.effects![METER.clarity] ?? 0, trust: c.effects![METER.trust] ?? 0, ownership: c.effects![METER.ownership] ?? 0, hours: -c.effects![METER.hours], delivery: c.effects![METER.delivery] ?? 0,
    }));
    const keys = ['clarity', 'trust', 'ownership', 'hours', 'delivery'] as const;
    for (const a of first) for (const b of first) if (a.id !== b.id) expect(keys.every((k) => a[k] >= b[k]), `${a.id} dominates ${b.id}`).toBe(false);
    expect(first.find((f) => f.delivery === Math.max(...first.map((x) => x.delivery)))!.id).toBe('solve');
  });
});
