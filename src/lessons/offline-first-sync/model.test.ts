import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds, toSequence } from '../../core/distSim';
import { mulberry32, shuffle } from '../../core/random';
import {
  FAULTY, HORIZON_MS, SEED_COUNT, SETTLE_AT_MS, acceptedOps, asDevice, asServer, convergence, noSilentLoss, randomScript, replicaViews, runSchedule, scheduleConfig, settled, viewOfNode,
} from './check';
import { SYNC, backoffDelay, buildCluster, type NodeState } from './nodes';
import { applyNaive, concurrent, emptyNaive, lostUpdates, uniqueById, viewKey, viewOf, naiveView, type MergeStrategy, type Op, type Strategy } from './ops';
import { PRESET_UNTIL_MS, SKEW_PRESET_S, presetConfig } from './scenarios';
import { BROKEN_SEED_ARRIVAL, BROKEN_SEED_LWW } from './seeds';

const MERGES: MergeStrategy[] = ['lww', 'field', 'merge', 'manual'];

// ---- hand-built operations ---------------------------------------------------------------------

const op = (device: 'phone' | 'laptop', seq: number, lamport: number, wall: number, observed: string[], rest: Partial<Op> & Pick<Op, 'kind'>): Op => ({
  id: `${device}:${seq}`, device, seq, lamport, wall, observed, ...rest,
});
const ADD = op('phone', 1, 1, 100, [], { kind: 'add', title: 'Milk' });
const phoneRename = op('phone', 2, 2, 4000, ['phone:1'], { kind: 'rename', item: 'phone:1', title: 'Oat milk' });
const laptopRename = op('laptop', 1, 2, 3000, ['phone:1'], { kind: 'rename', item: 'phone:1', title: 'Soy milk' });
const laptopTick = op('laptop', 2, 3, 5000, ['phone:1', 'laptop:1'], { kind: 'tick', item: 'phone:1', done: true });
const title = (v: ReturnType<typeof viewOf>) => v.items[0].title;

