import { describe, expect, it } from 'vitest';
import {
  backoffDelay, BACKOFF_MAX, createWorld, DEFAULT_SETTINGS, MAX_ATTEMPTS_LIMIT, OUTAGE_SCENARIO, outOfOrderCount, POISON_SCENARIO, redrive,
  redriveStart, run, runUntilDrained, stats, TICK, tick, toSeconds, toTicks, type Scenario, type Settings, type World,
} from './model';

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const secs = (s: number) => toTicks(s);

/** Every message produced is exactly one of: waiting, processed, parked or dropped. */
const conserved = (w: World) =>
  w.produced === w.queue.length + w.processed.length + w.dlq.length + w.dropped.length;

describe('the queue model', () => {
  it('with nothing wrong, every message is processed once and in order', () => {
    const calm: Scenario = { backlog: 5, rate: 10, total: 100, poison: new Map(), outage: null };
    const w = runUntilDrained(createWorld(calm));
    expect(w.processed).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(w.dlq).toEqual([]);
    expect(w.dropped).toEqual([]);
    expect(stats(w).oldestAge).toBe(0);
  });

  it('produced = waiting + processed + parked + dropped after every tick, for every policy and outage setting', () => {
    for (const policy of ['forever', 'max-attempts', 'drop'] as const) {
      for (const backoff of [false, true]) for (const pauseWhenDown of [false, true]) for (const classify of [false, true]) {
        for (const scenario of [POISON_SCENARIO, OUTAGE_SCENARIO]) {
          const w = createWorld(scenario, settings({ policy, backoff, pauseWhenDown, classify, maxAttempts: 3 }));
          for (let i = 0; i < 1200; i++) {
            tick(w);
            if (!conserved(w)) throw new Error(`not conserved at tick ${w.tick}: ${policy} ${backoff} ${pauseWhenDown} ${classify}`);
          }
        }
      }
    }
  });

  it('the backoff schedule doubles from one second and is capped', () => {
    expect([1, 2, 3, 4, 5, 6].map(backoffDelay)).toEqual([1, 2, 4, 8, 8, 8]);
    expect(backoffDelay(30)).toBe(BACKOFF_MAX);
  });
});

describe('retry forever blocks the partition', () => {
  const poisonRun = (extra: Partial<Settings> = {}) => createWorld(POISON_SCENARIO, settings({ policy: 'forever', ...extra }));

  it('everything behind the poison message waits: the processed count freezes at 3 while lag only grows', () => {
    for (const backoff of [false, true]) {
      const w = poisonRun({ backoff });
      run(w, secs(1));
      const frozen = w.processed.length;
      expect(frozen).toBe(3);
      let lag = stats(w).lag;
      for (let i = 0; i < secs(60); i++) {
        tick(w);
        const now = stats(w).lag;
        expect(now).toBeGreaterThanOrEqual(lag);
        lag = now;
        expect(w.processed.length).toBe(frozen);
      }
      expect(lag).toBeGreaterThan(500);
      expect(w.queue[0].id).toBe(4);
      expect(stats(w).oldestAge).toBeGreaterThan(55);
    }
  });

  it('attempts on the poison message keep counting up and it never leaves', () => {
    const w = run(poisonRun(), 600);
    expect(w.attemptsOf.get(4)).toBeGreaterThan(500);
    expect(w.dlq).toEqual([]);
    expect(w.dropped).toEqual([]);
  });

  it('with backoff it tries far less often, but still blocks', () => {
    const w = run(poisonRun({ backoff: true }), secs(60));
    // attempts at 0, 1, 3, 7, 15, 23, ... seconds after the first failure
    expect(w.attemptsOf.get(4)).toBeLessThan(15);
    expect(stats(w).lag).toBeGreaterThan(500);
  });

  it('once the bug is fixed the lane drains and every message is processed', () => {
    const w = run(poisonRun(), secs(5));
    w.settings.bugFixed = true;
    run(w, secs(10));
    expect(w.processed).toContain(4);
    expect(stats(w).lag).toBeLessThan(3);
  });
});

