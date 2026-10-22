import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { NO_SOURCES, only } from './feature';
import lesson from './index';
import { JOIN_OPENING, PIPELINE_OPENING, joinCaption, joinView, pipelineCaption, pipelineView } from './view';

const ALL = { boundary: true, late: true, day: true, null: true };
const open = PIPELINE_OPENING;
const view = (sources = open.sources, shared = false) => pipelineView(open.seed, open.users, open.lateShare, open.windowDays, sources, shared);

describe('scenes', () => {
  it('every scene component carries its own key and no component is shared between scenes', () => {
    const els = sceneElements('feature-stores-skew');
    expect(els).toHaveLength(2);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('feature-stores-skew')).toEqual([]);
  });

  it('the opening state is every source off, the two-pipeline definition and the point-in-time join', () => {
    expect(open.sources).toEqual(NO_SOURCES);
    expect(open.shared).toBe(false);
    expect([open.seed, open.users, open.windowDays, open.lateShare]).toEqual([4, 40, 7, 0.05]);
    expect(JOIN_OPENING).toEqual({ seed: 4, kind: 'point-in-time' });
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: all four sources off reads 0 of 920 rows', () => {
    const v = view();
    expect([v.count, v.rows.length]).toEqual([0, 920]);
    expect(pipelineCaption(v, open.sources, false)).toContain('0 of 920 rows differ');
    expect(lesson.tryThis[0]).toContain('0 of 920 rows');
  });

  it('try-this 2: window boundary makes 8 of 920 rows differ, the first is user 1 at day 7 12:00 on the window start; adding late events makes 18', () => {
    const v = view(only('boundary'));
    expect(v.count).toBe(8);
    const text = pipelineCaption(v, only('boundary'), false);
    expect(text).toContain('8 of 920 rows');
    expect(text).toContain('The first is user 1 at day 7 12:00');
    expect(text).toContain('an event at day 0 12:00'.replace('an event at', 'the event at'));
    expect(text).toContain('exactly on the window start');
    const both = view({ ...NO_SOURCES, boundary: true, late: true });
    expect(both.count).toBe(18);
    expect(both.count).toBeGreaterThan(v.count);
    expect(lesson.tryThis[1]).toContain('8 of 920');
    expect(lesson.tryThis[1]).toContain('18 of 920');
  });

  it('try-this 3: with all four sources on, the shared definition returns the meter to 0 of 920', () => {
    expect(view(ALL).count).toBe(178);
    const shared = view(ALL, true);
    expect(shared.count).toBe(0);
    expect(pipelineCaption(shared, ALL, true)).toContain('0 of 920 rows differ, whatever the skew toggles say');
  });

  it('try-this 4: joins 2, 5, 9 then 9, 9, 9, and the three AUCs 0.927, 0.736 and 0.736 on seed 4', () => {
    const pit = joinView(JOIN_OPENING.seed, 'point-in-time');
    const latest = joinView(JOIN_OPENING.seed, 'latest');
    expect(pit.rows.map((r) => r.entry?.value)).toEqual([2, 5, 9]);
    expect(latest.rows.map((r) => r.entry?.value)).toEqual([9, 9, 9]);
    const text = joinCaption(latest, 'latest');
    expect(text).toContain('9, 9, 9');
    expect(text).toContain('AUC 0.927 offline with the leaky join, 0.736 with the correct join, and 0.736 when served');
    expect(lesson.tryThis[3]).toContain('0.927');
    expect(lesson.tryThis[3]).toContain('0.736 for the correct join and 0.736 online');
  });
});

describe('manipulations: the wrong move and what the page says', () => {
  it('manipulation 1: switching on the boundary skew names the first diverging row and the event on the window start', () => {
    const v = view(only('boundary'));
    expect(v.first?.causes).toHaveLength(1);
    expect(v.first?.causes[0].text).toContain('sits exactly on the window start');
    expect(v.first?.row).toMatchObject({ user: 0, day: 7 });
  });

  it('manipulation 2: choosing the shared definition brings the diff meter to 0 with every source on', () => {
    expect(view(ALL).count).toBeGreaterThan(0);
    expect(view(ALL, true).count).toBe(0);
    expect(view(ALL, true).first).toBeNull();
  });

  it('manipulation 3: the leaky join makes the AUC gap visible, scoped to these datasets', () => {
    const v = joinView(4, 'next');
    expect(v.rows.map((r) => r.entry?.value ?? null)).toEqual([5, 9, null]);
    expect(v.leak.leakyOffline as number).toBeGreaterThan((v.leak.correctOffline as number) + 0.1);
    expect(joinCaption(v, 'next')).toContain('2 of 3 rows use a value stamped after their label time');
    expect(lesson.keyIdeas[3]).toContain('made-up stream');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model\'s numbers', () => {
    const each = view().each;
    expect(each.map((e) => e.count)).toEqual([8, 10, 46, 115]);
    expect(lesson.keyIdeas[0]).toContain('8, 10, 46 and 115 of 920');
    expect(lesson.keyIdeas[1]).toContain('920 of 920 rows on 200 seeded datasets');
    expect(lesson.quiz[0].why).toContain('between 8 and 115 of 920');
    expect(lesson.quiz[1].why).toContain('2, 5 and 9');
    expect(lesson.quiz[2].why).toContain('0.927');
    expect(lesson.quiz[3].why).toContain('0 of 920');
  });
});
