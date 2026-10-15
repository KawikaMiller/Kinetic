import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import {
  BROKER, CONSUMER, DEFAULT_LOSS, DELIVERY_BROKEN_SEED, HORIZON_MS, countersAt, countersOf, deliveryCluster, deliveryScenario, doneMeansProcessed, linkTotals, lowestSeedBreaking, neverProcessedTwice,
  type DeliveryMode,
} from './delivery';

const SEEDS = 500;
const hand = { seed: 0, loss: 0, fixedLatencyMs: 5, messages: 1 } as const;
const bounds = { until: HORIZON_MS };

describe('at most once: never processes a message twice, but can lose one', () => {
  it('hand-built: the only message is dropped and nothing is ever processed', () => {
    const c = deliveryCluster({ ...hand, mode: 'at-most-once' });
    c.dropNext((m) => m.payload.type === 'deliver');
    c.run({ until: HORIZON_MS });
    expect(countersOf(c, 1)).toEqual({ sent: 1, delivered: 0, duplicates: 0, lost: 1 });
  });
  it(`${SEEDS} seeds with 30% loss and a consumer crash: no message is ever processed twice, at every step`, () => {
    expect(forSeeds(SEEDS, deliveryScenario('at-most-once', DEFAULT_LOSS, true), [neverProcessedTwice], bounds)).toEqual({ ok: true, seeds: SEEDS });
  });
  it('and it does lose messages on those seeds (the guarantee has a price)', () => {
    let lossy = 0;
    for (let seed = 0; seed < 100; seed++) {
      const c = deliveryCluster({ seed, mode: 'at-most-once', loss: DEFAULT_LOSS });
      c.run({ until: HORIZON_MS });
      if (countersOf(c).lost > 0) lossy++;
    }
    expect(lossy).toBeGreaterThan(50);
  });
});

describe('at least once: never loses an acknowledged message, can duplicate', () => {
  it('hand-built: dropNext on the first ack makes the broker retry and the consumer process the message twice', () => {
    const c = deliveryCluster({ ...hand, mode: 'at-least-once' });
    c.dropNext((m) => m.payload.type === 'ack');
    c.run({ until: HORIZON_MS });
    expect(countersOf(c, 1)).toEqual({ sent: 2, delivered: 2, duplicates: 1, lost: 0 });
    const again = deliveryCluster({ ...hand, mode: 'at-least-once' });
    again.dropNext((m) => m.payload.type === 'ack');
    expect(checkInvariants(again, [neverProcessedTwice], bounds).ok).toBe(false);
  });
  it('with nothing dropped there is exactly one delivery and one processing', () => {
    const c = deliveryCluster({ ...hand, mode: 'at-least-once' });
    c.run({ until: HORIZON_MS });
    expect(countersOf(c, 1)).toEqual({ sent: 1, delivered: 1, duplicates: 0, lost: 0 });
  });
  it(`${SEEDS} seeds with 30% loss and a consumer crash: a message the broker considers done was always processed, at every step`, () => {
    expect(forSeeds(SEEDS, deliveryScenario('at-least-once', DEFAULT_LOSS, true), [doneMeansProcessed], bounds)).toEqual({ ok: true, seeds: SEEDS });
  });
  it(`DELIVERY_BROKEN_SEED ${DELIVERY_BROKEN_SEED} is the lowest seed on which at-least-once at 30% loss processes a message twice`, () => {
    expect(lowestSeedBreaking('at-least-once', DEFAULT_LOSS, false, 300)).toBe(DELIVERY_BROKEN_SEED);
  });
  it('on that seed the cause is a lost ack: the same seed with no loss has no duplicate, and the trace has a dropped ack before the second delivery', () => {
    const lossy = deliveryCluster({ seed: DELIVERY_BROKEN_SEED, mode: 'at-least-once', loss: DEFAULT_LOSS });
    lossy.run({ until: HORIZON_MS });
    expect(countersOf(lossy).duplicates).toBeGreaterThan(0);
    const dup = Object.entries(lossy.snapshot().nodes[CONSUMER].state!.counts).find(([, n]) => n > 1)![0];
    const second = lossy.trace.filter((r) => r.kind === 'deliver' && r.payload?.type === 'deliver' && r.payload.id === Number(dup))[1];
    const droppedAck = lossy.trace.find((r) => r.kind === 'drop' && r.payload?.type === 'ack' && r.payload.id === Number(dup) && r.t <= second.t);
    expect(droppedAck).toBeDefined();
    const clean = deliveryCluster({ seed: DELIVERY_BROKEN_SEED, mode: 'at-least-once', loss: 0 });
    clean.run({ until: HORIZON_MS });
    expect(countersOf(clean).duplicates).toBe(0);
  });
  it('liveness, apart from safety: with bounded loss and enough time every message is processed at least once, on 300 seeds with a crash', () => {
    for (let seed = 0; seed < 300; seed++) {
      const c = deliveryCluster({ seed, mode: 'at-least-once', loss: DEFAULT_LOSS, crash: true });
      c.run({ until: 3000 });
      expect(countersOf(c).lost, `seed ${seed}`).toBe(0);
    }
  });
});

