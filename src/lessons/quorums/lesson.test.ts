import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { availabilityCaption, latencyCaption, setsCaption, storeCaption } from './captions';
import lesson from './index';
import { expectedKthFastest, missingPairs, simulateKthFastest, waitByQuorum } from './quorum';
import { DEFAULT_SETS, disjointSets, read, withSizes, write } from './sets';
import { HOMES, STORE_FIXED_LATENCY, TIMEOUT_MS, opsOf, storeCluster } from './store';
import { DEFAULT_STORE, HORIZON_MS, runStore, setupFor } from './storeView';

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: at N = 5, W = 3 the default overlaps; R = 2 leaves 10 of 100 pairs missing, and picking sets that miss then reading is stale', () => {
    expect([DEFAULT_SETS.n, DEFAULT_SETS.w, DEFAULT_SETS.r]).toEqual([5, 3, 3]);
    expect(missingPairs({ n: 5, w: 3, r: 3 }).missing).toBe(0n);
    let s = withSizes(DEFAULT_SETS, 3, 2);
    expect(missingPairs({ n: s.n, w: s.w, r: s.r })).toEqual({ missing: 10n, total: 100n });
    const disjoint = disjointSets(s.n, s.w, s.r)!;
    s = { ...s, ...disjoint };
    s = read(write(s));
    expect(s.lastRead!.returned).toBeLessThan(s.lastRead!.latest);
    const c = text(setsCaption(s), { strict: true });
    expect(c).toContain('10 of the 100 pairs of sets miss each other');
    expect(c).toContain('The sets you picked share no replica');
    expect(c).toContain('The last read returned version 0 while the latest is 1: stale');
    expect(lesson.tryThis[0]).toContain('10 of the 100 pairs');
  });

  it('try-this 2: with W = 5 and replica A crashed the write ends "no quorum" at 150 ms; with W = 3 it survives two crashes', () => {
    const run = (w: number, down: string[]) => {
      const c = storeCluster({ seed: 0, config: { n: 5, w, r: 3, sloppy: false, repair: false }, writes: [0], reads: [{ at: 300 }], latency: STORE_FIXED_LATENCY, down });
      c.run({ until: 800 });
      return opsOf(c.snapshot());
    };
    const blocked = run(5, ['A']);
    expect([blocked[0].outcome, blocked[0].response]).toEqual(['refused', TIMEOUT_MS]);
    expect(run(3, ['A', 'B'])[0].outcome).toBe('ok');
    expect(run(3, ['A', 'B', 'C'])[0].outcome).toBe('refused');
    const c = text(availabilityCaption({ n: 5, w: 5, r: 3, unreachable: 1, write: blocked[0], read: blocked[1] }), { strict: true });
    expect(c).toContain('no quorum after 150 ms');
    expect(c).not.toContain('disagrees');
  });

  it('try-this 3: the 99th percentile of the wait rises from W = 1 to W = 5, with the numbers the lesson prints', () => {
    const rows = waitByQuorum(5);
    expect(rows[4].p99).toBeGreaterThan(rows[0].p99);
    expect(lesson.tryThis[2]).toContain(`${rows[4].p99.toPrecision(3)} ms`);
    const kth = { formula: expectedKthFastest(5, 3), sim: simulateKthFastest(5, 3, 20_000, 11).mean };
    const c = text(latencyCaption({ n: 5, w: 3, rows, kth }), { strict: true });
    expect(c).toContain('0.7833 by the formula');
  });

  it('try-this 4: the default schedule is a write in flight with W = 2, R = 2; the invariant holds and the history is not linearizable', () => {
    expect(DEFAULT_STORE).toMatchObject({ schedule: 'inflight', w: 2, r: 2, sloppy: false });
    const run = runStore(setupFor(DEFAULT_STORE), HORIZON_MS.inflight);
    expect(run.invariant).toBeNull();
    expect(run.linearizable).not.toBeNull();
    const c = text(storeCaption({ schedule: 'inflight', run, w: 2, r: 2, sloppy: false, t: HORIZON_MS.inflight }), { strict: true });
    expect(c).toContain('invariant holds');
    expect(c).toContain('not linearizable');
  });

  it('try-this 5: on the partition schedule strict refuses the write, sloppy acknowledges it, a read returns version 0 and the invariant breaks', () => {
    const strict = runStore(setupFor({ ...DEFAULT_STORE, schedule: 'sloppy' }), HORIZON_MS.sloppy);
    expect(strict.ops[0].outcome).toBe('refused');
    expect(strict.invariant).toBeNull();
    const sloppy = runStore(setupFor({ ...DEFAULT_STORE, schedule: 'sloppy', sloppy: true }), HORIZON_MS.sloppy);
    expect(sloppy.ops[0].outcome).toBe('ok');
    expect(sloppy.ops[1].value).toBe(0);
    expect(sloppy.invariant).toBe('the read that began at 100 ms returned version 0, but write 1 was acknowledged at 25 ms');
    const after = sloppy.ops[2];
    expect(after.value).toBe(1);
    const c = text(storeCaption({ schedule: 'sloppy', run: sloppy, w: 2, r: 2, sloppy: true, t: HORIZON_MS.sloppy }), { strict: true });
    expect(c).toContain('fails: the read that began at 100 ms');
  });
});

describe('captions are computed from the model', () => {
  it('the sets caption states overlap exactly when R + W > N, for every N, W and R', () => {
    for (let n = 3; n <= 7; n++) {
      for (let w = 1; w <= n; w++) {
        for (let r = 1; r <= n; r++) {
          const s = { ...DEFAULT_SETS, n, w, r, versions: new Array<number>(n).fill(0) };
          const c = text(setsCaption(s), { strict: true });
          expect(c.includes('not more than N'), `${n} ${w} ${r}`).toBe(r + w <= n);
          const { missing, total } = missingPairs({ n, w, r });
          if (r + w <= n) expect(c).toContain(`${missing.toLocaleString('en-US')} of the ${total.toLocaleString('en-US')} pairs`);
        }
      }
    }
  });

  it('the availability caption never disagrees with the simulation, for every N, W, R and number of crashes', () => {
    for (let n = 3; n <= 5; n++) {
      for (let q = 1; q <= n; q++) {
        for (let d = 0; d <= n; d++) {
          const c = storeCluster({ seed: 0, config: { n, w: q, r: q, sloppy: false, repair: false }, writes: [0], reads: [{ at: 300 }], latency: STORE_FIXED_LATENCY, down: HOMES.slice(0, d) });
          c.run({ until: 800 });
          const ops = opsOf(c.snapshot());
          expect(text(availabilityCaption({ n, w: q, r: q, unreachable: d, write: ops[0], read: ops[1] }), { strict: true }), `${n} ${q} ${d}`).not.toContain('disagrees');
        }
      }
    }
  });

  it('the seeded run keeps the schedule it names: a hand-built schedule does not depend on the seed control', () => {
    const a = runStore(setupFor({ ...DEFAULT_STORE, seed: 3 }), HORIZON_MS.inflight);
    const b = runStore(setupFor({ ...DEFAULT_STORE, seed: 99 }), HORIZON_MS.inflight);
    expect(a.ops).toEqual(b.ops);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
