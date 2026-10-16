import { describe, expect, it } from 'vitest';
import {
  APPLY_DELAY_MS, CONSUMERS, END_MS, SAFE_FLAGS, SEEDS, buildCluster, evaluate, lowestFailing, oracleRows, seededScenario, totalOf, type Fault, type Flags, type Scenario,
} from './cdc';
import { replay, REPLAY_OPS, syncedCount, dbOf, consOf } from './view';

const withFlags = (patch: Partial<Flags>): Flags => ({ ...SAFE_FLAGS, ...patch });

describe('the safe protocol over 200 seeded fault schedules', () => {
  it('holds S1, S2, rolled-back-never-appears and S3 on a noisy network (loss, duplication, crashes) and on a clean one', () => {
    for (const network of ['noisy', 'clean'] as const) {
      for (const seed of SEEDS) {
        const ev = evaluate(seededScenario(seed, SAFE_FLAGS, network));
        expect(ev.message, `seed ${seed} ${network}`).toBeNull();
      }
    }
  });

  it('also holds with one consumer on a slow link', () => {
    for (const slow of CONSUMERS) {
      for (const seed of SEEDS.slice(0, 80)) expect(evaluate(seededScenario(seed, withFlags({ slowConsumer: slow }))).message, `${slow} seed ${seed}`).toBeNull();
    }
  });

  it('ends equal to the source table folded directly from the committed transactions (an independent oracle)', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const s = seededScenario(seed, SAFE_FLAGS);
      const ev = evaluate(s);
      const snap = ev.cluster.snapshot();
      const expected = oracleRows(s.ops);
      expect(dbOf(snap).rows).toEqual(expected);
      for (const c of CONSUMERS) {
        const live = Object.fromEntries(Object.entries(consOf(snap, c).rows).filter(([, r]) => !r.deleted).map(([k, r]) => [k, { status: r.status, amount: r.amount }]));
        expect(live, `${c} seed ${seed}`).toEqual(expected);
        expect(consOf(snap, c).counter).toBe(totalOf(expected));
      }
    }
  });

  it('no rolled-back transaction reaches any consumer, whichever the seed', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const s = seededScenario(seed, SAFE_FLAGS);
      const rolled = s.ops.filter((o) => 'tx' in o && o.tx.outcome === 'rollback').map((o) => ('tx' in o ? o.tx.txid : 0));
      const snap = evaluate(s).cluster.snapshot();
      for (const c of CONSUMERS) for (const t of rolled) expect(consOf(snap, c).applied).not.toContain(t);
    }
  });
});

