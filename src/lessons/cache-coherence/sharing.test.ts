import { describe, expect, it } from 'vitest';
import {
  BURST_RANGE, HIT_CYCLES, LAYOUTS, ONE_COUNTER_MESSAGE, TRANSFER_CYCLES, WRITES_RANGE, costCurve, costOf, placement, runSharing, sharingOpening, threadOf,
  type SharingConfig,
} from './sharing';

const base = sharingOpening();
const cfg = (patch: Partial<SharingConfig>): SharingConfig => ({ ...base, ...patch });

describe('ownership transfers equal their analytic values', () => {
  it('strict alternation of n writes on one shared line has n transfers (the first included); separate lines have 2', () => {
    for (const writes of [32, 64, 96, 256]) {
      expect(runSharing(cfg({ layout: 'adjacent', writes, burst: 1 })).transfers).toBe(writes);
      expect(runSharing(cfg({ layout: 'padded', writes, burst: 1 })).transfers).toBe(2);
    }
  });

  it('bursts of k have n / k transfers on a shared line', () => {
    for (const burst of [1, 2, 4, 8, 16]) {
      for (const writes of [32, 64, 128, 256]) {
        const run = runSharing(cfg({ layout: 'adjacent', writes, burst }));
        expect(run.transfers).toBe(writes / burst);
        expect(run.hits).toBe(writes - writes / burst);
      }
    }
  });

  it('a shared atomic counter costs the same as the one-line case whatever the padding', () => {
    for (const burst of [1, 3, 16]) {
      const one = runSharing(cfg({ layout: 'adjacent', burst }));
      expect(runSharing(cfg({ layout: 'atomic', burst })).cost).toBe(one.cost);
      expect(runSharing(cfg({ layout: 'atomic', burst, offsetA: 0, offsetB: 64, lineBytes: 64 })).transfers).toBe(one.transfers);
    }
  });

  it('per-thread counters merged at the end cost the padded run plus one line read', () => {
    const padded = runSharing(cfg({ layout: 'padded' }));
    const merged = runSharing(cfg({ layout: 'merged' }));
    expect(merged.transfers).toBe(padded.transfers);
    expect(merged.readTransfers).toBe(1);
    expect(merged.cost).toBe(padded.cost + TRANSFER_CYCLES);
  });

  it('every thread\'s first write and burst schedule match the interleaving', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => threadOf(i, 1))).toEqual([0, 1, 0, 1, 0, 1]);
    expect([0, 1, 2, 3, 4, 5].map((i) => threadOf(i, 2))).toEqual([0, 0, 1, 1, 0, 0]);
  });
});

describe('where the counters live', () => {
  it('two offsets in one line share it, and the 128-byte line size can put two counters 64 bytes apart on one line', () => {
    expect(placement(cfg({ offsetA: 0, offsetB: 8, lineBytes: 64 })).lines).toEqual([0, 0]);
    expect(placement(cfg({ offsetA: 0, offsetB: 64, lineBytes: 64 })).lines).toEqual([0, 1]);
    expect(placement(cfg({ offsetA: 0, offsetB: 64, lineBytes: 128 })).lines).toEqual([0, 0]);
    expect(runSharing(cfg({ offsetA: 0, offsetB: 64, lineBytes: 64 })).transfers).toBe(2);
    expect(runSharing(cfg({ offsetA: 0, offsetB: 64, lineBytes: 128 })).transfers).toBe(base.writes);
  });

  it('the same offset is refused as one counter and behaves as the shared-counter case', () => {
    const p = placement(cfg({ offsetA: 16, offsetB: 16 }));
    expect(p.refused).toBe(ONE_COUNTER_MESSAGE);
    expect(runSharing(cfg({ offsetA: 16, offsetB: 16 })).cost).toBe(runSharing(cfg({ layout: 'atomic' })).cost);
    expect(placement(cfg({ offsetA: 0, offsetB: 8 })).refused).toBeNull();
  });

  it('offsets feed no layout but the adjacent one (the control cross product)', () => {
    for (const layout of ['padded', 'atomic', 'merged'] as const) {
      const costs = new Set([[0, 8], [0, 64], [16, 16], [120, 0]].map(([a, b]) => runSharing(cfg({ layout, offsetA: a, offsetB: b })).cost));
      expect(costs.size).toBe(1);
    }
    for (const layout of ['padded', 'atomic', 'merged'] as const) {
      expect(new Set(([64, 128] as const).map((lineBytes) => runSharing(cfg({ layout, lineBytes })).cost)).size).toBe(1);
    }
  });
});

describe('cost', () => {
  it('is recomputed from the write records: transfers x T + hits x 1, plus any merge read', () => {
    for (const layout of LAYOUTS) {
      const run = runSharing(cfg({ layout, burst: 3 }));
      const transfers = run.records.filter((x) => x.transfer).length;
      const hits = run.records.length - transfers;
      expect(run.cost).toBe(costOf(transfers, run.readTransfers, hits));
      expect(run.cost).toBe((transfers + run.readTransfers) * TRANSFER_CYCLES + hits * HIT_CYCLES);
    }
  });

  it('the cost curve is non-increasing in burst length for every layout and run length', () => {
    for (const layout of LAYOUTS) {
      for (let writes = WRITES_RANGE.min; writes <= WRITES_RANGE.max; writes += WRITES_RANGE.step) {
        const curve = costCurve(cfg({ writes }), layout);
        expect(curve).toHaveLength(BURST_RANGE.max - BURST_RANGE.min + 1);
        for (let i = 1; i < curve.length; i++) expect(curve[i].cost).toBeLessThanOrEqual(curve[i - 1].cost);
      }
    }
  });

  it('padding fixes false sharing but not sharing: padded is cheaper than adjacent, atomic is not', () => {
    const adjacent = runSharing(cfg({ layout: 'adjacent' })).cost;
    expect(runSharing(cfg({ layout: 'padded' })).cost).toBeLessThan(adjacent);
    expect(runSharing(cfg({ layout: 'atomic' })).cost).toBe(adjacent);
  });
});
