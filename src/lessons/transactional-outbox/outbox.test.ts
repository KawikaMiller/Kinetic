import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../core/distSim';
import {
  BROKER, CASE_FAULTS, CRASH_AT, DB, DEFAULT_OUTBOX, DESIGNS, FIRST_ID, HORIZON_MS, OUTBOX_SAFETY, PINNED, RELAY, SVC, caseTable, compareScenario, compareSweep, faultSetup, o1NoGhost, o3EffectOnce, outboxCluster,
  outcomeOf, pollingSetup, rulesBroken, runOutbox, unpublishedOrders, type Design, type Fault, type Outcome, type OutboxSetup, type RelayMode,
} from './outbox';

const SEEDS = 200;
const setup = (over: Partial<OutboxSetup>): OutboxSetup => ({ ...DEFAULT_OUTBOX, ...over });
const safe = (c: ReturnType<typeof outboxCluster>) => checkInvariants(c, OUTBOX_SAFETY, { until: HORIZON_MS });

describe('scene 1: the dual-write bug, every crash point against both orders', () => {
  /** The six cases and the failed publish, written by hand from the two timelines (not read from the model). */
  const BY_HAND: Record<string, Outcome> = {
    'before dbfirst': 'nothing',
    'before pubfirst': 'nothing',
    'between dbfirst': 'lost event',
    'between pubfirst': 'ghost',
    'after dbfirst': 'consistent',
    'after pubfirst': 'consistent',
    'publish-fails dbfirst': 'lost event',
    'publish-fails pubfirst': 'nothing',
  };

  it('the generated table equals the hand-written one in all eight cells', () => {
    const table = caseTable();
    expect(table).toHaveLength(CASE_FAULTS.length * 2);
    for (const c of table) expect(c.outcome, `${c.fault} ${c.design}`).toBe(BY_HAND[`${c.fault} ${c.design}`]);
  });

  it('with no crash both orders are consistent', () => {
    for (const design of ['dbfirst', 'pubfirst'] as Design[]) expect(outcomeOf(runOutbox(setup({ design }))), design).toBe('consistent');
  });

  it('the crash instants sit where they claim in the timeline: before the request, between a step\'s ack and the next step, after the last ack', () => {
    for (const design of ['dbfirst', 'pubfirst'] as Design[]) {
      const rows = runOutbox(setup({ design })).cluster.trace;
      const when = (pred: (r: (typeof rows)[number]) => boolean) => rows.find(pred)!.t;
      const request = when((r) => r.kind === 'deliver' && r.to === SVC);
      const firstAck = when((r) => r.kind === 'deliver' && r.to === SVC && (r.payload?.type === 'committed' || r.payload?.type === 'published'));
      const gap = when((r) => r.kind === 'timer' && r.node === SVC && r.detail === 'next:1');
      const lastAck = [...rows].reverse().find((r) => r.kind === 'deliver' && r.to === SVC)!.t;
      expect(CRASH_AT.before, design).toBeLessThan(request);
      expect(CRASH_AT.between, design).toBeGreaterThan(firstAck);
      expect(CRASH_AT.between, design).toBeLessThan(gap);
      expect(CRASH_AT.after, design).toBeGreaterThan(lastAck);
    }
    const outbox = runOutbox(setup({ design: 'outbox' })).cluster.trace;
    const commit = outbox.find((r) => r.kind === 'deliver' && r.to === DB)!.t;
    const ack = outbox.find((r) => r.kind === 'deliver' && r.to === SVC && r.payload?.type === 'committed')!.t;
    expect(CRASH_AT.afterCommit).toBeGreaterThan(commit);
    expect(CRASH_AT.afterCommit).toBeLessThan(ack);
    const published = outbox.find((r) => r.kind === 'send' && r.from === RELAY && r.payload?.type === 'publish')!.t;
    const publishedAck = outbox.find((r) => r.kind === 'deliver' && r.to === RELAY && r.payload?.type === 'published')!.t;
    expect(CRASH_AT.relayMid).toBeGreaterThan(published);
    expect(CRASH_AT.relayMid).toBeLessThan(publishedAck);
  });

  it('hand-built O2: database first, crash between the commit and the publish: a committed order whose event is never published', () => {
    const run = runOutbox(faultSetup(setup({ design: 'dbfirst' }), 'between'), 3_000);
    expect(unpublishedOrders(run)).toEqual([1]);
    expect(run.orders).toHaveLength(1);
  });

  it('hand-built O1: publish first, crash after the publish and before the commit: the consumer handles an event for an order that never exists', () => {
    const c = outboxCluster(faultSetup(setup({ design: 'pubfirst' }), 'between'));
    const r = safe(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('order 1, which is not in the database');
  });

  it('publish first does not break O1 on its own: with no crash it holds on all 200 random-latency schedules (the consumer batches, so the commit lands first)', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = { ...compareSweep(seed, 'pubfirst', 'flag', false), crashService: null, crashRelay: null };
      expect(checkInvariants(outboxCluster(s), [o1NoGhost], { until: HORIZON_MS }).ok, `seed ${seed}`).toBe(true);
    }
  });
});