describe('max attempts, then the dead-letter queue', () => {
  it('the poison message is attempted exactly N times and parked, and every other message is processed exactly once', () => {
    for (let n = 1; n <= MAX_ATTEMPTS_LIMIT; n++) {
      for (const backoff of [false, true]) {
        const w = createWorld({ ...POISON_SCENARIO, total: 60 }, settings({ policy: 'max-attempts', maxAttempts: n, backoff }));
        runUntilDrained(w);
        expect(w.attemptsOf.get(4)).toBe(n);
        expect(w.dlq).toHaveLength(1);
        expect(w.dlq[0]).toMatchObject({ id: 4, error: 'validation', attempts: n });
        const others = Array.from({ length: 60 }, (_, i) => i + 1).filter((id) => id !== 4);
        expect(w.processed).toEqual(others);
        for (const id of others) expect(w.attemptsOf.get(id)).toBe(1);
      }
    }
  });

  it('backoff spaces the attempts out: with N = 3 the poison message holds the lane for 3 s, without it 0.1 s', () => {
    const hold = (backoff: boolean) => {
      const w = createWorld({ ...POISON_SCENARIO, total: 30 }, settings({ policy: 'max-attempts', maxAttempts: 3, backoff }));
      while (!w.dlq.length) tick(w);
      return toSeconds(w.dlq[0].at);
    };
    const withBackoff = hold(true);
    const without = hold(false);
    // waits of 1 s and 2 s between the three attempts, against one tick each
    expect(withBackoff - without).toBeCloseTo(1 + 2 - 2 * TICK, 6);
  });

  it('classifying errors parks a validation error after one attempt, however many were allowed', () => {
    const w = createWorld({ ...POISON_SCENARIO, total: 60 }, settings({ policy: 'max-attempts', maxAttempts: 5, classify: true }));
    runUntilDrained(w);
    expect(w.attemptsOf.get(4)).toBe(1);
    expect(w.dlq).toMatchObject([{ id: 4, error: 'validation', attempts: 1 }]);
  });

  it('a timeout is transient even with classification: it is retried, not parked early', () => {
    const w = createWorld(OUTAGE_SCENARIO, settings({ policy: 'max-attempts', maxAttempts: 3, classify: true }));
    run(w, secs(5) + 1);
    const failed = w.events.filter((e) => e.kind === 'failed');
    expect(failed.map((e) => e.error)).toEqual(['timeout', 'timeout']);
    expect(failed.map((e) => e.attempt)).toEqual([1, 2]);
    expect(w.dlq).toEqual([]);
  });
});

describe('drop on error', () => {
  it('the lane drains, and the number lost equals the number of poison messages', () => {
    const many: Scenario = { backlog: 0, rate: 10, total: 80, poison: new Map([[4, 'validate'], [20, 'validate'], [21, 'after-effect'], [70, 'validate']]), outage: null };
    const w = runUntilDrained(createWorld(many, settings({ policy: 'drop' })));
    expect(w.dropped.sort((a, b) => a - b)).toEqual([4, 20, 21, 70]);
    expect(w.processed).toHaveLength(80 - 4);
    expect(w.dlq).toEqual([]);
    expect(stats(w).lag).toBe(0);
  });

  it('with no poison nothing is lost', () => {
    const w = runUntilDrained(createWorld({ ...POISON_SCENARIO, poison: new Map(), total: 40 }, settings({ policy: 'drop' })));
    expect(w.dropped).toEqual([]);
  });
});

