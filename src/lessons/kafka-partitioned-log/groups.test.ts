import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_GROUP_PARTITIONS, MAX_CONSUMERS, PAUSE_TICKS, STEPS_PER_RECORD, advance, advanceBy, assign, atRisk, busyConsumers, crashAtWorstMoment, crashConsumer, drain, ledger,
  newWorld, partitionAtTick, setConsumers, taskLabel, totalLag,
  type CommitPolicy, type World,
} from './groups';

const world = (o: Partial<{ p: number; consumers: number; policy: CommitPolicy; seed: number }> = {}) =>
  newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: 2, policy: 'after', seed: 3, ...o });

describe('assignment', () => {
  it('every partition has exactly one owner and min(C, P) consumers are busy, for every C in 1..8 and P in 1..6', () => {
    for (let c = 1; c <= MAX_CONSUMERS; c++) {
      for (let p = 1; p <= 6; p++) {
        const plan = assign(c, p);
        expect(plan).toHaveLength(c);
        const owners = Array.from({ length: p }, (_, part) => plan.filter((mine) => mine.includes(part)).length);
        expect(owners, `C=${c} P=${p}`).toEqual(new Array<number>(p).fill(1));
        expect(plan.filter((mine) => mine.length > 0).length).toBe(Math.min(c, p));
        const sizes = plan.filter((mine) => mine.length > 0).map((m) => m.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is round-robin by partition index: partition i goes to consumer i mod C', () => {
    expect(assign(2, 5)).toEqual([[0, 2, 4], [1, 3]]);
    expect(assign(4, 3)).toEqual([[0], [1], [2], []]);
  });

  it('a world starts with every partition assigned, no pause, and consumers past P idle', () => {
    const w = world({ p: 3, consumers: 5 });
    expect(w.groups[0].owners).toEqual(['c1', 'c2', 'c3']);
    expect(w.groups[0].pause).toBe(0);
    expect(busyConsumers(w.groups[0])).toBe(3);
    expect(taskLabel('after', w.groups[0].consumers[4], false)).toBe('idle: no partition');
    expect(w.groups[1].owners).toEqual(['b1', 'b1', 'b1']);
  });
});

describe('the producer and the log', () => {
  it('appends one record a tick to the partition its key hashes to, the same on every run', () => {
    let w = world();
    const expected = new Array<number>(3).fill(0);
    for (let tick = 1; tick <= 40; tick++) {
      w = advance(w);
      expected[partitionAtTick(3, tick, 3)]++;
    }
    expect(w.logEnd).toEqual(expected);
    expect(w.logEnd.reduce((a, b) => a + b, 0)).toBe(40);
    expect(advanceBy(world(), 40).logEnd).toEqual(w.logEnd);
  });

  it('the world is immutable: advancing returns a new one and leaves the old one alone', () => {
    const w = world();
    const before = JSON.stringify(w);
    advanceBy(w, 10);
    expect(JSON.stringify(w)).toBe(before);
  });
});

describe('consumers', () => {
  it('a consumer takes three ticks a record: with commit after, process, apply the effect, commit', () => {
    let w = world({ p: 1, consumers: 1 });
    w = advance(w);
    expect(w.groups[0].consumers[0].task).toMatchObject({ partition: 0, offset: 0, done: 1 });
    expect(taskLabel('after', w.groups[0].consumers[0], false)).toBe('processing P0@0');
    expect(w.groups[0].committed[0]).toBe(0);
    w = advance(w);
    expect(ledger(w.groups[0]).effects).toBe(1);
    expect(w.groups[0].committed[0]).toBe(0);
    expect(taskLabel('after', w.groups[0].consumers[0], false)).toBe('processed P0@0, commit pending');
    w = advance(w);
    expect(w.groups[0].committed[0]).toBe(1);
    expect(w.groups[0].consumers[0].task).toBeNull();
  });

  it('with commit before, the offset moves first and the effect last', () => {
    let w = world({ p: 1, consumers: 1, policy: 'before' });
    w = advance(w);
    expect(w.groups[0].committed[0]).toBe(1);
    expect(ledger(w.groups[0]).effects).toBe(0);
    expect(taskLabel('before', w.groups[0].consumers[0], false)).toBe('committed P0@0, not processed yet');
    w = advanceBy(w, 2);
    expect(ledger(w.groups[0]).effects).toBe(1);
  });

  it('one consumer per partition at most: past P, more consumers add nothing, and up to P each one adds throughput', () => {
    const distinct = (c: number) => ledger(advanceBy(world({ p: 3, consumers: c }), 90).groups[0]).distinct;
    expect(distinct(2)).toBeGreaterThan(distinct(1));
    expect(distinct(3)).toBeGreaterThan(distinct(2));
    for (let c = 4; c <= MAX_CONSUMERS; c++) expect(distinct(c)).toBe(distinct(3));
  });

  it('group B reads the same log from its own offsets, so its lag and A\'s differ and neither moves the other', () => {
    const w = advanceBy(world({ p: 3, consumers: 3 }), 60);
    const [a, b] = w.groups;
    expect(a.committed).not.toEqual(b.committed);
    expect(totalLag(b, w.logEnd)).toBeGreaterThan(totalLag(a, w.logEnd));
    const solo = advanceBy(world({ p: 3, consumers: 3 }), 60);
    expect(solo.groups[0].committed).toEqual(a.committed);
  });
});

describe('rebalances', () => {
  it('a rebalance changes only ownership: the committed offsets and the log are the same, positions restart at the committed offset, and the group pauses', () => {
    let w = advanceBy(world({ p: 3, consumers: 2 }), 17);
    w = setConsumers(w, 3);
    for (let i = 0; i < 20; i++) {
      const before = w;
      w = advance(w);
      if (before.groups[0].rebalance && !w.groups[0].rebalance) {
        expect(w.groups[0].committed).toEqual(before.groups[0].committed);
        expect(w.groups[0].position).toEqual(w.groups[0].committed);
        expect(w.groups[0].pause).toBe(PAUSE_TICKS);
        expect(w.groups[0].owners).toEqual(['c1', 'c2', 'c3']);
        expect(w.events.some((e) => e.text === 'revoke P2 from c1')).toBe(true);
        expect(w.events.some((e) => e.text.startsWith('assign P2 to c3'))).toBe(true);
        return;
      }
    }
    throw new Error('the rebalance never ran');
  });

  it('log lines name what moves: revoke from the old owner, assign to the new one', () => {
    let w = world({ p: 3, consumers: 1 });
    w = setConsumers(w, 3);
    w = advanceBy(w, 4);
    const lines = w.events.filter((e) => e.group === 'A').map((e) => e.text);
    expect(lines).toContain('revoke P1 from c1');
    expect(lines).toContain('revoke P2 from c1');
    expect(lines.some((l) => l.startsWith('assign P1 to c2'))).toBe(true);
    expect(lines.some((l) => l.startsWith('assign P2 to c3'))).toBe(true);
    expect(lines.some((l) => l.startsWith('rebalance (consumer joined)'))).toBe(true);
  });

  it('nothing is processed during the pause', () => {
    let w = setConsumers(advanceBy(world({ p: 3, consumers: 2 }), 12), 3);
    while (w.groups[0].rebalance) w = advance(w);
    expect(w.groups[0].pause).toBe(PAUSE_TICKS);
    const before = ledger(w.groups[0]).effects;
    w = advanceBy(w, PAUSE_TICKS - 1);
    expect(ledger(w.groups[0]).effects).toBe(before);
  });

  it('a consumer asked to leave finishes its record and is gone after the rebalance', () => {
    let w = advanceBy(world({ p: 3, consumers: 3 }), 10);
    w = setConsumers(w, 1);
    expect(w.groups[0].consumers.filter((c) => c.leaving)).toHaveLength(2);
    w = advanceBy(w, 12);
    expect(w.groups[0].consumers.map((c) => c.id)).toEqual(['c1']);
    expect(w.groups[0].owners).toEqual(['c1', 'c1', 'c1']);
  });
});

/** A seeded schedule of crashes and graceful membership changes, then drain; returns the drained world and how many crashes hit a record in flight. */
function schedule(seed: number, policy: CommitPolicy, crashes: boolean): { drained: World; crashed: number; hit: number } {
  const rnd = mulberry32(seed + 1_000);
  let w = world({ p: 1 + Math.floor(rnd() * 6), consumers: 1 + Math.floor(rnd() * 4), policy, seed });
  let crashed = 0;
  let hit = 0;
  for (let tick = 0; tick < 90; tick++) {
    w = advance(w);
    const roll = rnd();
    if (crashes && roll < 0.08) {
      const ids = w.groups[0].consumers.map((c) => c.id);
      const id = ids[Math.floor(rnd() * ids.length)];
      if (w.groups[0].consumers.find((c) => c.id === id)!.task) hit++;
      w = crashConsumer(w, id);
      crashed++;
    } else if (roll > 0.94) {
      w = setConsumers(w, 1 + Math.floor(rnd() * MAX_CONSUMERS));
    }
  }
  const drained = drain(w);
  if (!drained) throw new Error(`seed ${seed} never drained`);
  return { drained, crashed, hit };
}

describe('commit policies, over 200 seeded schedules of crashes and rebalances', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i);

  it('commit after processing loses no record and repeats at most the one in flight at each crash', () => {
    for (const seed of seeds) {
      const { drained, crashed } = schedule(seed, 'after', true);
      const l = ledger(drained.groups[0]);
      expect(l.skipped, `seed ${seed}`).toBe(0);
      expect(l.duplicates, `seed ${seed}`).toBeLessThanOrEqual(crashed);
      drained.logEnd.forEach((end, p) => { for (let o = 0; o < end; o++) expect(drained.groups[0].processed[p][o] ?? 0, `seed ${seed} P${p}@${o}`).toBeGreaterThanOrEqual(1); });
    }
  });

  it('commit before processing never repeats a record and skips at most the one in flight at each crash', () => {
    for (const seed of seeds) {
      const { drained, crashed } = schedule(seed, 'before', true);
      const l = ledger(drained.groups[0]);
      expect(l.duplicates, `seed ${seed}`).toBe(0);
      expect(l.skipped, `seed ${seed}`).toBeLessThanOrEqual(crashed);
    }
  });

  it('without a crash neither policy repeats or skips anything, through every graceful rebalance', () => {
    for (const seed of seeds) {
      for (const policy of ['after', 'before'] as const) {
        const l = ledger(schedule(seed, policy, false).drained.groups[0]);
        expect(l, `${policy} seed ${seed}`).toMatchObject({ duplicates: 0, skipped: 0 });
      }
    }
  });

  it('group B, which never crashes, processes every record exactly once under commit after', () => {
    for (const seed of seeds.slice(0, 60)) {
      const { drained } = schedule(seed, 'after', true);
      expect(ledger(drained.groups[1])).toMatchObject({ duplicates: 0, skipped: 0, effects: drained.logEnd.reduce((a, b) => a + b, 0) });
    }
  });

  it('counterexample: a crash at the worst moment repeats exactly one record under commit after, and skips exactly one under commit before', () => {
    const after = crashAtWorstMoment(advanceBy(world({ p: 3, consumers: 3 }), 8), 'c1')!;
    expect(atRisk('after', null)).toBe(false);
    const afterLedger = ledger(drain(after)!.groups[0]);
    expect([afterLedger.duplicates, afterLedger.skipped]).toEqual([1, 0]);
    const before = crashAtWorstMoment(advanceBy(world({ p: 3, consumers: 3, policy: 'before' }), 8), 'c1')!;
    const beforeLedger = ledger(drain(before)!.groups[0]);
    expect([beforeLedger.duplicates, beforeLedger.skipped]).toEqual([0, 1]);
  });

  it('the checks have teeth: each policy fails the other policy\'s guarantee on some seed, and only where a crash happened', () => {
    const lowest = (policy: CommitPolicy, broken: (l: ReturnType<typeof ledger>) => boolean) =>
      seeds.find((seed) => {
        const r = schedule(seed, policy, true);
        const failed = broken(ledger(r.drained.groups[0]));
        if (failed) expect(r.crashed).toBeGreaterThan(0);
        return failed;
      });
    expect(lowest('before', (l) => l.skipped > 0)).toBeDefined();
    expect(lowest('after', (l) => l.duplicates > 0)).toBeDefined();
    expect(lowest('after', (l) => l.skipped > 0)).toBeUndefined();
    expect(lowest('before', (l) => l.duplicates > 0)).toBeUndefined();
  });

  it('a crash replaces the consumer in its slot, loses its record in flight and logs it', () => {
    let w = advanceBy(world({ p: 3, consumers: 3 }), 6);
    const dead = w.groups[0].consumers.find((c) => c.task)!;
    expect(dead).toBeDefined();
    w = crashConsumer(w, dead.id);
    const slot = w.groups[0].consumers.findIndex((c) => c.id === dead.id);
    expect(slot).toBe(-1);
    expect(w.groups[0].consumers).toHaveLength(3);
    expect(w.events.at(-1)!.text).toContain(`${dead.id} crashed`);
    expect(w.events.at(-1)!.text).toContain(`P${dead.task!.partition}@${dead.task!.offset}`);
  });

  it('the full record takes STEPS_PER_RECORD ticks and the risky window is named by the policy', () => {
    expect(STEPS_PER_RECORD).toBe(3);
    expect(atRisk('after', { partition: 0, offset: 0, done: 1 })).toBe(false);
    expect(atRisk('after', { partition: 0, offset: 0, done: 2 })).toBe(true);
    expect(atRisk('before', { partition: 0, offset: 0, done: 1 })).toBe(true);
  });
});
