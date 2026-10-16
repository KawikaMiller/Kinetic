import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { BAD_DEPLOY_AT, DEFAULT_DISASTER_AT, restore } from './backup';
import { DRILL_PLAN, drillCaption, drillRows, drillSets } from './drillView';
import { drillFacts, planFacts, timelineFacts } from './facts';
import lesson from './index';
import { DEFAULT_PLAN, backupSets, restoreFrom, soundOutcome } from './plan';
import { outcomeText, planCaption, planRows } from './planView';
import {
  DRILL_OPEN, PLAN_OPEN, TIMELINE_OPEN, checkTarget, historyOf, matchesOracle, minutesText, parseClock, restoreInput, timeline, timelineCaption, type TimelineInput,
} from './view';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n);
const open = (patch: Partial<TimelineInput> = {}): TimelineInput => ({ snapshotH: 24, logOn: true, logMin: 15, gapSeed: null, disasterAt: DEFAULT_DISASTER_AT, ...patch });

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('backups-disaster-recovery')).toHaveLength(3);
    expect(sharedSceneComponents('backups-disaster-recovery')).toEqual([]);
    expect(sceneElements('backups-disaster-recovery').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(TIMELINE_OPEN).toMatchObject({ snapshotH: 24, logOn: true, logMin: 15, disasterAt: DEFAULT_DISASTER_AT, day: 3, targetText: '14:06', gap: false });
    expect(PLAN_OPEN.scenario).toBe('migration');
    expect(DRILL_OPEN.seed).toBe(3);
    expect(DRILL_PLAN).toMatchObject({ tests: 'never', keyWith: false, method: 'snapshots-log' });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: 7 minutes lost, restore to Thu 14:06 in about 17 minutes and a match; without the log 757 minutes and the nearest point Thu 02:00', () => {
    const f = timelineFacts();
    expect(f.on).toEqual({ lost: 7, recoverable: 'Thu 14:30', reached: 'Thu 14:06', seconds: 1041 });
    expect(f.off).toEqual({ lost: 757, recoverable: 'Thu 02:00', reached: 'Thu 02:00' });
    expect(f.ok).toMatchObject({ ok: true });
    const input = restoreInput(open());
    expect(matchesOracle(historyOf(), restore(input, BAD_DEPLOY_AT - 1))).toBe(true);
    expect(lesson.tryThis[0]).toContain('data lost is 7 min (recoverable to Thu 14:30)');
    expect(lesson.tryThis[0]).toContain('reaches Thu 14:06 in about 17 min');
    expect(lesson.tryThis[0]).toContain('data lost is 12 h 37 min and the nearest point is Thu 02:00');
  });

  it('try-this 2: 14:50 is refused as after the disaster, and with a lost segment 14:06 is refused as beyond a gap', () => {
    const f = timelineFacts();
    expect(f.afterDisaster).toEqual({ ok: false, error: 'Thu 14:50 is after the disaster at Thu 14:37: nothing was recorded then.' });
    expect(f.gap.ok).toBe(false);
    expect(lesson.tryThis[1]).toContain('Thu 14:50 is after the disaster at Thu 14:37: nothing was recorded then.');
    expect(lesson.tryThis[1]).toContain(f.gap.ok ? '' : f.gap.error);
  });

  it('try-this 3: the sound plan survives 5 of 5, the weak plan 1, and a replica-only plan fails the bad migration', () => {
    const f = planFacts();
    expect(f).toMatchObject({ total: 5, sound: 5, weak: 1 });
    expect(f.replicaMigration.ok).toBe(false);
    expect(lesson.tryThis[2]).toContain('survives 5 of 5 scenarios');
    expect(lesson.tryThis[2]).toContain('it survives 1.');
    expect(lesson.tryThis[2]).toContain('a replica is not a backup');
  });

  it('try-this 4: seed 3 untested fails on a stale restore script, and drilled and fixed restores to the point a sound plan reaches', () => {
    const f = drillFacts();
    expect(f).toMatchObject({ seed: 3, lowest: 3, fault: 'script' });
    expect(f.struck).toMatchObject({ restored: false, why: 'the restore script was written for an older version' });
    expect(f.fixed).toEqual(f.sound);
    expect(lesson.tryThis[3]).toContain('the restore fails because the restore script was written for an older version');
  });
});

describe('the typed target time', () => {
  const input = restoreInput(open());
  it('parses HH:MM with bounded hours and minutes and refuses the rest with a reason', () => {
    expect(parseClock('14:06')).toEqual({ ok: true, minutes: 14 * 60 + 6 });
    expect(parseClock(' 0:00 ')).toEqual({ ok: true, minutes: 0 });
    expect(parseClock('23:59')).toEqual({ ok: true, minutes: 23 * 60 + 59 });
    for (const bad of ['', '1406', '14:6x', '24:00', '12:60', '-1:30', '14:06:00', 'noon']) expect(parseClock(bad).ok, bad).toBe(false);
    expect(parseClock('24:00')).toEqual({ ok: false, error: 'The hour goes from 0 to 23.' });
    expect(parseClock('12:60')).toEqual({ ok: false, error: 'The minutes go from 0 to 59.' });
  });

  it('accepts a time up to the disaster and refuses one after it, naming both', () => {
    expect(checkTarget('14:37', 3, input)).toMatchObject({ ok: true });
    expect(checkTarget('14:38', 3, input)).toEqual({ ok: false, error: 'Thu 14:38 is after the disaster at Thu 14:37: nothing was recorded then.' });
    expect(checkTarget('00:00', 0, input)).toMatchObject({ ok: true });
  });

  it('refuses a time behind a lost segment and accepts one before it', () => {
    const gapped = restoreInput(open({ gapSeed: 4 }));
    const r = restore(gapped, gapped.disasterAt);
    expect(r.stoppedAtGap).not.toBeNull();
    const gapStart = r.stoppedAtGap! * 15;
    const day = Math.floor(gapStart / 1440);
    const hh = Math.floor((gapStart % 1440) / 60);
    const mm = gapStart % 60;
    const before = checkTarget(`${hh}:${String(mm).padStart(2, '0')}`, day, gapped);
    expect(before).toMatchObject({ ok: true });
    expect(checkTarget('14:06', 3, gapped)).toMatchObject({ ok: false });
  });
});