describe('merging, by hand', () => {
  it('concurrent renames: merge keeps the causally latest by Lamport time then device, and lists the other; manual keeps neither', () => {
    const log = [ADD, phoneRename, laptopRename];
    expect(concurrent(phoneRename, laptopRename)).toBe(true);
    const merge = viewOf(log, 'merge');
    expect(title(merge)).toBe('Soy milk');
    expect(merge.conflicts).toHaveLength(1);
    expect(merge.conflicts[0].text).toBe('title of "Milk": "Oat milk" vs "Soy milk"; kept "Soy milk"');
    expect(merge.conflicts[0].ops).toEqual(expect.arrayContaining(['phone:2', 'laptop:1']));
    const manual = viewOf(log, 'manual');
    expect(title(manual)).toBeNull();
    expect(manual.items[0].conflicted).toBe(true);
    expect(manual.conflicts[0].text).toContain('undecided');
  });

  it('a later edit that had seen both settles the conflict: nothing is listed', () => {
    const later = op('laptop', 3, 4, 6000, ['phone:1', 'phone:2', 'laptop:1'], { kind: 'rename', item: 'phone:1', title: 'Almond milk' });
    const v = viewOf([ADD, phoneRename, laptopRename, later], 'merge');
    expect(title(v)).toBe('Almond milk');
    expect(v.conflicts).toEqual([]);
  });

  it('per-field last write wins keeps a rename and a tick from different devices; whole-item last write wins loses the rename', () => {
    const log = [ADD, phoneRename, op('laptop', 1, 2, 9000, ['phone:1'], { kind: 'tick', item: 'phone:1', done: true })];
    const field = viewOf(log, 'field').items[0];
    expect([field.title, field.done]).toEqual(['Oat milk', true]);
    const lww = viewOf(log, 'lww').items[0];
    expect([lww.title, lww.done]).toEqual(['Milk', true]);
    expect(lostUpdates(log, viewOf(log, 'lww')).map((l) => l.op.id)).toEqual(['phone:2']);
    expect(lostUpdates(log, viewOf(log, 'field'))).toEqual([]);
  });

  it('delete against a concurrent edit: merge keeps the item and lists the delete, manual flags it, whole-item last write wins drops the edit or the delete', () => {
    const del = op('phone', 2, 2, 3000, ['phone:1'], { kind: 'delete', item: 'phone:1' });
    const edit = op('laptop', 1, 2, 3500, ['phone:1'], { kind: 'rename', item: 'phone:1', title: 'Milk (organic)' });
    const merge = viewOf([ADD, del, edit], 'merge');
    expect(merge.items[0]).toMatchObject({ deleted: false, title: 'Milk (organic)', conflicted: true });
    expect(merge.conflicts[0].text).toBe('deleted on phone while renamed on laptop: the item stays with the edit');
    expect(viewOf([ADD, del, edit], 'manual').items[0].conflicted).toBe(true);
    expect(lostUpdates([ADD, del, edit], merge)).toEqual([]);
    const lww = viewOf([ADD, del, edit], 'lww');
    expect(lww.items[0]).toMatchObject({ deleted: false, title: 'Milk (organic)' });
    expect(lostUpdates([ADD, del, edit], lww).map((l) => l.op.id)).toEqual(['phone:2']);
    // a delete that had seen the edit is simply later
    const lateDelete = op('phone', 3, 4, 4000, ['phone:1', 'laptop:1'], { kind: 'delete', item: 'phone:1' });
    expect(viewOf([ADD, edit, lateDelete], 'merge').items[0].deleted).toBe(true);
  });

  it('a counter incremented once on each device: a sum under merge (2), a register under last write wins (1) with the missing increment reported', () => {
    const a = op('phone', 1, 1, 100, [], { kind: 'inc' });
    const b = op('laptop', 1, 1, 200, [], { kind: 'inc' });
    expect(viewOf([a, b], 'merge').counter).toBe(2);
    expect(viewOf([a, b], 'manual').counter).toBe(2);
    expect(viewOf([a, b], 'lww').counter).toBe(1);
    expect(viewOf([a, b], 'field').counter).toBe(1);
    expect(lostUpdates([a, b], viewOf([a, b], 'lww')).map((l) => l.reason)).toEqual(['1 of 2 increments are missing from the counter (1)']);
    // an increment that saw the other counts it
    const c = op('laptop', 2, 2, 300, ['laptop:1', 'phone:1'], { kind: 'inc' });
    expect(viewOf([a, b, c], 'lww').counter).toBe(3);
  });

  it('a copy delivered twice counts twice in a list log, and once when the log is deduplicated by id (idempotence, by hand)', () => {
    const a = op('phone', 1, 1, 100, [], { kind: 'inc' });
    const b = op('laptop', 1, 1, 200, [], { kind: 'inc' });
    expect(viewOf([a, b, a], 'merge').counter).toBe(3);
    expect(viewOf([a, b], 'merge').counter).toBe(2);
    // the rest of the view ignores a duplicate
    expect(viewKey(viewOf([ADD, phoneRename, ADD, phoneRename], 'merge'))).toBe(viewKey(viewOf([ADD, phoneRename], 'merge')));
  });

  it('clock skew: whole-item last write wins picks the device with the later clock, not the later edit (hand case)', () => {
    const early = op('laptop', 1, 2, 3000 + SKEW_PRESET_S * 1000, ['phone:1'], { kind: 'rename', item: 'phone:1', title: 'Soy milk' });
    const late = op('phone', 2, 2, 4000, ['phone:1'], { kind: 'rename', item: 'phone:1', title: 'Oat milk' });
    expect(title(viewOf([ADD, early, late], 'lww'))).toBe('Soy milk');
    expect(title(viewOf([ADD, early, late], 'field'))).toBe('Soy milk');
    const unskewed = { ...early, wall: 3000 };
    expect(title(viewOf([ADD, unskewed, late], 'lww'))).toBe('Oat milk');
    // the merge strategies do not read the wall clock at all
    expect(viewKey(viewOf([ADD, early, late], 'merge'))).toBe(viewKey(viewOf([ADD, unskewed, late], 'merge')));
    expect(viewKey(viewOf([ADD, early, late], 'manual'))).toBe(viewKey(viewOf([ADD, unskewed, late], 'manual')));
  });

  it('a view depends on which operations a replica holds, not the order they arrived in, for every merging strategy', () => {
    const log = [ADD, phoneRename, laptopRename, laptopTick];
    const rnd = mulberry32(60);
    for (const strategy of MERGES) {
      const key = viewKey(viewOf(log, strategy));
      for (let i = 0; i < 40; i++) expect(viewKey(viewOf(shuffle(log, rnd), strategy)), strategy).toBe(key);
    }
  });

  it('the arrival-order mode does depend on order: two orders of the same operations give different lists, and an early edit is ignored', () => {
    const run = (ops: Op[]) => naiveView(ops.reduce(applyNaive, emptyNaive()));
    expect(viewKey(run([ADD, phoneRename, laptopRename]))).not.toBe(viewKey(run([ADD, laptopRename, phoneRename])));
    expect(run([phoneRename, ADD]).items[0].title).toBe('Milk');
    expect(run([ADD, ADD]).items).toHaveLength(2);
  });
});

