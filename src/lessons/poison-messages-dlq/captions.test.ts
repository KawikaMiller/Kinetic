import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { DLQ_MILESTONES, eventCaption, insightCaption, introCaption, policyLine, type NarrationContext } from './captions';
import {
  createWorld, DEFAULT_SETTINGS, OUTAGE_SCENARIO, POISON_SCENARIO, REDRIVE_SCENARIO, redrive, redriveStart, run, TICK, toTicks, type Settings,
  type SimEvent,
} from './model';
import { advance, createLive, LANE_CELLS, redrivenAfter, snapshot, TIME_SCALE } from './sim';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const ctx = (s: Settings, over: Partial<NarrationContext> = {}): NarrationContext => ({ settings: s, scenario: POISON_SCENARIO, dlqDepth: 1, lost: 0, down: false, ...over });

describe('captions say what the model did', () => {
  const policies: Settings[] = [];
  for (const policy of ['forever', 'max-attempts', 'drop'] as const) {
    for (const backoff of [false, true]) for (const classify of [false, true]) policies.push(settings({ policy, backoff, classify, maxAttempts: 4 }));
  }

  it('every policy line and intro reads cleanly and names the settings it describes', () => {
    for (const s of policies) {
      const text = expectCaption(policyLine(s));
      expect(text).toContain({ forever: 'retry forever', 'max-attempts': 'max 4 attempts', drop: 'drop on error' }[s.policy]);
      expect(text.includes('backoff') || text.includes('growing waits')).toBe(s.policy !== 'drop' ? s.backoff : false);
      expect(text.includes('straight away')).toBe(s.policy === 'max-attempts' && s.classify);
      for (const scene of ['poison', 'transient', 'redrive'] as const) {
        expect(expectCaption(introCaption(scene, s, scene === 'transient' ? OUTAGE_SCENARIO : POISON_SCENARIO)).length).toBeGreaterThan(40);
      }
    }
  });

  it('the transient intro quotes the outage window from the scenario', () => {
    const text = expectCaption(introCaption('transient', settings({ policy: 'max-attempts' }), OUTAGE_SCENARIO));
    expect(text).toContain('goes down for 20 s, starting at 5 s');
  });

  it('a failure is narrated once per message, and only its first attempt', () => {
    const told = new Set<string>();
    const first: SimEvent = { kind: 'failed', id: 4, error: 'validation', attempt: 1 };
    expect(expectCaption(eventCaption(first, ctx(policies[0]), told))).toContain('#4');
    expect(eventCaption(first, ctx(policies[0]), told)).toBeNull();
    expect(eventCaption({ ...first, attempt: 2 }, ctx(policies[0]), told)).toBeNull();
    expect(eventCaption({ kind: 'failed', id: 9, error: 'timeout', attempt: 1 }, ctx(policies[0]), told)).not.toBeNull();
    expect(eventCaption({ kind: 'failed', id: 10, error: 'timeout', attempt: 1 }, ctx(policies[0]), told)).toBeNull();
  });

  it('parked captions come only at the milestone depths and quote the depth, attempts and cause', () => {
    for (const depth of [1, 2, 9, 10, 11, 50, 100, 101]) {
      const e: SimEvent = { kind: 'parked', id: 7, error: 'timeout', attempts: 3 };
      const say = eventCaption(e, ctx(policies[2], { dlqDepth: depth }), new Set());
      if (!DLQ_MILESTONES.includes(depth)) {
        expect(say).toBeNull();
        continue;
      }
      const text = expectCaption(say);
      expect(text).toContain('3 attempts');
      expect(text).toContain('timeout');
      if (depth > 1) expect(text).toContain(`holds ${depth} messages`);
    }
    const poison = expectCaption(eventCaption({ kind: 'parked', id: 4, error: 'validation', attempts: 3 }, ctx(policies[2]), new Set()));
    expect(poison).toContain('validation error');
    expect(poison).toContain('Parked, not lost');
  });

  it('the outage-end caption matches what happened: lost, parked or neither', () => {
    const end: SimEvent = { kind: 'outage-end' };
    expect(expectCaption(eventCaption(end, ctx(policies[0], { dlqDepth: 0, lost: 3 }), new Set()))).toContain('3 good messages were dropped');
    expect(expectCaption(eventCaption(end, ctx(policies[0], { dlqDepth: 5, lost: 0 }), new Set()))).toContain('5 good messages were already parked');
    expect(expectCaption(eventCaption(end, ctx(policies[0], { dlqDepth: 0, lost: 0 }), new Set()))).toContain('nothing was parked or lost');
  });

  it('a resume says the dependency is back only when it is', () => {
    expect(expectCaption(eventCaption({ kind: 'resumed' }, ctx(policies[0], { down: false }), new Set()))).toContain('dependency is back');
    expect(expectCaption(eventCaption({ kind: 'resumed' }, ctx(policies[0], { down: true }), new Set()))).toContain('still down');
  });

  it('the redrive caption reflects the dedupe and bug settings', () => {
    const e: SimEvent = { kind: 'redriven', ids: [3, 5, 8] };
    const base = settings({ policy: 'max-attempts' });
    const a = expectCaption(eventCaption(e, ctx({ ...base, dedupe: true, bugFixed: true }), new Set()));
    expect(a).toContain('3 parked messages');
    expect(a).toContain('dedupes by message id');
    expect(a).not.toContain('bug is not fixed');
    const b = expectCaption(eventCaption(e, ctx({ ...base, dedupe: false, bugFixed: false }), new Set()));
    expect(b).toContain('does not dedupe');
    expect(b).toContain('bug is not fixed');
  });

  it('events reported by a real run all produce clean captions', () => {
    const told = new Set<string>();
    for (const [scenario, s] of [
      [POISON_SCENARIO, settings({ policy: 'max-attempts', maxAttempts: 3, backoff: true })],
      [OUTAGE_SCENARIO, settings({ policy: 'max-attempts', maxAttempts: 3, pauseWhenDown: true })],
      [OUTAGE_SCENARIO, settings({ policy: 'drop' })],
    ] as const) {
      const w = createWorld(scenario, s);
      run(w, toTicks(60));
      expect(w.events.length).toBeGreaterThan(0);
      for (const e of w.events) {
        const say = eventCaption(e, ctx(s, { scenario, dlqDepth: w.dlq.length, lost: w.dropped.length }), told);
        if (say) expectCaption(say);
      }
    }
    const w = redriveStart();
    redrive(w);
    expect(expectCaption(eventCaption(w.events.at(-1)!, ctx(w.settings), new Set()))).toContain('Redrive');
  });
});

