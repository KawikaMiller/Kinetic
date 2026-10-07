import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  advance, backlogRising, BACKLOG_WARN, Broker, createWorld, MAX_ATTEMPTS, publishPoison, REDELIVER_AFTER, SUBSCRIBERS,
  takeInsight, type Msg, type SimEvent,
} from './sim';

const DT = 1 / 60;

beforeEach(() => vi.spyOn(Math, 'random').mockImplementation(mulberry32(7)));
afterEach(() => vi.restoreAllMocks());

/** Step the broker until `until` holds (or give up), collecting its events with each message's attempts at that moment. */
function runUntil(b: Broker, until: () => boolean, max = 60): (SimEvent & { attempts: number })[] {
  const events: (SimEvent & { attempts: number })[] = [];
  for (let t = 0; t < max && !until(); t += DT) {
    b.step(DT);
    events.push(...b.events.splice(0).map((e) => ({ ...e, attempts: e.msg.attempts })));
  }
  return events;
}
const only = (b: Broker): Msg => b.msgs[0];

describe('redelivery without an ack', () => {
  it('a crashed consumer\'s message stays owned by the broker, then comes back to the front after the timeout', () => {
    const b = new Broker('work', 1);
    b.publish(0);
    b.publish(0);
    runUntil(b, () => only(b).state === 'processing');
    const crashed = b.crashOne()!;
    expect(crashed.msg).toBe(only(b));
    expect(only(b).state).toBe('unacked');
    const crashAt = b.now;
    const events = runUntil(b, () => only(b).state !== 'unacked');
    expect(b.now - crashAt).toBeGreaterThanOrEqual(REDELIVER_AFTER);
    expect(events.map((e) => e.kind)).toContain('redelivered');
    expect(b.lanes[0][0]).toBe(only(b)); // back at the head, ahead of the second message
    expect(only(b).attempts).toBe(1);
    runUntil(b, () => only(b).state === 'done', 10);
    expect(only(b).state).toBe('done'); // nothing is lost
  });

  it('a crash past halfway counts as the work done, so the redelivery is a duplicate; an early crash is not', () => {
    for (const [fraction, dup] of [[0.8, 1], [0.2, 0]] as const) {
      const b = new Broker('work', 1);
      b.publish(0);
      runUntil(b, () => only(b).state === 'processing');
      const c = b.consumers[0];
      runUntil(b, () => b.now - c.started >= c.duration * fraction);
      b.crashOne();
      const events = runUntil(b, () => only(b)?.state === 'done', 20);
      expect(b.duplicates).toBe(dup);
      expect(events.some((e) => e.kind === 'duplicate')).toBe(dup === 1);
    }
  });

  it('crashing an idle consumer drops nothing, and the caption knows it', () => {
    const b = new Broker('work', 2);
    expect(b.crashOne()!.msg).toBeNull();
  });
});

describe('the dead-letter queue', () => {
  it(`a poison message is retried, then dead-lettered on attempt ${MAX_ATTEMPTS}, while other messages keep flowing`, () => {
    const b = new Broker('work', 1);
    b.publish(0, true);
    b.publish(0);
    b.publish(0);
    const events = runUntil(b, () => b.dlqTotal === 1, 30);
    const poison = events.filter((e) => e.kind === 'poisonRetry' || e.kind === 'dlq');
    expect(poison.map((e) => [e.kind, e.attempts])).toEqual([['poisonRetry', 1], ['poisonRetry', 2], ['dlq', MAX_ATTEMPTS]]);
    expect(b.dlq).toHaveLength(1);
    runUntil(b, () => b.msgs.every((m) => m.state === 'done' || m.state === 'dlq'), 10);
    expect(b.msgs.filter((m) => !m.poison).every((m) => m.state === 'done')).toBe(true);
  });

  it('a crash while holding the poison message counts as a failed attempt too', () => {
    const b = new Broker('work', 1);
    b.publish(0, true);
    runUntil(b, () => only(b).state === 'processing');
    b.crashOne();
    const events = runUntil(b, () => b.dlqTotal === 1, 30);
    expect(events.filter((e) => e.kind === 'poisonRetry')).toHaveLength(1); // crash + 1 nack + the final failure
    expect(b.dlq[0].attempts).toBe(MAX_ATTEMPTS);
  });
});