// ---- the protocol over seeded fault schedules --------------------------------------------------

const CLEAN: Strategy[] = ['merge', 'manual'];
const verdict = (seed: number, strategy: Strategy, safety: ReturnType<typeof convergence>[]) =>
  checkInvariants(runSchedule(seed, strategy), safety, { until: HORIZON_MS });
const lowest = (strategy: Strategy, make: (s: Strategy) => ReturnType<typeof convergence>) =>
  forSeeds<unknown, NodeState>(SEED_COUNT, (seed) => runSchedule(seed, strategy) as never, [make(strategy)], { until: HORIZON_MS });

describe('invariants over 200 seeded fault schedules', () => {
  it('liveness, stated on its own: every one of the 200 runs delivers everything and settles before the horizon', () => {
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const c = runSchedule(seed, 'merge');
      c.run({ until: HORIZON_MS });
      expect(settled(c.snapshot()), `seed ${seed}`).toBe(true);
    }
  });

  it('the schedules really are faulty: loss, duplication, reordering, a partition and a crash all occur', () => {
    let drops = 0;
    let dups = 0;
    let reordered = 0;
    let crashes = 0;
    let partitions = 0;
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const c = runSchedule(seed, 'merge');
      c.run({ until: HORIZON_MS });
      const lastDelivered = new Map<string, number>();
      for (const row of c.trace) {
        if (row.kind === 'drop') drops++;
        if (row.kind === 'deliver' && row.dup) dups++;
        if (row.kind === 'crash') crashes++;
        if (row.kind === 'partition') partitions++;
        if (row.kind === 'deliver' && !row.dup && row.msgId !== undefined) {
          const key = `${row.from}>${row.to}`;
          if (row.msgId < (lastDelivered.get(key) ?? -1)) reordered++;
          lastDelivered.set(key, Math.max(row.msgId, lastDelivered.get(key) ?? -1));
        }
      }
    }
    expect(drops).toBeGreaterThan(SEED_COUNT);
    expect(dups).toBeGreaterThan(SEED_COUNT);
    expect(reordered).toBeGreaterThan(SEED_COUNT / 4);
    expect(crashes).toBeGreaterThan(0);
    expect(partitions).toBeGreaterThan(0);
    expect(FAULTY.loss).toBeGreaterThan(0);
  });

  it('invariant 1, convergence: every merging strategy converges on all 200 seeds', () => {
    for (const strategy of MERGES) expect(lowest(strategy, convergence).ok, strategy).toBe(true);
  });

  it('invariant 2, no acknowledged edit disappears silently: merge and manual hold on all 200 seeds', () => {
    for (const strategy of CLEAN) expect(lowest(strategy, noSilentLoss).ok, strategy).toBe(true);
  });

  it('invariant 2 against an independent oracle: for merge and manual, every accepted rename, tick and delete is in the final list, overwritten by a later edit that saw it, or in a listed conflict', () => {
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      for (const strategy of CLEAN) {
        const c = runSchedule(seed, strategy);
        c.run({ until: HORIZON_MS });
        const snap = c.snapshot();
        const server = asServer(snap.nodes.server.state);
        const view = viewOfNode(server, strategy);
        for (const o of server.log) {
          if (o.kind !== 'rename' && o.kind !== 'tick') continue;
          const item = view.items.find((i) => i.id === o.item);
          const value = o.kind === 'rename' ? o.title : o.done;
          const shown = o.kind === 'rename' ? item?.title : item?.done;
          const later = server.log.some((p) => p.item === o.item && p.kind === o.kind && p.observed.includes(o.id));
          const mentioned = view.conflicts.some((k) => k.item === o.item && k.text.includes(String(value)));
          expect(shown === value || later || mentioned, `seed ${seed} ${strategy} ${o.id}`).toBe(true);
        }
        const incs = new Set(server.log.filter((o) => o.kind === 'inc').map((o) => o.id)).size;
        expect(view.counter).toBe(incs);
      }
    }
  });

  it('the broken modes violate: arrival order breaks convergence, last write wins breaks invariant 2, and the lowest seeds are the pinned constants', () => {
    const arrival = lowest('arrival', convergence);
    expect(arrival.ok).toBe(false);
    if (!arrival.ok) {
      expect(arrival.seed).toBe(BROKEN_SEED_ARRIVAL);
      expect(arrival.message).toContain('the replicas differ once settled');
    }
    const lww = lowest('lww', noSilentLoss);
    expect(lww.ok).toBe(false);
    if (!lww.ok) {
      expect(lww.seed).toBe(BROKEN_SEED_LWW);
      expect(lww.message).toContain('disappeared silently');
    }
    expect(lowest('field', noSilentLoss).ok).toBe(false);
  });

  it('the pinned seeds are the lowest: every smaller seed passes', () => {
    for (let seed = 0; seed < BROKEN_SEED_ARRIVAL; seed++) expect(verdict(seed, 'arrival', [convergence('arrival')]).ok, `arrival ${seed}`).toBe(true);
    for (let seed = 0; seed < BROKEN_SEED_LWW; seed++) expect(verdict(seed, 'lww', [noSilentLoss('lww')]).ok, `lww ${seed}`).toBe(true);
  });

  it('last write wins loses an edit on every seed where two devices made conflicting concurrent edits to one field that nothing later settled (oracle from the operation history)', () => {
    let conflicting = 0;
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const c = runSchedule(seed, 'lww');
      c.run({ until: HORIZON_MS });
      const server = asServer(c.snapshot().nodes.server.state);
      const log = server.log;
      const titleOps = (item: string) => log.filter((o) => o.item === item && o.kind === 'rename');
      let conflicted = false;
      for (const a of log.filter((o) => o.kind === 'add')) {
        const ops = titleOps(a.id);
        const maximal = ops.filter((o) => !ops.some((p) => p.id !== o.id && p.observed.includes(o.id)));
        const values = new Set(maximal.map((o) => o.title));
        const alive = !log.some((d) => d.kind === 'delete' && d.item === a.id);
        if (alive && values.size > 1) conflicted = true;
      }
      if (conflicted) {
        conflicting++;
        expect(lostUpdates(log, viewOfNode(server, 'lww')).length, `seed ${seed}`).toBeGreaterThan(0);
      }
    }
    expect(conflicting).toBeGreaterThan(3);
  });

  it('a broken mode that never violated would fail: a copy of last write wins that also lists its losers passes the same check', () => {
    // the merge strategy is exactly that fix: the same schedules, the same checker, no violation
    expect(lowest('merge', noSilentLoss).ok).toBe(true);
    expect(lowest('lww', noSilentLoss).ok).toBe(false);
  });

  it('a violation comes with its trace, ending where the replicas were compared, and the ladder diagram can draw it', () => {
    const r = lowest('arrival', convergence);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.time).toBeGreaterThanOrEqual(SETTLE_AT_MS);
      const seq = toSequence(r.trace, { label: (m) => (m as { type: string }).type });
      expect(seq.messages.length).toBeGreaterThan(5);
    }
  });
});

