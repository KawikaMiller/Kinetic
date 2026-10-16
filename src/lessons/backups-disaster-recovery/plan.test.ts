import { describe, expect, it } from 'vitest';
import { snapshotsFor } from './backup';
import { DRILL_PLAN } from './drillView';
import {
  DEFAULT_PLAN, DETECTION_DAYS, FAILOVER_MIN, FAULT_PROBABILITY, INCIDENT_AT, REPLICA_LAG_MIN, SCENARIOS, SEEDS, WEAK_PLAN, backupSets, failsUntested, hiddenFault, lowestUntestedFailure,
  possibleFaults, restoreFrom, soundOutcome, verdict, type Method, type Plan, type ScenarioId, type Tests, type Where,
} from './plan';

const plan = (patch: Partial<Plan>): Plan => ({ ...DEFAULT_PLAN, ...patch });
const ok = (p: Plan, id: ScenarioId, seed = 4) => verdict(p, id, seed).ok;

describe('the spec\'s hand-built scenarios', () => {
  it('replica as backup: the table is dropped at 14:07, the replica applies the drop, and no earlier copy exists', () => {
    const v = verdict(plan({ method: 'replica' }), 'migration', 4);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('a replica is not a backup');
    // the same plan with snapshots and the log restores to 14:06, one minute of data lost
    const fixed = verdict(plan({ method: 'snapshots-log' }), 'migration', 4);
    expect(fixed).toMatchObject({ ok: true, lostMin: 1 });
    expect(fixed.why).toContain('Thu 14:06');
    // snapshots alone restore only to the last one: Thursday 02:00, 12 h 7 min before the drop
    expect(verdict(plan({ method: 'snapshots' }), 'migration', 4)).toMatchObject({ ok: true, lostMin: 12 * 60 + 7 });
  });

  it('same account: the stolen-credential scenario deletes copies in the same account unless locked for the detection time or kept in another account', () => {
    expect(ok(plan({ where: 'account', immutableDays: 0 }), 'ransomware')).toBe(false);
    expect(ok(plan({ where: 'region', immutableDays: 0 }), 'ransomware')).toBe(false);
    expect(ok(plan({ where: 'separate', immutableDays: 0 }), 'ransomware')).toBe(true);
    expect(ok(plan({ where: 'account', immutableDays: DETECTION_DAYS }), 'ransomware')).toBe(true);
    expect(ok(plan({ where: 'account', immutableDays: DETECTION_DAYS - 1 }), 'ransomware')).toBe(false);
    expect(ok(plan({ copies: 1, where: 'separate' }), 'ransomware')).toBe(false);
  });

  it('never tested: a hidden fault fails at the disaster, and the same plan with a restore test does not', () => {
    const never = plan({ tests: 'never', keyWith: false });
    const pin = lowestUntestedFailure(never)!;
    expect(verdict(never, 'untested', pin).ok).toBe(false);
    for (const t of ['quarterly', 'weekly'] as Tests[]) expect(verdict({ ...never, tests: t }, 'untested', pin).ok).toBe(true);
  });
});

describe('the scenario verdicts over every plan, restated independently', () => {
  const METHODS: Method[] = ['replica', 'snapshots', 'snapshots-log'];
  const WHERES: Where[] = ['disk', 'account', 'region', 'separate'];

  it('survival follows the stated rules for each of 864 plans', () => {
    for (const method of METHODS) for (const copies of [1, 2, 3] as const) for (const where of WHERES) for (const immutableDays of [0, 2, 3, 7]) for (const tests of ['never', 'quarterly', 'weekly'] as Tests[]) for (const keyWith of [true, false]) {
      const p = plan({ method, copies, where, immutableDays, tests, keyWith });
      const off = copies >= 2;
      const id = JSON.stringify([method, copies, where, immutableDays]);
      expect(ok(p, 'migration'), id).toBe(method !== 'replica');
      expect(ok(p, 'disk'), id).toBe(method === 'replica' || off);
      expect(ok(p, 'region'), id).toBe(off && (where === 'region' || where === 'separate'));
      expect(ok(p, 'ransomware'), id).toBe(method !== 'replica' && off && (where === 'separate' || immutableDays >= DETECTION_DAYS));
    }
  });

  it('a replica fails over with the replica lag and the failover time, and backups restore with the computed time', () => {
    expect(verdict(plan({ method: 'replica' }), 'disk', 4)).toMatchObject({ ok: true, lostMin: REPLICA_LAG_MIN, downtimeMin: FAILOVER_MIN });
    const v = verdict(DEFAULT_PLAN, 'disk', 4);
    expect(v.ok).toBe(true);
    expect(v.lostMin).toBe(INCIDENT_AT - Math.floor(INCIDENT_AT / 15) * 15);
    expect(v.downtimeMin).toBeGreaterThan(FAILOVER_MIN);
  });

  it('hidden controls do not feed the verdicts: the log interval only matters with a log archive, the snapshot interval not for a replica', () => {
    for (const id of SCENARIOS.map((s) => s.id)) {
      expect(verdict(plan({ method: 'snapshots', logMin: 5 }), id, 4)).toEqual(verdict(plan({ method: 'snapshots', logMin: 60 }), id, 4));
      expect(verdict(plan({ method: 'replica', snapshotH: 6 }), id, 4)).toEqual(verdict(plan({ method: 'replica', snapshotH: 48 }), id, 4));
    }
  });
});

