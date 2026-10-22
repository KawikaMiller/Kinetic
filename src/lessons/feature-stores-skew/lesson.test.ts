import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { NO_SOURCES, only } from './feature';
import lesson from './index';
import { JOIN_OPENING, PIPELINE_OPENING, dotTone, idleSources, joinCaption, joinView, pipelineCaption, pipelineView } from './view';

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
    expect(text).toContain('an event at day 0 12:00'.replace('an event at', 'The event at'));
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
    expect(text).toContain('scores AUC 0.927 offline, the honest feature 0.736, and the leaky-trained model served with the honest feature 0.736, the same number as the honest feature');
    expect(lesson.tryThis[3]).toContain('0.927');
    expect(lesson.tryThis[3]).toContain('0.736 for the honest feature and 0.736 online');
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

describe('the join captions do not follow the buttons for what the buttons do not drive', () => {
  it('the AUC part of the caption is identical for all three joins and never calls the experiment "the leaky join"', () => {
    const kinds = ['point-in-time', 'latest', 'next'] as const;
    const tails = kinds.map((k) => joinCaption(joinView(4, k), k).split('The AUC figures')[1]);
    expect(new Set(tails).size).toBe(1);
    expect(tails[0]).toContain('separate seeded dataset of 640 rows');
    expect(tails[0]).toContain('the join buttons do not change them');
    for (const k of kinds) expect(joinCaption(joinView(4, k), k)).not.toContain('with the leaky join');
  });

  it('the online meter says why it equals the honest one only when it does, on seeds 0 to 49', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const v = joinView(seed, 'latest');
      const same = v.leak.online !== null && v.leak.correctOffline !== null && Math.abs(v.leak.online - v.leak.correctOffline) < 1e-9;
      expect(joinCaption(v, 'latest').includes('because a model with a positive weight keeps'), `seed ${seed}`).toBe(same);
    }
  });
});

describe('a switched-on source that changes nothing says why', () => {
  const small = (users: number, lateShare: number, sources: typeof ALL) => pipelineView(4, users, lateShare, 7, sources, false);

  it('null handling at 4 users names the rounding, and late events at 0% name the zero', () => {
    const onlyNull = { ...NO_SOURCES, null: true };
    const v = small(4, 0.05, onlyNull);
    expect(v.count).toBe(0);
    expect(pipelineCaption(v, onlyNull, false)).toContain('10% of 4 users rounds to 0 users');
    const onlyLate = { ...NO_SOURCES, late: true };
    const noLate = small(40, 0, onlyLate);
    expect(noLate.count).toBe(0);
    expect(pipelineCaption(noLate, onlyLate, false)).toContain('no event is late (late events are at 0%)');
  });

  it('at 5 users the null source is no longer idle, and nothing is reported idle with every source off or the shared definition on', () => {
    const onlyNull = { ...NO_SOURCES, null: true };
    const five = small(5, 0.05, onlyNull);
    expect(five.count).toBeGreaterThan(0);
    expect(idleSources(five, onlyNull)).toEqual([]);
    expect(idleSources(view(), NO_SOURCES)).toEqual([]);
    expect(pipelineCaption(view(ALL, true), ALL, true)).not.toContain('Switched on but');
  });

  it('the first-row caption has no double colon and no trailing space on seed 4 with each source alone and with all four', () => {
    for (const s of [only('boundary'), only('late'), only('day'), only('null'), ALL]) {
      const text = pipelineCaption(view(s), s, false);
      expect(text, JSON.stringify(s)).not.toMatch(/: [^.]*: /);
      expect(text.endsWith(' ')).toBe(false);
    }
  });
});

describe('the timeline dot colours', () => {
  it('an event on the window start is the boundary colour even when it is also late; a late one elsewhere is violet; an ordinary one is sky', () => {
    expect(dotTone({ at: 3, arrived: 3.5 }, 3)).toBe('hi');
    expect(dotTone({ at: 3, arrived: 3 }, 3)).toBe('hi');
    expect(dotTone({ at: 4, arrived: 4.5 }, 3)).toBe('violet');
    expect(dotTone({ at: 4, arrived: 4 }, 3)).toBe('sky');
  });
});