// ---- idempotence and the server's refusals -----------------------------------------------------

describe('idempotence', () => {
  const run = (dedupe: boolean) => {
    const c = buildCluster({ ...presetConfig('counter', 'merge', 0, dedupe), airplane: [] });
    c.run({ until: 3200 });
    const phoneInc = asDevice(c.snapshot().nodes.phone.state).log.find((o) => o.kind === 'inc')!;
    c.inject(3500, 'server', { type: 'push', ops: [phoneInc] }, 'phone');
    c.run({ until: 12_000 });
    const snap = c.snapshot();
    return (['phone', 'laptop', 'server'] as const).map((k) => viewOfNode(snap.nodes[k].state!, 'merge').counter);
  };
  it('with ids deduplicated, delivering an operation twice leaves the counter at 2 on every replica', () => {
    expect(run(true)).toEqual([2, 2, 2]);
  });
  it('without deduplication, one duplicated delivery makes the server count 3 instead of 2, on a scripted schedule', () => {
    expect(run(false)[2]).toBe(3);
  });
  it('without deduplication no replica can be trusted: the devices count at least as many as the server, because the forwarded update and the pull reply both bring an operation', () => {
    const [phone, laptop, server] = run(false);
    expect(phone).toBeGreaterThanOrEqual(server);
    expect(laptop).toBeGreaterThanOrEqual(server);
    expect(phone + laptop + server).toBeGreaterThan(6);
  });
  it('delivering any operation twice leaves a deduplicated log unchanged, and doubles the counter of an undeduplicated one, for 50 random schedules', () => {
    for (let seed = 0; seed < 50; seed++) {
      const c = runSchedule(seed, 'merge');
      c.run({ until: HORIZON_MS });
      const server = asServer(c.snapshot().nodes.server.state);
      const doubled = [...server.log, ...server.log];
      expect(viewKey(viewOf(uniqueById(doubled), 'merge'))).toBe(viewKey(viewOf(server.log, 'merge')));
      const raw = viewOf(doubled, 'merge');
      const clean = viewOf(server.log, 'merge');
      expect(raw.items).toEqual(clean.items);
      expect(raw.conflicts).toEqual(clean.conflicts);
      expect(raw.counter).toBe(server.log.filter((o) => o.kind === 'inc').length * 2);
    }
  });
});

