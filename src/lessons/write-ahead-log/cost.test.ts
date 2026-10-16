import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_INTERVALS, FSYNC_HDD_MS, FSYNC_SSD_MS, HORIZON_MS, MAX_COMMITTERS, averageGroup, checkpointRun, commitCost, groupCommit, groupedEstimate, ungroupedCeiling, workloadOps,
} from './cost';
import { applyOp, fresh } from './wal';

const LATENCIES = [0.1, FSYNC_SSD_MS, 2, FSYNC_HDD_MS, 12];
const COMMITTERS = [1, 2, 3, 8, 17, 64];

describe('group commit against the closed forms', () => {
  it('without grouping the rate never passes 1 / latency; with grouping it never passes committers / latency', () => {
    for (const L of LATENCIES) {
      for (const c of COMMITTERS) {
        const plain = groupCommit(L, c, false);
        const grouped = groupCommit(L, c, true);
        expect(plain.throughput, `L=${L} c=${c}`).toBeLessThanOrEqual(ungroupedCeiling(L) + 1e-9);
        expect(grouped.throughput, `L=${L} c=${c}`).toBeLessThanOrEqual((c * ungroupedCeiling(L)) + 1e-9);
        expect(grouped.throughput).toBeGreaterThanOrEqual(plain.throughput);
      }
    }
  });

  it('the ungrouped rate is close to its ceiling, and grouping shares each fsync among several committers', () => {
    for (const L of [FSYNC_SSD_MS, FSYNC_HDD_MS]) {
      const plain = groupCommit(L, 8, false);
      expect(plain.throughput).toBeGreaterThan(ungroupedCeiling(L) * 0.9);
      const grouped = groupCommit(L, 8, true);
      expect(grouped.commits / grouped.fsyncs).toBeGreaterThan(3);
      expect(grouped.throughput).toBeGreaterThan(plain.throughput * 3);
    }
  });

  it('one committer cannot be helped by grouping, and fsyncs equal batches', () => {
    for (const L of LATENCIES) expect(groupCommit(L, 1, true)).toEqual(groupCommit(L, 1, false));
    const g = groupCommit(FSYNC_HDD_MS, 8, true);
    expect(g.fsyncs).toBeLessThanOrEqual(Math.floor(HORIZON_MS / FSYNC_HDD_MS));
    expect(g.commits).toBeGreaterThan(g.fsyncs);
    const p = groupCommit(FSYNC_HDD_MS, 8, false);
    expect(p.commits).toBe(p.fsyncs);
  });

  it('is deterministic for a seed and covers the slider range', () => {
    expect(groupCommit(1, 5, true, 3)).toEqual(groupCommit(1, 5, true, 3));
    expect(groupCommit(0.1, MAX_COMMITTERS, true).commits).toBeGreaterThan(0);
  });
});

describe('checkpoints and commit cost', () => {
  it('a shorter checkpoint interval never raises the worst-case recovery scan, and never scans more than the log', () => {
    const runs = [...CHECKPOINT_INTERVALS].map((i) => checkpointRun(i));
    const never = runs[0];
    const timed = runs.slice(1);
    for (let i = 1; i < timed.length; i++) expect(timed[i].worstScanned).toBeGreaterThanOrEqual(timed[i - 1].worstScanned);
    for (const r of runs) expect(r.worstScanned).toBeLessThanOrEqual(r.records);
    for (const r of timed) expect(r.worstScanned).toBeLessThanOrEqual(never.worstScanned);
    expect(never.checkpoints).toBe(0);
    expect(never.pageWrites).toBe(0);
  });

  it('checkpoints cost page writes: more checkpoints, at least as many writes', () => {
    expect(checkpointRun(6).pageWrites).toBeGreaterThan(checkpointRun(12).pageWrites);
    expect(checkpointRun(12).pageWrites).toBeGreaterThan(checkpointRun(0).pageWrites);
  });

  it('with no checkpoint, the scan is the whole log up to the crash point (counted independently from the ops)', () => {
    const r = checkpointRun(0);
    let m = fresh();
    for (const op of workloadOps()) m = applyOp(m, op);
    expect(r.records).toBe(m.log.length);
    expect(r.worstScanned).toBe(m.log.filter((x) => x.kind === 'update').length);
  });

  it('force pays page writes at commit that no-force does not, and no-force needs one fsync per commit', () => {
    const noForce = commitCost({ force: false });
    const force = commitCost({ force: true });
    expect(noForce.pageWrites).toBe(0);
    expect(force.pageWrites).toBeGreaterThan(0);
    expect(noForce.fsyncs).toBe(noForce.commits);
    expect(force.fsyncs).toBeGreaterThanOrEqual(noForce.fsyncs);
  });
});

describe('what grouping really reaches in the closed loop (closed forms, stated independently of the simulation)', () => {
  it('the average group is about half the committers: the loop alternates a batch of c - 1 with a batch of 1', () => {
    for (const L of LATENCIES) {
      for (let c = 2; c <= MAX_COMMITTERS; c++) {
        const g = groupCommit(L, c, true);
        expect(Math.abs(averageGroup(g) - c / 2), `L=${L} c=${c}`).toBeLessThanOrEqual(0.1 * Math.max(1, c / 2));
      }
    }
  });

  it('so the grouped rate is about committers / (2 x latency) and not committers / latency, and 8 committers at 0.5 ms give 4 per fsync', () => {
    for (const L of [FSYNC_SSD_MS, FSYNC_HDD_MS]) {
      for (const c of [3, 8, 17, 64]) {
        const g = groupCommit(L, c, true);
        expect(g.throughput / groupedEstimate(L, c), `L=${L} c=${c}`).toBeGreaterThan(0.9);
        expect(g.throughput / groupedEstimate(L, c)).toBeLessThan(1.1);
        expect(g.throughput).toBeLessThan(0.6 * c * ungroupedCeiling(L));
      }
    }
    const g = groupCommit(FSYNC_SSD_MS, 8, true);
    expect(averageGroup(g)).toBeCloseTo(4, 0);
    expect(g.throughput).toBeCloseTo(8 / (2 * (FSYNC_SSD_MS / 1000)), -2);
  });

  it('with two committers there is nothing to gain (1 commit per fsync either way)', () => {
    expect(groupCommit(FSYNC_SSD_MS, 2, true).throughput).toBeCloseTo(groupCommit(FSYNC_SSD_MS, 2, false).throughput, -1);
  });
});