describe('scene 2: the outbox', () => {
  it('a crash before the commit leaves neither row; a crash after it leaves both, and the relay publishes later, once', () => {
    const before = runOutbox(faultSetup(setup({ design: 'outbox' }), 'before'));
    expect([before.orders.length, before.outbox.length, before.published.length]).toEqual([0, 0, 0]);
    const after = runOutbox(faultSetup(setup({ design: 'outbox' }), 'after-commit'));
    expect([after.orders.length, after.outbox.length, after.published.length]).toEqual([1, 1, 1]);
    expect(after.outbox[0].sent).toBe(true);
    expect(after.published[0].at).toBeGreaterThan(after.orders[0].at);
    expect(outcomeOf(after)).toBe('consistent');
  });

  it('the order and its outbox row commit in the same step: they share a commit instant in every run', () => {
    for (let seed = 0; seed < 60; seed++) {
      const run = runOutbox(compareSweep(seed, 'outbox', 'flag', true));
      for (const o of run.orders) expect(run.outbox.find((r) => r.order === o.order)?.committedAt, `seed ${seed}`).toBe(o.at);
      expect(run.outbox.every((r) => r.committed === run.orders.some((o) => o.order === r.order))).toBe(true);
    }
  });

  it('a relay crash between publish and mark publishes the event twice; without consumer dedupe the effect applies twice, with it once', () => {
    const base = faultSetup(setup({ design: 'outbox' }), 'relay-mid');
    const run = runOutbox(base, 3_000);
    expect(run.published.filter((p) => p.order === 1)).toHaveLength(2);
    expect(run.effects[1]).toBe(2);
    expect(outcomeOf(run)).toBe('duplicate');
    const inbox = runOutbox({ ...base, dedupe: true }, 3_000);
    expect(inbox.published.filter((p) => p.order === 1)).toHaveLength(2);
    expect(inbox.effects[1]).toBe(1);
    expect(inbox.handled.map((h) => h.applied)).toEqual([true, false]);
    expect(checkInvariants(outboxCluster({ ...base, dedupe: false }), [o3EffectOnce], { until: 3_000 }).ok).toBe(false);
    expect(checkInvariants(outboxCluster({ ...base, dedupe: true }), [o3EffectOnce], { until: 3_000 }).ok).toBe(true);
  });
});