describe('the server refuses what it cannot take', () => {
  it('a blank rename is rejected: the device rolls it back with a notice, no replica ever shows it, and the others converge', () => {
    const c = buildCluster({
      seed: 2, strategy: 'merge', dedupe: true, latency: { min: 20, max: 60 }, loss: 0, duplicate: 0, skewMs: 0, airplane: [], randomFaults: false,
      script: [
        { at: 100, device: 'phone', action: { kind: 'add', title: 'Milk' } },
        { at: 2000, device: 'laptop', action: { kind: 'rename', pick: 0, title: '' } },
      ],
    });
    c.run({ until: 3000 });
    const mid = asDevice(c.snapshot().nodes.laptop.state);
    expect(viewOf(mid.log, 'merge').items[0].title).toBe('Milk');
    c.run({ until: 20_000 });
    const snap = c.snapshot();
    const laptop = asDevice(snap.nodes.laptop.state);
    expect(laptop.rolledBack.map((o) => o.id)).toEqual(['laptop:1']);
    expect(laptop.notices).toEqual(['laptop renaming to "" was rejected by the server (the title is blank) and rolled back']);
    expect(laptop.outbox).toEqual([]);
    expect(asServer(snap.nodes.server.state).rejected.get('laptop:1')).toBe('the title is blank');
    const v = replicaViews(snap, 'merge');
    expect(viewKey(v.phone)).toBe(viewKey(v.server));
    expect(viewKey(v.laptop)).toBe(viewKey(v.server));
    for (const k of ['phone', 'laptop', 'server'] as const) expect(snap.nodes[k].state!.log.some((o) => o.id === 'laptop:1')).toBe(false);
  });
});