describe('the stage\'s world', () => {
  /** Run a seeded world, tracking every message that ever reaches done or the DLQ (the broker forgets them soon after). */
  function run(mode: 'work' | 'pubsub', consumers: number, seconds: number, rate = 3) {
    const w = createWorld(mode, consumers, rate, 1);
    const finished = new Set<number>();
    const depths: number[] = [];
    const more = (secs: number) => {
      for (let t = 0; t < secs; t += DT) {
        advance(w, DT);
        for (const m of w.broker.msgs) if (m.state === 'done' || m.state === 'dlq') finished.add(m.id);
        depths.push(w.broker.depth());
      }
    };
    more(seconds);
    return { w, finished, depths, more };
  }

  it('the default (3/s into 2 workers at ~1/s each) builds a backlog; 4 workers keep up', () => {
    const slow = run('work', 2, 60);
    expect(slow.depths.at(-1)!).toBeGreaterThan(BACKLOG_WARN);
    const fast = run('work', 4, 60);
    expect(Math.max(...fast.depths.slice(-600))).toBeLessThan(BACKLOG_WARN);
    const perWorker = fast.finished.size / 60 / 4;
    expect(perWorker).toBeGreaterThan(0.6);
    expect(perWorker).toBeLessThan(1.05);
  });

  it('raising consumers drains an existing backlog', () => {
    const { w } = run('work', 2, 40);
    const before = w.broker.depth();
    w.broker.setConsumers(6);
    for (let t = 0; t < 20; t += DT) advance(w, DT);
    expect(w.broker.depth()).toBeLessThan(before / 2);
  });

  it('nothing is lost: every published copy is done, dead-lettered, or still in the broker', () => {
    const { w, finished, more } = run('work', 2, 30);
    publishPoison(w);
    w.broker.crashOne();
    more(30);
    const live = w.broker.msgs.filter((m) => m.state !== 'done' && m.state !== 'dlq').length;
    expect(finished.size + live).toBe(w.broker.published);
    expect(w.broker.dlqTotal).toBe(1);
  });

  it('pub/sub copies each message to every subscriber; slow analytics backs up, email and search don\'t', () => {
    const { w } = run('pubsub', 0, 60);
    const [email, analytics, search] = w.broker.lanes.map((q) => q.length);
    expect(SUBSCRIBERS[1].name).toBe('analytics');
    expect(analytics).toBeGreaterThan(20);
    expect(Math.max(email, search)).toBeLessThan(6);
    const copies = new Map<number, number>();
    for (const m of w.broker.msgs) copies.set(m.seq, (copies.get(m.seq) ?? 0) + 1);
    expect(w.broker.msgs.length).toBeGreaterThan(0);
    expect(Math.max(...copies.values())).toBeLessThanOrEqual(SUBSCRIBERS.length);
  });

  it('the backlog caption only fires while the backlog is rising', () => {
    const { w } = run('work', 2, 40);
    expect(backlogRising(w.broker)).toBe(true);
    expect(takeInsight(w, w.broker.stats())).toBe('backlog');
    w.broker.setConsumers(6);
    for (let t = 0; t < 6; t += DT) advance(w, DT); // draining, still deep
    expect(w.broker.depth()).toBeGreaterThan(BACKLOG_WARN);
    expect(backlogRising(w.broker)).toBe(false);
    for (let t = 0; t < 13; t += DT) advance(w, DT); // past the cooldown
    expect(takeInsight(w, w.broker.stats())).not.toBe('backlog');
  });
});
