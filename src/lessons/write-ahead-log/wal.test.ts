import { describe, expect, it } from 'vitest';
import { crashReport } from './captions';
import { ACK_EARLY_SEED, PRESETS, WAL_OFF_SEED, presetMachine } from './view';
import {
  DEFAULT_POLICY, MAX_RECORDS, MAX_TXS, SEEDS, abort, applyOp, checkpoint, commit, crash, fresh, planFor, recoverySteps, recoveryTimeline, runSeed, write,
  type Machine, type Op, type Policy,
} from './wal';

const POLICIES: Partial<Policy>[] = [];
for (const steal of [true, false]) for (const force of [true, false]) POLICIES.push({ steal, force });

const run = (m: Machine, ...ops: Op[]) => ops.reduce(applyOp, m);
const w = (tx: number, page: number, value: number): Op => ({ kind: 'write', tx, page, value });

describe('hand-built schedules (the oracle is worked out by hand)', () => {
  it('a committed write that never reached a page is redone', () => {
    const m = run(fresh(), w(1, 3, 7), { kind: 'commit', tx: 1 });
    expect(m.disk[3]).toBe(0);
    const r = recoverySteps(crash(m, false));
    expect(r.image.disk[3]).toBe(7);
    expect(r.events.map((e) => e.kind)).toEqual(['redo']);
  });

  it('a flushed write of a transaction with no commit is undone from the log\'s before-image', () => {
    const m = run(fresh(), w(1, 3, 7), { kind: 'flush', page: 3 });
    expect(m.disk[3]).toBe(7);
    expect(m.durable).toBe(1);
    const r = recoverySteps(crash(m, false));
    expect(r.image.disk[3]).toBe(0);
    expect(r.events.map((e) => e.kind)).toEqual(['skip', 'undo', 'end']);
  });

  it('with the WAL rule off the flushed page has no durable record and stays wrong', () => {
    const m = run(fresh({ ...DEFAULT_POLICY, enforceWal: false }), w(1, 3, 7), { kind: 'flush', page: 3 });
    expect(m.durable).toBe(0);
    const r = recoverySteps(crash(m, false));
    expect(r.image.disk[3]).toBe(7);
  });

  it('acknowledging before the fsync acknowledges a commit that is not on disk', () => {
    const m = run(fresh({ ...DEFAULT_POLICY, ackBeforeFsync: true }), w(1, 3, 7), { kind: 'commit', tx: 1 });
    expect(m.acked).toEqual([1]);
    expect(crash(m, false).log).toHaveLength(0);
  });

  it('a torn last record is ignored: the image keeps it aside and recovery is the same with or without it', () => {
    const m = run(fresh(), w(1, 3, 7), { kind: 'fsync' }, w(2, 4, 9));
    const torn = crash(m, true);
    expect(torn.torn?.lsn).toBe(2);
    expect(torn.log).toHaveLength(1);
    expect(recoverySteps(torn).image.disk).toEqual(recoverySteps(crash(m, false)).image.disk);
  });

  it('abort writes undo records and the page goes back', () => {
    const m = run(fresh(), w(1, 2, 5), w(1, 2, 6), { kind: 'abort', tx: 1 });
    expect(m.pool[2].value).toBe(0);
    expect(m.log.map((r) => r.kind)).toEqual(['update', 'update', 'undo', 'undo', 'abort']);
  });

  it('a sharp checkpoint moves the redo point; with no-steal an unflushable page holds it back', () => {
    const steal = run(fresh(), w(1, 1, 5), { kind: 'checkpoint' });
    expect(steal.redoStart).toBe(2);
    const noSteal = run(fresh({ ...DEFAULT_POLICY, steal: false }), w(1, 1, 5), { kind: 'checkpoint' });
    expect(noSteal.redoStart).toBe(1);
  });
});