describe('a transient outage is not poison', () => {
  const outage = (over: Partial<Settings>) => {
    const w = createWorld(OUTAGE_SCENARIO, settings({ policy: 'max-attempts', maxAttempts: 3, ...over }));
    run(w, secs(120));
    return w;
  };

  it('max attempts without backoff parks over a hundred perfectly good messages', () => {
    const w = outage({});
    expect(w.dlq.length).toBeGreaterThan(100);
    expect(w.dlq.every((e) => e.error === 'timeout' && !OUTAGE_SCENARIO.poison.has(e.id))).toBe(true);
  });

  it('backoff alone slows the bleeding but does not stop it', () => {
    const plain = outage({});
    const backoff = outage({ backoff: true });
    expect(backoff.dlq.length).toBeGreaterThan(0);
    expect(backoff.dlq.length).toBeLessThan(plain.dlq.length / 10);
  });

  it('backoff plus pausing keeps the DLQ empty and processes every message exactly once, in order', () => {
    const w = outage({ backoff: true, pauseWhenDown: true });
    expect(w.dlq).toEqual([]);
    expect(w.dropped).toEqual([]);
    expect(w.processed).toEqual(Array.from({ length: w.processed.length }, (_, i) => i + 1));
    expect(w.processed.length + w.queue.length).toBe(w.produced);
    for (const id of w.processed) expect(w.attemptsOf.get(id)).toBe(1);
  });

  it('pausing alone is enough, since nothing is attempted while the dependency is down', () => {
    const w = outage({ pauseWhenDown: true });
    expect(w.dlq).toEqual([]);
  });

  it('lag grows during the outage even when nothing is lost, and drains afterwards', () => {
    const w = createWorld(OUTAGE_SCENARIO, settings({ policy: 'max-attempts', maxAttempts: 3, pauseWhenDown: true, backoff: true }));
    run(w, secs(24));
    expect(stats(w).lag).toBeGreaterThan(150);
    run(w, secs(60));
    expect(stats(w).lag).toBeLessThan(3);
  });

  it('the outage start and end are reported once each', () => {
    const w = outage({});
    expect(w.events.filter((e) => e.kind === 'outage-start')).toHaveLength(1);
    expect(w.events.filter((e) => e.kind === 'outage-end')).toHaveLength(1);
  });
});

describe('redrive', () => {
  it('a fix already switched on does not change the starting history: the three bad messages are still parked', () => {
    const w = redriveStart({ bugFixed: true });
    expect(w.dlq.map((e) => e.id)).toEqual([3, 5, 8]);
    expect(w.settings.bugFixed).toBe(true);
  });

  it('starts with the three bad messages parked and everything else done', () => {
    const w = redriveStart();
    expect(w.dlq.map((e) => e.id)).toEqual([3, 5, 8]);
    expect(w.dlq.map((e) => e.failsAt)).toEqual(['after-effect', 'validate', 'after-effect']);
    expect(w.processed).toEqual([1, 2, 4, 6, 7, 9, 10, 11, 12]);
    expect(w.duplicates).toBe(0);
  });

  const redriven = (over: Partial<Settings>, seconds = 10) => {
    const w = redriveStart();
    Object.assign(w.settings, over);
    run(w, secs(2));
    redrive(w);
    run(w, secs(seconds));
    return w;
  };

  it('without dedupe, redrive repeats the work for exactly the messages that had already done it', () => {
    const w = redriven({ bugFixed: true });
    expect(w.dlq).toEqual([]);
    expect(w.duplicates).toBe(2);
    expect([...w.effects].filter(([, n]) => n > 1).map(([id]) => id).sort()).toEqual([3, 8]);
    expect(w.effects.get(5)).toBe(1);
  });

  it('with dedupe, nothing is repeated', () => {
    const w = redriven({ bugFixed: true, dedupe: true });
    expect(w.duplicates).toBe(0);
    expect([...w.effects.values()].every((n) => n === 1)).toBe(true);
    expect(w.processed).toEqual(expect.arrayContaining([3, 5, 8]));
  });

  it('redriving before the fix just parks them again, and the work repeats anyway', () => {
    const w = redriven({ bugFixed: false });
    expect(w.dlq.map((e) => e.id).sort()).toEqual([3, 5, 8]);
    expect(w.duplicates).toBe(2);
  });

  it('redriven messages land behind newer ones, so order breaks', () => {
    const w = redriven({ bugFixed: true, dedupe: true });
    expect(stats(w).outOfOrder).toBeGreaterThanOrEqual(3);
    expect(w.redrivenProcessed).toEqual(new Set([3, 5, 8]));
    expect(outOfOrderCount([1, 2, 3])).toBe(0);
    expect(outOfOrderCount([1, 4, 2, 3, 5])).toBe(2);
  });

  it('redrive of an empty DLQ does nothing', () => {
    const w = createWorld({ ...POISON_SCENARIO, poison: new Map(), total: 5 }, DEFAULT_SETTINGS);
    expect(redrive(w)).toEqual([]);
    expect(w.queue).toHaveLength(5);
  });
});