describe('what the scenes draw', () => {
  it('the timeline has a full and incrementals as backups, a log lane only with a log archive, an instant for the disaster and one for the bad deployment', () => {
    const on = timeline(restoreInput(open()), BAD_DEPLOY_AT - 1, 500);
    expect(on.bars.filter((b) => b.lane === 'full')).toHaveLength(1);
    expect(on.bars.filter((b) => b.lane === 'incr')).toHaveLength(3);
    expect(on.bars.some((b) => b.lane === 'log')).toBe(true);
    const instants = on.bars.filter((b) => b.lane === 'events' && b.start === b.end);
    expect(instants.map((b) => b.id).sort()).toEqual(['bad', 'disaster', 'target']);
    expect(instants.every((b) => b.tone !== undefined)).toBe(true);
    const off = timeline(restoreInput(open({ logOn: false })), null, 500);
    expect(off.bars.some((b) => b.lane === 'log')).toBe(false);
    expect(off.bars.some((b) => b.id === 'target')).toBe(false);
  });

  it('a lost segment draws a red bar on the log lane, the data lost is red and the downtime is orange', () => {
    const t = timeline(restoreInput(open({ gapSeed: 4 })), null, 500);
    expect(t.bars.filter((b) => b.lane === 'log' && b.tone === 'bad')).toHaveLength(1);
    expect(t.bars.find((b) => b.id === 'lost')!.tone).toBe('bad');
    expect(t.bars.find((b) => b.id === 'down')!.tone).toBe('orange');
    expect(t.bars.find((b) => b.id === 'rec')!.tone).toBe('ok');
  });

  it('the drill rows: untested sets are dim and say so, a restored set has a tick, a faulty one is red with its fault', () => {
    const hidden = backupSets(DRILL_PLAN, 3);
    const untested = drillRows(drillSets(hidden, false, false));
    expect(untested.every((r) => r.cell.tone === 'dim' && r.rail!.label === 'untested')).toBe(true);
    const tested = drillRows(drillSets(hidden, true, false));
    expect(tested.filter((r) => r.cell.tone === 'bad')).toHaveLength(1);
    expect(tested.filter((r) => r.cell.text === '✓')).toHaveLength(tested.length - 1);
    const fixed = drillRows(drillSets(hidden, true, true));
    expect(fixed.every((r) => r.cell.tone === 'ok')).toBe(true);
  });
});

describe('captions are computed from the model', () => {
  it('the timeline caption quotes the data lost, the recoverable point and the restore time, at the slider extremes and with the log off', () => {
    for (const disasterAt of [180, DEFAULT_DISASTER_AT, 10080]) {
      for (const logOn of [true, false]) {
        const input = restoreInput(open({ disasterAt, logOn }));
        const c = text(timelineCaption(input, null, 500));
        expect(c).toContain(`Disaster at`);
        expect(c).toContain('of data is lost');
        const withTarget = text(timelineCaption(input, Math.min(disasterAt, BAD_DEPLOY_AT - 1), 500));
        expect(withTarget.includes('no log archive')).toBe(!logOn);
      }
    }
  });

  it('the plan caption and rows agree: the count of survived scenarios in the caption is the count of recoverable rows', () => {
    for (const p of [DEFAULT_PLAN, { ...DEFAULT_PLAN, method: 'replica' as const }, { ...DEFAULT_PLAN, copies: 1 as const }]) {
      const rows = planRows(p, 4);
      const survived = rows.filter((r) => r.verdict.ok).length;
      for (const r of rows) expect(text(planCaption(r, survived, rows.length))).toContain(`survives ${survived} of ${rows.length} scenarios`);
    }
  });

  it('the drill caption never says whether a fault exists before the test, and the outcome sentence names the fault when the restore fails', () => {
    const sound = soundOutcome(DRILL_PLAN, 3);
    const failed = restoreFrom(DRILL_PLAN, backupSets(DRILL_PLAN, 3), 3);
    expect(drillCaption({ tested: false, fixed: false, struck: false, found: ['script'], outcome: failed, sound })).not.toMatch(/carries a fault|no fault/);
    expect(drillCaption({ tested: false, fixed: false, struck: false, found: [], outcome: failed, sound })).toBe(drillCaption({ tested: false, fixed: false, struck: false, found: ['script'], outcome: failed, sound }));
    expect(text(outcomeText(failed))).toContain('The restore failed: the restore script was written for an older version.');
    expect(text(drillCaption({ tested: true, fixed: false, struck: true, found: ['script'], outcome: failed, sound }))).toContain('found at the disaster');
    expect(text(drillCaption({ tested: true, fixed: true, struck: true, found: ['script'], outcome: sound, sound }))).toContain('The drill came first');
  });

  it('minutes read as minutes below ninety and as a larger unit above', () => {
    expect(minutesText(7)).toBe('7 min');
    expect(minutesText(0)).toBe('0 min');
    expect(minutesText(757)).toBe('12 h 37 min');
  });
});

describe('lesson content', () => {
  it('has four try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(4);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