describe('refusals', () => {
  it('refuses a 65th record with the log-full message', () => {
    let m = fresh();
    for (let i = 0; i < MAX_RECORDS; i++) m = run(m, w(1, i % 8, 1 + (i % 9)));
    expect(m.log).toHaveLength(MAX_RECORDS);
    const r = write(m, 1, 0, 3);
    expect('refused' in r && r.refused).toContain(`the toy log holds ${MAX_RECORDS} records, checkpoint or reset`);
  });

  it('refuses a transaction past the 32nd, a second writer on a locked page, and double commit', () => {
    let m = fresh();
    for (let t = 1; t <= MAX_TXS; t++) m = run(m, w(t, t % 8, 1), { kind: 'commit', tx: t });
    expect('refused' in write(m, MAX_TXS + 1, 0, 1)).toBe(true);
    const locked = run(fresh(), w(1, 4, 1));
    expect('refused' in write(locked, 2, 4, 1)).toBe(true);
    const done = run(fresh(), w(1, 4, 1), { kind: 'commit', tx: 1 });
    expect('refused' in commit(done, 1)).toBe(true);
    expect('refused' in abort(done, 1)).toBe(true);
    expect('refused' in checkpoint(m)).toBe(true);
  });
});

describe('invariants over 200 seeded schedules', () => {
  it('with the WAL rule on and acknowledgement after fsync, D, A and the serial replay hold at every crash point, in all four steal/force combinations, with and without a torn tail', () => {
    for (const policy of POLICIES) {
      for (const seed of SEEDS) {
        const plan = planFor(seed);
        for (let crashAfter = 1; crashAfter <= plan.ops.length; crashAfter++) {
          for (const torn of [false, true]) {
            const v = runSeed(seed, policy, { crashAfter, torn }).violations;
            expect(v, `${JSON.stringify(policy)} seed ${seed} crash ${crashAfter}`).toEqual([]);
          }
        }
      }
    }
  });

  it('recovery is idempotent and survives a second crash after any step', () => {
    for (const seed of SEEDS) {
      const base = runSeed(seed, {}, { recrashAfter: null });
      const again = recoverySteps({ ...base.recovered, torn: null });
      expect(again.image.disk, `seed ${seed}`).toEqual(base.recovered.disk);
      expect(again.events.some((e) => e.kind === 'undo' || e.kind === 'redo')).toBe(false);
      const steps = recoverySteps(base.image).events.length;
      for (let k = 0; k <= steps; k++) {
        const interrupted = runSeed(seed, {}, { recrashAfter: k });
        expect(interrupted.recovered.disk, `seed ${seed} second crash after ${k}`).toEqual(base.recovered.disk);
        expect(interrupted.violations).toEqual([]);
      }
    }
  });

  it('the timeline of a recovery ends on the same pages as running it straight through', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const r = runSeed(seed, {}, { recrashAfter: null });
      const straight = recoverySteps(r.image).image;
      for (const recrash of [null, 0, 2, 5]) {
        const t = recoveryTimeline(r.image, recrash);
        expect(t.at(-1)!.disk).toEqual(straight.disk);
        expect(t[0].event).toBeNull();
        expect(t.filter((f) => f.crashed).length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the broken modes violate the invariant on the pinned lowest seed, for the stated reason', () => {
  const lowest = (policy: Partial<Policy>) => SEEDS.find((s) => runSeed(s, policy).violations.length > 0);

  it('WAL rule off: the lowest failing seed of 0..199 is the pinned one and the rule broken is A', () => {
    expect(lowest({ enforceWal: false })).toBe(WAL_OFF_SEED);
    const r = runSeed(WAL_OFF_SEED, { enforceWal: false });
    expect(r.violations.map((v) => v.rule)).toEqual(['A']);
  });

  it('trace: the page was flushed while its log record was only in memory, its writer never committed, and the same plan with the rule on is clean', () => {
    const r = runSeed(WAL_OFF_SEED, { enforceWal: false });
    const page = Number(/^page (\d+) /.exec(r.violations[0].message)![1]);
    const flushLine = [...r.before.events].reverse().find((e) => e.startsWith(`page ${page} flushed`))!;
    expect(flushLine).toContain('NOT durable');
    expect(r.recovered.diskLsn[page]).toBeGreaterThan(r.image.log.length);
    const writer = r.before.log.filter((x) => x.kind === 'update' && x.page === page).at(-1)!.tx;
    expect(r.before.status[writer]).not.toBe('committed');
    expect(r.image.log.some((x) => x.kind === 'commit' && x.tx === writer)).toBe(false);
    expect(runSeed(WAL_OFF_SEED).violations).toEqual([]);
    expect(runSeed(WAL_OFF_SEED, { enforceWal: false }, { crashAfter: 1 }).violations).toEqual([]);
  });

  it('acknowledge before fsync: the lowest failing seed is the pinned one and the rule broken is D', () => {
    expect(lowest({ ackBeforeFsync: true })).toBe(ACK_EARLY_SEED);
    expect(runSeed(ACK_EARLY_SEED, { ackBeforeFsync: true }).violations.map((v) => v.rule)).toEqual(['D']);
  });

  it('trace: an acknowledged transaction\'s commit record is past the durable boundary, and the same plan acknowledged after fsync is clean', () => {
    const r = runSeed(ACK_EARLY_SEED, { ackBeforeFsync: true });
    const tx = Number(/^T(\d+) /.exec(r.violations[0].message)![1]);
    expect(r.before.acked).toContain(tx);
    const commitRec = r.before.log.find((x) => x.kind === 'commit' && x.tx === tx)!;
    expect(commitRec.lsn).toBeGreaterThan(r.image.log.length);
    expect(r.before.events.some((e) => e.startsWith(`T${tx} commits`) && e.includes('only in memory'))).toBe(true);
    expect(runSeed(ACK_EARLY_SEED).violations).toEqual([]);
    const safe = runSeed(ACK_EARLY_SEED);
    expect(safe.image.log.some((x) => x.kind === 'commit' && x.tx === tx) || !safe.before.acked.includes(tx)).toBe(true);
  });

  it('the hand-built schedules of the spec are the presets, and each breaks exactly the rule it names', () => {
    const rules = Object.fromEntries(PRESETS.map((p) => [p.id, runSeedless(presetMachine(p.id)).map((v) => v.rule)]));
    expect(rules).toEqual({ winner: [], loser: [], walOff: ['A'], ackEarly: ['D'] });
  });
});

describe('the policy cross product on the four presets (independent expectations)', () => {
  const combos: Policy[] = [];
  for (const steal of [true, false]) for (const force of [true, false]) for (const enforceWal of [true, false]) for (const ackBeforeFsync of [true, false]) combos.push({ steal, force, enforceWal, ackBeforeFsync });
  const ops: Record<string, Op[]> = Object.fromEntries(PRESETS.map((p) => [p.id, p.ops]));

  it('atomicity breaks exactly when a loser\'s page can be flushed (steal) with the WAL rule off; durability exactly when a commit is acknowledged before its fsync', () => {
    for (const policy of combos) {
      for (const id of Object.keys(ops)) {
        const m = ops[id].reduce(applyOp, fresh(policy));
        const rules = runSeedless(m).map((v) => v.rule);
        // a page reaches disk with no durable record: by a steal flush of a loser, or by force flushing before an early-acknowledged commit record exists
        const flushedLoser = ((id === 'loser' || id === 'walOff') && policy.steal && !policy.enforceWal) || ((id === 'winner' || id === 'ackEarly') && policy.force && !policy.enforceWal && policy.ackBeforeFsync);
        // force flushes the pages after the commit record is appended, and the WAL rule then makes the log durable up to it
        const ackedEarly = (id === 'winner' || id === 'ackEarly') && policy.ackBeforeFsync && !(policy.force && policy.enforceWal);
        expect(rules.includes('A'), `${id} ${JSON.stringify(policy)}`).toBe(flushedLoser);
        expect(rules.includes('D'), `${id} ${JSON.stringify(policy)}`).toBe(ackedEarly);
      }
    }
  });
});

function runSeedless(m: Machine) {
  return crashReport(m, false).violations;
}