describe(`${SEEDS} seeded schedules: crashes in the service and the relay (two orders in flight, random commit times)`, () => {
  const lowest = (id: string, dedupe: boolean, network = false) => {
    const d = DESIGNS.find((x) => x.id === id)!;
    return rulesBroken(network ? (seed) => d.make(dedupe)(seed) : d.make(dedupe), SEEDS);
  };

  it('PINNED is the lowest failing seed for each broken design and rule, recomputed here', () => {
    expect(lowest('dbfirst', false).O2).toBe(PINNED.dbfirst.seed);
    expect(lowest('pubfirst', false).O1).toBe(PINNED.pubfirst.seed);
    expect(lowest('poll-flag', false).O3).toBe(PINNED['poll-flag'].seed);
    expect(lowest('poll-cursor', false).O2).toBe(PINNED['poll-cursor'].seed);
  });

  it('what each design keeps and breaks, by rule (hand-worked expectations)', () => {
    const none = { O1: null, O2: null, O3: null };
    expect(lowest('dbfirst', false)).toMatchObject({ O1: null, O3: null });
    expect(lowest('dbfirst', false).O2).not.toBeNull();
    expect(lowest('pubfirst', false)).toMatchObject({ O2: null, O3: null });
    expect(lowest('pubfirst', false).O1).not.toBeNull();
    expect(lowest('poll-flag', false)).toMatchObject({ O1: null, O2: null });
    expect(lowest('poll-flag', false).O3).not.toBeNull();
    expect(lowest('poll-flag', true)).toEqual(none);
    expect(lowest('cdc', true)).toEqual(none);
    expect(lowest('cdc', false)).toMatchObject({ O1: null, O2: null });
    expect(lowest('poll-cursor', true).O2).not.toBeNull();
    expect(lowest('poll-cursor', true)).toMatchObject({ O1: null, O3: null });
  });

  it('the outbox with an inbox keeps all three rules when messages are also lost and duplicated (flag polling and the commit log)', () => {
    for (const relay of ['flag', 'log'] as RelayMode[]) {
      const broken = rulesBroken(compareScenario('outbox', relay, true, true), SEEDS);
      expect(broken, relay).toEqual({ O1: null, O2: null, O3: null });
    }
  });

  it('dual write, database first: the failing seed crashed the service after it sent the commit and before it published (traced), and no crash passes', () => {
    const s = compareSweep(PINNED.dbfirst.seed, 'dbfirst', 'flag', false);
    const run = runOutbox(s, 3_000);
    const lost = run.orders.find((o) => !run.published.some((p) => p.order === o.order))!;
    const crash = run.cluster.trace.find((r) => r.kind === 'crash' && r.node === SVC)!;
    const wrote = run.cluster.trace.find((r) => r.kind === 'send' && r.from === SVC && r.payload?.type === 'write' && r.payload.order === lost.order)!;
    expect(wrote.t).toBeLessThanOrEqual(crash.t);
    expect(run.cluster.trace.some((r) => r.kind === 'send' && r.from === SVC && r.payload?.type === 'publish' && r.payload.order === lost.order)).toBe(false);
    expect(unpublishedOrders(runOutbox({ ...s, crashService: null }, 3_000))).toEqual([]);
    expect(unpublishedOrders(runOutbox({ ...s, design: 'outbox' }, 3_000))).toEqual([]);
  });

  it('publish first: the failing seed published, then the service crashed before it wrote (traced); without the crash, or with an outbox, it passes', () => {
    const s = compareSweep(PINNED.pubfirst.seed, 'pubfirst', 'flag', false);
    const c = outboxCluster(s);
    const r = safe(c);
    expect(r.ok).toBe(false);
    const run = runOutbox(s, 3_000);
    const ghost = run.published.find((p) => !run.orders.some((o) => o.order === p.order))!;
    const crash = run.cluster.trace.find((x) => x.kind === 'crash' && x.node === SVC)!;
    const sent = run.cluster.trace.find((x) => x.kind === 'send' && x.from === SVC && x.payload?.type === 'publish' && x.payload.order === ghost.order)!;
    expect(sent.t).toBeLessThanOrEqual(crash.t);
    expect(run.cluster.trace.some((x) => x.kind === 'send' && x.from === SVC && x.payload?.type === 'write' && x.payload.order === ghost.order)).toBe(false);
    expect(safe(outboxCluster({ ...s, crashService: null })).ok).toBe(true);
    expect(safe(outboxCluster({ ...s, design: 'outbox' })).ok).toBe(true);
  });

  it('outbox without an inbox: the failing seed crashed the relay after a publish was sent and before its mark (traced), and an inbox or no relay crash passes', () => {
    const s = compareSweep(PINNED['poll-flag'].seed, 'outbox', 'flag', false);
    const r = safe(outboxCluster(s));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe(1);
    const run = runOutbox(s, 3_000);
    const dup = Object.entries(run.effects).find(([, n]) => n > 1)![0];
    const publishes = run.published.filter((p) => p.order === Number(dup));
    expect(publishes.length).toBeGreaterThan(1);
    const crash = run.cluster.trace.find((x) => x.kind === 'crash' && x.node === RELAY)!;
    const firstPublish = run.cluster.trace.find((x) => x.kind === 'send' && x.from === RELAY && x.payload?.type === 'publish' && x.payload.order === Number(dup))!;
    expect(firstPublish.t).toBeLessThanOrEqual(crash.t);
    const mark = run.cluster.trace.find((x) => x.kind === 'send' && x.from === RELAY && x.payload?.type === 'mark' && x.t <= crash.t && x.payload.id === publishes[0].id);
    expect(mark).toBeUndefined();
    expect(safe(outboxCluster({ ...s, dedupe: true })).ok).toBe(true);
    expect(safe(outboxCluster({ ...s, crashRelay: null })).ok).toBe(true);
  });

  it('liveness, apart from safety: after the run quiesces every committed order was published at least once, for the outbox designs that read every row', () => {
    for (const relay of ['flag', 'log'] as RelayMode[]) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const run = runOutbox(compareSweep(seed, 'outbox', relay, true), 3_000);
        expect(unpublishedOrders(run), `${relay} seed ${seed}`).toEqual([]);
      }
    }
  });
});