describe('the scripted examples, run on the quiet network', () => {
  const finals = (id: Parameters<typeof presetConfig>[0], strategy: Strategy, skewSec: number) => {
    const c = buildCluster(presetConfig(id, strategy, skewSec));
    c.run({ until: PRESET_UNTIL_MS });
    const snap = c.snapshot();
    return { snap, views: replicaViews(snap, strategy), lost: lostUpdates(acceptedOps(snap), viewOfNode(snap.nodes.server.state!, strategy)) };
  };
  it('both rename the same item: merge keeps one title and lists the other on every replica, with nothing lost', () => {
    const { views, lost } = finals('rename', 'merge', 0);
    for (const k of ['phone', 'laptop', 'server'] as const) {
      expect(views[k].items[0].title).toBe('Soy milk');
      expect(views[k].conflicts.map((x) => x.text)).toEqual(['title of "Milk": "Oat milk" vs "Soy milk"; kept "Soy milk"']);
    }
    expect(lost).toEqual([]);
  });
  it('both rename the same item: last write wins converges and silently drops one rename', () => {
    const { views, lost } = finals('rename', 'lww', 0);
    expect(new Set(['phone', 'laptop', 'server'].map((k) => viewKey(views[k as 'phone'])))).toHaveProperty('size', 1);
    expect(views.server.items[0].title).toBe('Soy milk');
    expect(lost.map((l) => l.op.id)).toEqual(['phone:2']);
  });
  it('both rename the same item: arrival order leaves the devices with each other\'s title, on a quiet network, with no seed involved', () => {
    const { views } = finals('rename', 'arrival', 0);
    expect(views.phone.items[0].title).toBe('Soy milk');
    expect(views.laptop.items[0].title).toBe('Oat milk');
    expect(viewKey(views.phone)).not.toBe(viewKey(views.laptop));
  });
  it('one deletes while the other edits: merge keeps the item and lists the delete; manual flags it; last write wins quietly picks one', () => {
    expect(finals('delete-edit', 'merge', 0).views.server.items[0]).toMatchObject({ deleted: false, title: 'Milk (organic)', conflicted: true });
    expect(finals('delete-edit', 'manual', 0).views.server.items[0].conflicted).toBe(true);
    expect(finals('delete-edit', 'merge', 0).lost).toEqual([]);
    expect(finals('delete-edit', 'lww', 0).lost.length).toBeGreaterThan(0);
  });
  it('counter incremented on both: 2 under merge, 1 under last write wins with the missing increment listed', () => {
    expect(finals('counter', 'merge', 0).views.server.counter).toBe(2);
    const lww = finals('counter', 'lww', 0);
    expect(lww.views.server.counter).toBe(1);
    expect(lww.lost[0].reason).toBe('1 of 2 increments are missing from the counter (1)');
  });
  it('clock skew 5 minutes: last write wins keeps the earlier edit because the laptop clock is ahead; with no skew the later edit wins; merge does not care', () => {
    expect(finals('skew', 'lww', SKEW_PRESET_S).views.server.items[0].title).toBe('Soy milk');
    expect(finals('skew', 'lww', 0).views.server.items[0].title).toBe('Oat milk');
    for (const s of ['merge', 'manual'] as const) expect(viewKey(finals('skew', s, SKEW_PRESET_S).views.server)).toBe(viewKey(finals('skew', s, 0).views.server));
  });
  it('the skew changes no merge strategy anywhere: merge and manual views are identical for every skew on every example', () => {
    for (const id of ['rename', 'delete-edit', 'counter', 'skew'] as const) {
      for (const s of ['merge', 'manual'] as const) {
        const base = viewKey(finals(id, s, 0).views.server);
        for (const skew of [30, 300, 600]) expect(viewKey(finals(id, s, skew).views.server), `${id} ${s} ${skew}`).toBe(base);
      }
    }
  });
});

// ---- the sync loop -----------------------------------------------------------------------------

describe('retry with exponential backoff and jitter', () => {
  it('the delay lies between half and all of the capped exponential, for every attempt and 200 draws', () => {
    const rnd = mulberry32(61);
    for (let attempt = 0; attempt < 12; attempt++) {
      const raw = Math.min(SYNC.capMs, SYNC.baseMs * 2 ** attempt);
      for (let i = 0; i < 200; i++) {
        const d = backoffDelay(attempt, rnd);
        expect(d).toBeGreaterThanOrEqual(raw / 2);
        expect(d).toBeLessThanOrEqual(raw);
      }
    }
  });
  it('the cap holds: attempts past it never exceed it, and the upper bound doubles until it', () => {
    const rnd = mulberry32(62);
    const upper = (a: number) => Math.min(SYNC.capMs, SYNC.baseMs * 2 ** a);
    expect([0, 1, 2, 3, 4, 5].map(upper)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    for (let i = 0; i < 100; i++) expect(backoffDelay(20, rnd)).toBeLessThanOrEqual(SYNC.capMs);
  });
  it('jitter is seeded: the same seed gives the same delays', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([0, 1, 2].map((k) => backoffDelay(k, a))).toEqual([0, 1, 2].map((k) => backoffDelay(k, b)));
  });
});

describe('scripts', () => {
  it('the random script is a function of the seed, sorted by time, and starts with two items from the phone', () => {
    expect(randomScript(5)).toEqual(randomScript(5));
    expect(randomScript(5)).not.toEqual(randomScript(6));
    const s = randomScript(9);
    expect(s.slice(0, 2).map((t) => [t.device, t.action.kind])).toEqual([['phone', 'add'], ['phone', 'add']]);
    for (let i = 1; i < s.length; i++) expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at);
  });
  it('the schedule config is the faulty network with the phone offline and a skewed laptop', () => {
    const c = scheduleConfig(1, 'merge');
    expect(c.latency).toEqual(FAULTY.latency);
    expect(c.airplane).toEqual([{ device: 'phone', from: 3000, to: 14_000 }]);
    expect(c.skewMs).toBe(300_000);
    expect(c.randomFaults).toBe(true);
  });
});