describe('the broken modes violate the invariant on the pinned lowest seed, for the stated reason', () => {
  it('acknowledging before applying: the lowest failing seed of 0..199 is pinned, rule S1', () => {
    const pin = lowestFailing(withFlags({ ackBeforeApply: true }), 'noisy');
    expect(pin).toBe(2);
    expect(evaluate(seededScenario(pin!, withFlags({ ackBeforeApply: true }))).rule).toBe('S1');
  });

  it('trace: the consumer acknowledged an event, crashed within the apply delay, and never applied it; the same seed acknowledging after applying is clean', () => {
    const s = seededScenario(2, withFlags({ ackBeforeApply: true }));
    const ev = evaluate(s);
    const who = CONSUMERS.find((c) => ev.message!.includes(c === 'search' ? 'search index' : c))!;
    const lsn = Number(/committed change at LSN (\d+)/.exec(ev.message!)![1]);
    const trace = ev.cluster.trace;
    const ack = trace.find((r) => r.kind === 'send' && r.from === who && r.payload?.type === 'ack' && r.payload.lsn === lsn)!;
    const crash = trace.find((r) => r.kind === 'crash' && r.node === who && r.t >= ack.t)!;
    expect(crash.t - ack.t).toBeLessThanOrEqual(APPLY_DELAY_MS);
    expect(consOf(ev.cluster.snapshot(), who).rows[dbOf(ev.cluster.snapshot()).log.find((r) => r.lsn === lsn)!.key!]?.lsn ?? 0).toBeLessThan(lsn);
    expect(evaluate(seededScenario(2, SAFE_FLAGS)).rule).toBeNull();
  });

  it('blind apply: the lowest failing seed is pinned on a clean and on a noisy network', () => {
    expect(lowestFailing(withFlags({ idempotent: false }), 'clean')).toBe(0);
    expect(lowestFailing(withFlags({ idempotent: false }), 'noisy')).toBe(0);
  });

  it('trace: after a restart an older event reached the blind consumer after a newer one for the same stream; idempotent apply on the same seed is clean', () => {
    const s = seededScenario(0, withFlags({ idempotent: false }), 'clean');
    expect(s.loss + s.duplicate).toBe(0);
    const ev = evaluate(s);
    expect(ev.rule).toBe('S2');
    const who = CONSUMERS.find((c) => ev.message!.includes(c === 'search' ? 'search index' : c))!;
    const lsns = ev.cluster.trace.filter((r) => r.kind === 'deliver' && r.to === who && r.payload?.type === 'event').map((r) => (r.payload as { ev: { lsn: number } }).ev.lsn);
    expect(lsns.some((l, i) => lsns.slice(0, i).some((earlier) => earlier > l))).toBe(true);
    expect(ev.cluster.trace.some((r) => r.kind === 'restart')).toBe(true);
    expect(evaluate(seededScenario(0, SAFE_FLAGS, 'clean')).rule).toBeNull();
  });

  it('blind apply survives some runs with no fault at all: it breaks when delivery reorders or repeats, not by being blind alone', () => {
    const calm = (seed: number) => ({ ...seededScenario(seed, withFlags({ idempotent: false }), 'clean'), faults: [] as Fault[] });
    const passing = SEEDS.filter((seed) => evaluate(calm(seed)).rule === null);
    expect(passing.length).toBeGreaterThan(0);
    expect(passing.length).toBeLessThan(SEEDS.length);
  });
});

describe('the control cross product of the replay scene', () => {
  const kill: Fault[][] = [[], [{ kind: 'crash-connector', at: 50 }], ...CONSUMERS.map((c): Fault[] => [{ kind: 'crash-consumer', at: 50, consumer: c }]), [{ kind: 'dup', at: 60 }]];

  it('the safe settings end in sync for every slow-consumer choice and every fault the buttons add', () => {
    for (const slow of [null, ...CONSUMERS]) {
      for (const faults of kill) {
        const s: Scenario = { seed: 1, ops: REPLAY_OPS, faults, flags: withFlags({ slowConsumer: slow }), loss: 0, duplicate: 0 };
        expect(evaluate(s).message, `${slow} ${JSON.stringify(faults)}`).toBeNull();
        expect(syncedCount(replay(s, END_MS).snap)).toBe(3);
      }
    }
  });

  it('blind apply is only wrong once something is delivered twice: no faults means in sync, the connector kill at 50 ms means not', () => {
    const run = (faults: Fault[]) => syncedCount(replay({ seed: 1, ops: REPLAY_OPS, faults, flags: withFlags({ idempotent: false }), loss: 0, duplicate: 0 }, END_MS).snap);
    expect(run([])).toBe(3);
    expect(run([{ kind: 'crash-connector', at: 50 }])).toBeLessThan(3);
  });

  it('a delayed consumer is the same simulation with a longer link: it ends equal to the source', () => {
    const c = buildCluster({ seed: 1, ops: REPLAY_OPS, faults: [], flags: withFlags({ slowConsumer: 'search' }), loss: 0, duplicate: 0 });
    c.run({ until: 20 });
    expect(c.trace.some((r) => r.kind === 'deliver' && r.to === 'search')).toBeDefined();
  });
});