describe('the live wrapper', () => {
  it('advances whole ticks only and carries the remainder', () => {
    const l = createLive('poison', DEFAULT_SETTINGS);
    advance(l, 1 / TIME_SCALE);
    expect(l.world.tick).toBe(20);
    advance(l, TICK / 2 / TIME_SCALE);
    expect(l.world.tick).toBe(20);
    advance(l, TICK / 2 / TIME_SCALE + 1e-9);
    expect(l.world.tick).toBe(21);
  });

  it('hands out each event exactly once', () => {
    const l = createLive('poison', settings({ policy: 'drop' }));
    const events = advance(l, 2);
    expect(events.filter((e) => e.kind === 'dropped')).toHaveLength(1);
    expect(advance(l, 0)).toEqual([]);
  });

  it('the snapshot marks the poison cell and counts waiting messages beyond the lane', () => {
    const l = createLive('poison', DEFAULT_SETTINGS);
    advance(l, 0.001);
    let s = snapshot(l);
    expect(s.lane.filter((c) => c.poison).map((c) => c.id)).toEqual([4]);
    advance(l, 5);
    s = snapshot(l);
    expect(s.lane).toHaveLength(LANE_CELLS);
    expect(s.more).toBe(s.stats.lag - LANE_CELLS);
    expect(s.headId).toBe(4);
    expect(s.headAttempts).toBeGreaterThan(10);
    l.world.settings.bugFixed = true;
    expect(snapshot(l).lane.some((c) => c.poison)).toBe(false);
  });

  it('with backoff the snapshot says when the next try is due', () => {
    const l = createLive('poison', settings({ backoff: true }));
    while (l.world.attemptsOf.get(4) !== 1) advance(l, 0.001);
    expect(snapshot(l).retryIn).toBeCloseTo(1, 6);
  });

  it('the lag history samples twice a second of simulated time and is capped', () => {
    const l = createLive('poison', DEFAULT_SETTINGS);
    advance(l, 10);
    expect(Math.abs(snapshot(l).lagHistory.length - 30 / 0.5)).toBeLessThanOrEqual(1);
    advance(l, 100);
    expect(snapshot(l).lagHistory.length).toBe(60);
  });

  it('the redrive scene starts at rest with the DLQ holding the three bad messages', () => {
    const l = createLive('redrive', settings({ policy: 'max-attempts' }));
    const s = snapshot(l);
    expect(s.dlq.map((e) => e.id)).toEqual([3, 5, 8]);
    expect(s.stats.lag).toBe(0);
    expect(REDRIVE_SCENARIO.poison.size).toBe(3);
  });
});

describe('the redriven list', () => {
  it('says which higher id each redriven message came after', () => {
    expect(redrivenAfter([1, 2, 4, 9, 10, 3, 11, 5], new Set([3, 5]))).toEqual([{ id: 3, after: 10 }, { id: 5, after: 11 }]);
    expect(redrivenAfter([1, 2, 3], new Set())).toEqual([]);
  });

  it('matches a real redrive: the three parked messages all come after newer ones', () => {
    const l = createLive('redrive', settings({ policy: 'max-attempts' }));
    advance(l, 1);
    l.world.settings.bugFixed = true;
    redrive(l.world);
    advance(l, 2);
    const list = snapshot(l).redriven;
    expect(list.map((r) => r.id).sort()).toEqual([3, 5, 8]);
    expect(list.every((r) => r.after > 12)).toBe(true);
  });
});

describe('the insight captions', () => {
  it('head-of-line blocking is called out with its real numbers once the lag is large', () => {
    const l = createLive('poison', DEFAULT_SETTINGS);
    advance(l, 0.3);
    expect(insightCaption(snapshot(l), l.world.settings)).toBeNull();
    advance(l, 8);
    const s = snapshot(l);
    const text = expectCaption(insightCaption(s, l.world.settings));
    expect(text).toContain('lag has passed 30');
    expect(text).toContain('head-of-line blocking');
  });

  it('is silent once the bug is fixed and the lane drains', () => {
    const l = createLive('poison', DEFAULT_SETTINGS);
    advance(l, 8);
    l.world.settings.bugFixed = true;
    advance(l, 5);
    expect(insightCaption(snapshot(l), l.world.settings)).toBeNull();
  });

  it('a quiet queue with a full DLQ says so, and only when nothing was dropped', () => {
    const l = createLive('redrive', settings({ policy: 'max-attempts' }));
    expect(expectCaption(insightCaption(snapshot(l), l.world.settings))).toContain('DLQ holds 3');
    l.world.dropped.push(99);
    expect(insightCaption(snapshot(l), l.world.settings)).toBeNull();
  });
});