describe('"exactly-once delivery" by acks of acks is Two Generals again', () => {
  it('hand-built: the same lost ack still gives a duplicate', () => {
    const c = deliveryCluster({ ...hand, mode: 'exactly-once' });
    c.dropNext((m) => m.payload.type === 'ack');
    c.run({ until: HORIZON_MS });
    expect(countersOf(c, 1).duplicates).toBe(1);
  });
  it('hand-built: when every confirm is lost the broker is done but the consumer never learns it, and keeps re-sending its ack', () => {
    const c = deliveryCluster({ ...hand, mode: 'exactly-once' });
    for (let i = 0; i < 50; i++) c.dropNext((m) => m.payload.type === 'confirm');
    c.run({ until: HORIZON_MS });
    const snap = c.snapshot();
    expect(snap.nodes[BROKER].state!.done).toEqual([1]);
    expect(snap.nodes[CONSUMER].state!.confirmed).toEqual([]);
    expect(c.trace.filter((r) => r.kind === 'send' && r.payload?.type === 'ack').length).toBeGreaterThan(5);
  });
  it('over many seeded runs it still duplicates: acks of acks do not remove the duplicate', () => {
    expect(lowestSeedBreaking('exactly-once', DEFAULT_LOSS, false, 300)).not.toBeNull();
  });
  it('the modes differ the way the lesson says on one seed: at-most-once never duplicates, the others can', () => {
    const dups = (mode: DeliveryMode) => {
      let n = 0;
      for (let seed = 0; seed < 100; seed++) {
        const c = deliveryCluster({ seed, mode, loss: DEFAULT_LOSS });
        c.run({ until: HORIZON_MS });
        n += countersOf(c).duplicates;
      }
      return n;
    };
    expect(dups('at-most-once')).toBe(0);
    expect(dups('at-least-once')).toBeGreaterThan(0);
    expect(dups('exactly-once')).toBeGreaterThan(0);
  });
  it('same seed, same trace', () => {
    const a = deliveryCluster({ seed: 3, mode: 'exactly-once', loss: 0.3, crash: true });
    a.run({ until: HORIZON_MS });
    const b = deliveryCluster({ seed: 3, mode: 'exactly-once', loss: 0.3, crash: true });
    b.run({ until: HORIZON_MS });
    expect(a.trace).toEqual(b.trace);
  });
});

describe('the replayed counters match the diagram they sit beside', () => {
  const MODES: DeliveryMode[] = ['at-most-once', 'at-least-once', 'exactly-once'];
  const upTo = (mode: DeliveryMode, seed: number, crash: boolean, until: number) => {
    const c = deliveryCluster({ seed, mode, loss: DEFAULT_LOSS, crash });
    c.run({ until });
    return c;
  };
  it('a run stopped at t gives the same sent, delivered and duplicate counts as a fresh run that ends at t (independent of the trace filter), for every mode and crash setting', () => {
    for (const mode of MODES) {
      for (const crash of [false, true]) {
        for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
          const full = upTo(mode, seed, crash, HORIZON_MS);
          for (const t of [0, 60, 150, 300, HORIZON_MS]) {
            const early = countersOf(upTo(mode, seed, crash, t));
            const replay = countersAt(full, t);
            expect([replay.sent, replay.delivered, replay.duplicates], `${mode} crash=${crash} seed ${seed} t=${t}`).toEqual([early.sent, early.delivered, early.duplicates]);
          }
          expect(countersAt(full, HORIZON_MS).lost).toBe(countersOf(full).lost);
        }
      }
    }
  });
  it('the consumer is unsure of exactly the messages it processed without hearing a confirm, against the consumer\'s own record', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      for (const t of [60, 150, 300, HORIZON_MS]) {
        const early = upTo('exactly-once', seed, false, t);
        const state = early.snapshot().nodes[CONSUMER].state!;
        const expected = Object.keys(state.counts).filter((id) => state.counts[Number(id)] > 0 && !state.confirmed.includes(Number(id))).length;
        expect(linkTotals(upTo('exactly-once', seed, false, HORIZON_MS), t).unsure, `seed ${seed} t=${t}`).toBe(expected);
      }
    }
  });
  it('acks of acks put more messages on the link than at-least-once on the same seed, though the delivery counters match', () => {
    const alo = upTo('at-least-once', DELIVERY_BROKEN_SEED, false, HORIZON_MS);
    const eo = upTo('exactly-once', DELIVERY_BROKEN_SEED, false, HORIZON_MS);
    expect(linkTotals(eo, HORIZON_MS).messages).toBeGreaterThan(linkTotals(alo, HORIZON_MS).messages);
  });
});