describe('scene 3: the polling trap', () => {
  it('two transactions get ids 41 and 42; when 42 commits first, a poller that reads id > last seen never sees 41 (the event is lost)', () => {
    const run = runOutbox(pollingSetup('cursor', 't2-first'), 3_000);
    expect(run.outbox.map((r) => r.id)).toEqual([FIRST_ID, FIRST_ID + 1]);
    expect(run.outbox.find((r) => r.id === 42)!.committedAt!).toBeLessThan(run.outbox.find((r) => r.id === 41)!.committedAt!);
    expect(run.published.map((p) => p.id)).toEqual([42]);
    expect(unpublishedOrders(run)).toEqual([1]);
    expect(run.outbox.find((r) => r.id === 41)!.sent).toBe(false);
  });

  it('with the commits the other way round the same poller loses nothing: the trap needs the later id to commit first', () => {
    const run = runOutbox(pollingSetup('cursor', 't1-first'), 3_000);
    expect(run.published.map((p) => p.id)).toEqual([41, 42]);
    expect(unpublishedOrders(run)).toEqual([]);
  });

  it('a re-scan margin or reading the commit log both deliver 41 even when 42 commits first, the log in commit order', () => {
    const rescan = runOutbox(pollingSetup('rescan', 't2-first'), 3_000);
    expect(rescan.published.map((p) => p.id).sort()).toEqual([41, 42]);
    const log = runOutbox(pollingSetup('log', 't2-first'), 3_000);
    expect(log.published.map((p) => p.id)).toEqual([42, 41]);
    expect(unpublishedOrders(log)).toEqual([]);
    expect(log.outbox.map((r) => r.seq)).toEqual([2, 1]);
  });

  it('the missed event is produced by the model: O2 breaks on this hand-built interleaving and on no other relay mode', () => {
    for (const relay of ['rescan', 'log', 'flag'] as RelayMode[]) expect(unpublishedOrders(runOutbox(pollingSetup(relay, 't2-first'), 3_000)), relay).toEqual([]);
    expect(unpublishedOrders(runOutbox(pollingSetup('cursor', 't2-first'), 3_000))).toEqual([1]);
  });
});

describe('quiet checks', () => {
  it('same seed, same trace', () => {
    const a = runOutbox(compareSweep(7, 'outbox', 'flag', false, true)).cluster.trace;
    expect(runOutbox(compareSweep(7, 'outbox', 'flag', false, true)).cluster.trace).toEqual(a);
  });
  it('the broker stays a plain log: an event it was handed is in its log and nowhere else', () => {
    const run = runOutbox(setup({ design: 'dbfirst' }));
    expect(run.published).toEqual([{ order: 1, id: null, at: expect.any(Number) }]);
    expect(BROKER).toBe('broker');
    const faults: Fault[] = ['none', 'before', 'between', 'after', 'publish-fails', 'relay-mid', 'after-commit'];
    expect(new Set(faults).size).toBe(7);
  });
});