describe('hidden faults on never-tested backups, over 200 seeds', () => {
  it('a fault appears on roughly the stated share of seeds, and only kinds the plan can have', () => {
    const faults = SEEDS.map((s) => hiddenFault(s, DRILL_PLAN));
    const share = faults.filter((f) => f !== null).length / SEEDS.length;
    expect(Math.abs(share - FAULT_PROBABILITY)).toBeLessThan(0.1);
    for (const f of faults) if (f !== null) expect(possibleFaults(DRILL_PLAN)).toContain(f);
    expect(possibleFaults(plan({ keyWith: true, method: 'snapshots' }))).not.toContain('key');
    expect(possibleFaults(plan({ method: 'snapshots' }))).not.toContain('gap');
  });

  it('the lowest failing seeds of 0..199 are pinned: any fault at seed 3, a missing log segment at seed 15', () => {
    expect(lowestUntestedFailure(DRILL_PLAN)).toBe(3);
    expect(lowestUntestedFailure(DRILL_PLAN, 'gap')).toBe(15);
  });

  it('trace of seed 3: the restore script is stale, so the restore fails outright; fixed, it restores to the same point as a sound plan', () => {
    const sets = backupSets(DRILL_PLAN, 3);
    expect(sets.filter((s) => s.fault !== null).map((s) => s.fault)).toEqual(['script']);
    const o = restoreFrom(DRILL_PLAN, sets, 3);
    expect(o).toMatchObject({ restored: false });
    const fixed = restoreFrom(DRILL_PLAN, sets.map((s) => ({ ...s, fault: null, gapSegment: null })), 3);
    expect(fixed).toEqual(soundOutcome(DRILL_PLAN, 3));
    expect(fixed.restored).toBe(true);
  });

  it('trace of seed 15: a log segment between the Thursday backup and the incident is missing, replay stops at its start, and without the fault the restore reaches further', () => {
    const sets = backupSets(DRILL_PLAN, 15);
    const log = sets.find((s) => s.snapshot === null)!;
    expect(log.fault).toBe('gap');
    const seg = log.gapSegment!;
    const base = snapshotsFor(DRILL_PLAN.snapshotH).filter((s) => s.t <= INCIDENT_AT).at(-1)!.t;
    expect(seg * DRILL_PLAN.logMin).toBeGreaterThanOrEqual(base);
    expect((seg + 1) * DRILL_PLAN.logMin).toBeLessThanOrEqual(INCIDENT_AT);
    const o = restoreFrom(DRILL_PLAN, sets, 15);
    expect(o.restored).toBe(true);
    expect(o.reached).toBe(seg * DRILL_PLAN.logMin);
    expect(o.why).toContain(`segment ${seg}`);
    const sound = soundOutcome(DRILL_PLAN, 15);
    expect(o.reached).toBeLessThan(sound.reached);
    expect(failsUntested(DRILL_PLAN, 15)).toBe(true);
  });

  it('a tested plan finds the fault in a drill: the verdict of the never-restorable scenario holds on all 200 seeds', () => {
    for (const seed of SEEDS) expect(verdict(DEFAULT_PLAN, 'untested', seed).ok, `seed ${seed}`).toBe(true);
  });

  it('the weak plan fails four scenarios of five, the sound plan none', () => {
    const count = (p: Plan) => SCENARIOS.filter((s) => verdict(p, s.id, 4).ok).length;
    expect(count(WEAK_PLAN)).toBe(1);
    expect(count(DEFAULT_PLAN)).toBe(5);
  });
});
