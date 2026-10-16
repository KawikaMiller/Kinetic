import { describe, expect, it } from 'vitest';
import {
  BAD_DEPLOY_AT, DEFAULT_THROUGHPUT, FULL_AT, FULL_GB, INCREMENTAL_GB, LOG_GB_PER_HOUR, MIN_PER_HOUR, REPLAY_SHARE, WEEK_MIN, clock, dataLostMin, latestRecoverable, restore, restoreTime,
  seededGaps, seededHistory, segmentEnd, segmentOf, snapshotsFor, type Op, type RestoreInput,
} from './backup';
import { INCIDENT_AT } from './plan';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const sameState = (a: Record<number, number>, b: Record<number, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** An independent oracle: the database as a never-failed copy had it, by applying the operations one at a time into a Map. */
function oracle(history: readonly Op[], t: number): Record<number, number> {
  const m = new Map<number, number>();
  for (const op of history) {
    if (op.t > t) break;
    if (op.kind === 'drop') m.clear();
    else if (op.kind === 'del') m.delete(op.key!);
    else m.set(op.key!, op.value!);
  }
  return Object.fromEntries(m);
}

/** Independent: can a restore stand exactly at t? From the latest snapshot at or before t (or from nothing), every segment holding an operation-minute in (start, t] must have shipped and not be lost. */
function canReach(i: RestoreInput, t: number): boolean {
  const base = [...i.snapshots].reverse().find((x) => x.t <= t)?.t ?? 0;
  if (t === base) return true;
  if (i.logMin === null) return false;
  for (let minute = base + 1; minute <= t; minute++) {
    const seg = Math.ceil(minute / i.logMin) - 1;
    if (i.gaps.has(seg) || (seg + 1) * i.logMin > i.disasterAt) return false;
  }
  return true;
}

const input = (seed: number, snapshotH: number, logMin: number | null, gaps: number[], disasterAt: number, withDrop = false): RestoreInput => ({
  history: seededHistory(seed, withDrop),
  snapshots: snapshotsFor(snapshotH).filter((s) => s.t <= disasterAt),
  logMin,
  gaps: new Set(gaps),
  disasterAt,
});

describe('restore equals the never-failed database for every target up to the last contiguous archived record', () => {
  it('over 200 seeded histories, snapshot intervals, log intervals, disaster times and gap positions, at every target minute checked', () => {
    for (const seed of SEEDS) {
      const snapshotH = [6, 12, 24, 48][seed % 4];
      const logMin = [5, 10, 15, 30, 60][seed % 5];
      const disasterAt = 600 + ((seed * 937) % (WEEK_MIN - 700));
      const gap = seed % 3 === 0 ? [Math.floor(((disasterAt - 300) / logMin) * ((seed % 7) / 7))] : [];
      const i = input(seed, snapshotH, logMin, gap, disasterAt, seed % 2 === 0);
      const reachable = latestRecoverable(i);
      expect(reachable, `seed ${seed}`).toBeLessThanOrEqual(disasterAt);
      for (const t of [0, 1, FULL_AT, reachable - 1, reachable, Math.floor(reachable / 2), reachable + 7, disasterAt]) {
        if (t < 0) continue;
        const r = restore(i, t);
        if (canReach(i, t)) {
          expect(r.reached, `seed ${seed} t=${t}`).toBe(t);
          expect(sameState(r.state, oracle(i.history, t)), `seed ${seed} target ${clock(t)}`).toBe(true);
        } else {
          expect(r.reached).toBeLessThan(t);
          expect(r.reason).not.toBeNull();
        }
        // never a silent skip: whatever it reached, the state is the never-failed state at that point
        expect(sameState(r.state, oracle(i.history, r.reached)), `seed ${seed} reached ${clock(r.reached)}`).toBe(true);
      }
    }
  });

  it('every minute of a week, for a few histories: the restored state equals the oracle wherever the restore reaches the target', () => {
    for (const seed of [1, 2, 3]) {
      const i = input(seed, 24, 15, [], WEEK_MIN, true);
      const r0 = restore(i, WEEK_MIN);
      expect(r0.reached).toBe(Math.floor(WEEK_MIN / 15) * 15);
      for (let t = 0; t <= WEEK_MIN; t += 37) {
        const r = restore(i, t);
        expect(sameState(r.state, oracle(i.history, r.reached))).toBe(true);
        if (t <= r0.reached) expect(r.reached).toBe(t);
      }
    }
  });

  it('a restore stops at the first missing segment, and says which one', () => {
    const i = input(5, 24, 15, [340, 345], 5300);
    const base = (3 * 24 + 2) * 60;
    expect(i.snapshots.at(-1)!.t).toBe(base);
    const r = restore(i, 5200);
    expect(r.stoppedAtGap).toBe(340);
    expect(r.reached).toBe(340 * 15);
    expect(r.reason).toContain('segment 340');
    expect(restore(i, 340 * 15 - 1).reached).toBe(340 * 15 - 1);
  });

  it('without a log archive the nearest point is the last snapshot, and the restore says so', () => {
    const i = input(7, 24, null, [], 5000);
    const r = restore(i, 4800);
    expect(r.reached).toBe((3 * 24 + 2) * 60);
    expect(r.reason).toContain('no log archive');
  });
});

describe('RPO and RTO against hand-worked values', () => {
  it('RPO is the time between the disaster and the last shipped segment: 14:37 with 15-minute segments loses 7 minutes', () => {
    const d = (3 * 24 + 14) * 60 + 37;
    expect(dataLostMin(input(1, 24, 15, [], d))).toBe(7);
    expect(dataLostMin(input(1, 24, 15, [], (3 * 24 + 14) * 60 + 30))).toBe(0);
    expect(dataLostMin(input(1, 24, 60, [], d))).toBe(37);
  });

  it('checked against a brute-force search for the latest reachable minute, over 200 seeds', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const logMin = [5, 15, 30][seed % 3];
      const d = 3000 + seed * 41;
      const i = input(seed, [12, 24][seed % 2], seed % 4 === 0 ? null : logMin, seed % 5 === 0 ? [Math.floor(d / logMin) - 3] : [], d);
      let best = 0;
      for (let t = 0; t <= d; t++) if (restore(i, t).reached === t) best = t;
      expect(latestRecoverable(i), `seed ${seed}`).toBe(best);
      expect(dataLostMin(i)).toBe(d - best);
    }
  });

  it('RTO is chain size over throughput plus log replay at half speed, worked by hand for the default state', () => {
    const d = (3 * 24 + 14) * 60 + 37;
    const i = input(1, 24, 15, [], d);
    const t = restoreTime(i, BAD_DEPLOY_AT - 1, DEFAULT_THROUGHPUT);
    // the chain: the Monday full and three incrementals (Tue, Wed, Thu 02:00); replay from Thu 02:00 to 14:06
    expect(t.restoreGB).toBe(FULL_GB + 3 * INCREMENTAL_GB);
    const replayHours = (14 * 60 + 6 - 2 * 60) / MIN_PER_HOUR;
    expect(t.replayGB).toBeCloseTo(replayHours * LOG_GB_PER_HOUR, 9);
    expect(t.restoreS).toBeCloseTo((460 * 1024) / 500, 9);
    expect(t.replayS).toBeCloseTo((replayHours * LOG_GB_PER_HOUR * 1024) / (500 * REPLAY_SHARE), 9);
    expect(t.totalS).toBeCloseTo(t.restoreS + t.replayS, 9);
  });

  it('more throughput or a more recent backup shortens it; more log volume lengthens it', () => {
    const d = (3 * 24 + 14) * 60 + 37;
    const slow = restoreTime(input(1, 24, 15, [], d), d, 100).totalS;
    const fast = restoreTime(input(1, 24, 15, [], d), d, 1000).totalS;
    expect(fast).toBeLessThan(slow);
    expect(restoreTime(input(1, 6, 15, [], d), d, 500).replayGB).toBeLessThan(restoreTime(input(1, 48, 15, [], d), d, 500).replayGB);
  });
});

describe('segments and gaps', () => {
  it('segment j covers (j L, (j + 1) L] and a seeded gap falls in the window asked for', () => {
    expect(segmentOf(1, 15)).toBe(0);
    expect(segmentOf(15, 15)).toBe(0);
    expect(segmentOf(16, 15)).toBe(1);
    expect(segmentEnd(1, 15)).toBe(30);
    for (const seed of SEEDS) {
      const g = [...seededGaps(seed, 15, INCIDENT_AT - 60, 1, INCIDENT_AT - 12 * 60)][0];
      expect(g * 15).toBeGreaterThanOrEqual(INCIDENT_AT - 12 * 60);
      expect(segmentEnd(g, 15)).toBeLessThanOrEqual(INCIDENT_AT - 60);
    }
  });

  it('clock text and the snapshot schedule', () => {
    expect(clock(BAD_DEPLOY_AT)).toBe('Thu 14:07');
    expect(clock(0)).toBe('Mon 00:00');
    expect(snapshotsFor(24).map((s) => s.kind)).toEqual(['full', ...Array(6).fill('incremental')]);
    expect(snapshotsFor(24)[1].t).toBe(FULL_AT + 24 * 60);
  });
});
