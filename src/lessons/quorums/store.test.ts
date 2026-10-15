import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds, linearizable } from '../../core/distSim';
import { canGather } from './quorum';
import {
  BROKEN_SEED_NO_OVERLAP, BROKEN_SEED_SLOPPY, HOMES, TIMEOUT_MS, historyFor, homesOf, opsOf, readsSeeAcknowledgedWrites, storeCluster, storeScenario, type StoreConfig,
} from './store';

const SEEDS = 500;
const SAFETY = [readsSeeAcknowledgedWrites];
const chaos = { loss: 0.1, duplicate: 0.15, chaos: true };
const strict = (n: number, w: number, r: number, repair = false): StoreConfig => ({ n, w, r, sloppy: false, repair });

/** A hand-built network: replies to a coordinator take no time; everything else is looked up by (from, to), default 5 ms. */
const links = (table: Record<string, number>) => (_rnd: () => number, from: string, to: string) => (['W', 'X', 'Y'].includes(to) ? 0 : (table[`${from}>${to}`] ?? 5));

const runOps = (setup: Parameters<typeof storeCluster>[0], until = 600) => {
  const c = storeCluster(setup);
  c.run({ until });
  return { cluster: c, ops: opsOf(c.snapshot()) };
};

describe('R + W <= N: hand-built and seeded', () => {
  // N = 3, W = 1, R = 1. A acknowledges the write at 5 ms; B and C get it at 50 ms; a read at 10 ms is answered first by C, still at version 0.
  const latency = links({ 'W>B': 50, 'W>C': 50, 'X>A': 50, 'X>B': 50, 'X>C': 5 });
  it('replica A acknowledges at 5 ms and a read at 10 ms from C returns the old version: the acknowledged-write invariant fails', () => {
    const setup = { seed: 0, config: strict(3, 1, 1), writes: [0], reads: [{ at: 10 }], latency };
    const { ops } = runOps(setup);
    expect(ops.map((o) => [o.kind, o.invoke, o.response, o.value])).toEqual([['write', 0, 5, 1], ['read', 10, 15, 0]]);
    const verdict = checkInvariants(storeCluster(setup), SAFETY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toBe('the read that began at 10 ms returned version 0, but write 1 was acknowledged at 5 ms');
  });
  it('the same links with W = 2 and R = 2 hold: the write is acknowledged at 50 ms, after the read began', () => {
    const setup = { seed: 0, config: strict(3, 2, 2), writes: [0], reads: [{ at: 10 }], latency };
    expect(checkInvariants(storeCluster(setup), SAFETY).ok).toBe(true);
    expect(runOps(setup).ops[0].response).toBe(50);
  });
  it(`BROKEN_SEED_NO_OVERLAP ${BROKEN_SEED_NO_OVERLAP} is the lowest of ${SEEDS} seeds on which N=3, W=1, R=1 fails`, () => {
    const verdict = forSeeds(SEEDS, storeScenario(strict(3, 1, 1)), SAFETY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(BROKEN_SEED_NO_OVERLAP);
  });
  it('on that seed the cause is the missing overlap: the same seed, delays and reads with W = 2 and R = 2 passes', () => {
    expect(checkInvariants(storeScenario(strict(3, 1, 1))(BROKEN_SEED_NO_OVERLAP), SAFETY).ok).toBe(false);
    expect(checkInvariants(storeScenario(strict(3, 2, 2))(BROKEN_SEED_NO_OVERLAP), SAFETY).ok).toBe(true);
  });
});

describe('strict quorums (R + W > N) hold at every step under delay, loss, duplication, partition, crash and pause', () => {
  for (const [n, w, r, repair] of [[3, 2, 2, false], [5, 3, 3, true], [5, 4, 2, false], [7, 5, 3, false], [4, 3, 2, true]] as const) {
    it(`N=${n} W=${w} R=${r}${repair ? ' with read repair' : ''}: ${SEEDS} seeds`, () => {
      expect(forSeeds(SEEDS, storeScenario(strict(n, w, r, repair), chaos), SAFETY)).toEqual({ ok: true, seeds: SEEDS });
    });
  }
});

describe('overlap guarantees only acknowledged writes: a write in flight', () => {
  // N = 3, W = 2, R = 2. Version 1 reaches A at 5 ms and B, C at 50 ms (acknowledged at 50). X reads at 10 ms and hears A and C first: 1.
  // Y reads at 20 ms and hears B and C first: 0, although the first read already saw 1.
  const latency = links({ 'W>B': 50, 'W>C': 50, 'X>B': 500, 'Y>A': 500 });
  const setup = { seed: 0, config: strict(3, 2, 2), writes: [0], reads: [{ at: 10, via: 'X' as const }, { at: 20, via: 'Y' as const }], latency };

  it('the history is W(1) acknowledged at 50, a read that returns 1 at 15 and a later read that returns 0 at 25', () => {
    const { ops } = runOps(setup);
    expect(ops.map((o) => [o.kind, o.invoke, o.response, o.value])).toEqual([['write', 0, 50, 1], ['read', 10, 15, 1], ['read', 20, 25, 0]]);
  });
  it('the linearizable checker rejects it, and the acknowledged-write invariant still holds, so the two statements agree', () => {
    const { ops } = runOps(setup);
    expect(linearizable(historyFor(ops), { initial: 0 })).not.toBeNull();
    expect(checkInvariants(storeCluster(setup), SAFETY).ok).toBe(true);
  });
  it('a read that starts after the acknowledgement does see it', () => {
    const later = { ...setup, reads: [{ at: 60, via: 'Y' as const }] };
    const { ops } = runOps(later);
    expect(ops[1].value).toBe(1);
  });
  it('read repair writes the newest version back: with copies stuck in transit (1,000 ms) and R = 3, the stale replicas catch up only when repair is on', () => {
    const slow = links({ 'W>B': 1000, 'W>C': 1000 });
    const base = { seed: 0, writes: [0], reads: [{ at: 10 }], latency: slow };
    const without = runOps({ ...base, config: strict(3, 1, 3, false) }, 200).cluster.snapshot();
    const repaired = runOps({ ...base, config: strict(3, 1, 3, true) }, 200).cluster.snapshot();
    const versions = (s: typeof without) => ['A', 'B', 'C'].map((h) => (s.nodes[h].state?.role === 'replica' ? s.nodes[h].state.version : -1));
    expect(versions(without)).toEqual([1, 0, 0]);
    expect(versions(repaired)).toEqual([1, 1, 1]);
  });
});

describe('sloppy quorums under a partition', () => {
  // The writer's side {W, A, S1, S2} is cut from {X, B, C}. Strict: the write times out. Sloppy: S1 stands in for B, the write is acknowledged, and a read on the other side misses it.
  const partition = { a: ['W', 'A', 'S1', 'S2'], b: ['X', 'B', 'C'], from: 0, to: 1000 };
  const base = { seed: 0, writes: [0], reads: [{ at: 100 }], latency: links({}), partition };

  it('strict: the write ends "no quorum" at the timeout and nothing is violated', () => {
    const setup = { ...base, config: strict(3, 2, 2) };
    const { ops } = runOps(setup, 300);
    expect(ops[0]).toMatchObject({ outcome: 'refused', response: TIMEOUT_MS });
    expect(checkInvariants(storeCluster(setup), SAFETY).ok).toBe(true);
  });
  it('sloppy: a stand-in makes the write acknowledged at 25 ms, and the read at 100 ms from B and C returns version 0', () => {
    const setup = { ...base, config: { n: 3, w: 2, r: 2, sloppy: true, repair: false } };
    const { ops } = runOps(setup, 300);
    expect([ops[0].outcome, ops[0].response, ops[1].value]).toEqual(['ok', 25, 0]);
    const verdict = checkInvariants(storeCluster(setup), SAFETY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toBe('the read that began at 100 ms returned version 0, but write 1 was acknowledged at 25 ms');
  });
  it('once the partition heals the hint is handed off and the home replicas hold the version', () => {
    const healed = { ...base, partition: { ...partition, to: 300 }, config: { n: 3, w: 2, r: 2, sloppy: true, repair: false }, reads: [{ at: 600 }] };
    const { cluster, ops } = runOps(healed, 800);
    const snap = cluster.snapshot();
    for (const h of ['B', 'C']) expect(snap.nodes[h].state).toMatchObject({ role: 'replica', version: 1 });
    expect(snap.nodes.S1.state).toMatchObject({ hints: {} });
    expect(ops[1].value).toBe(1);
  });
  it(`BROKEN_SEED_SLOPPY ${BROKEN_SEED_SLOPPY} is the lowest of ${SEEDS} seeds with random partitions on which a sloppy quorum breaks the invariant`, () => {
    const verdict = forSeeds(SEEDS, storeScenario({ n: 3, w: 2, r: 2, sloppy: true, repair: false }, { chaos: true }), SAFETY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(BROKEN_SEED_SLOPPY);
  });
  it('on that seed the cause is the sloppy quorum under a partition: strict on the same seed passes, and sloppy with no faults passes', () => {
    const sloppy = { n: 3, w: 2, r: 2, sloppy: true, repair: false };
    expect(checkInvariants(storeScenario(sloppy, { chaos: true })(BROKEN_SEED_SLOPPY), SAFETY).ok).toBe(false);
    expect(checkInvariants(storeScenario({ ...sloppy, sloppy: false }, { chaos: true })(BROKEN_SEED_SLOPPY), SAFETY).ok).toBe(true);
    expect(checkInvariants(storeScenario(sloppy)(BROKEN_SEED_SLOPPY), SAFETY).ok).toBe(true);
  });
});

describe('liveness, tested apart from safety: an operation completes whenever a quorum is reachable, otherwise it ends "no quorum" at the timeout', () => {
  it('for every N from 3 to 5, every W and R, and every set of crashed home replicas', () => {
    let cases = 0;
    for (let n = 3; n <= 5; n++) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const down = homesOf(n).filter((_, i) => mask & (1 << i));
        for (let q = 1; q <= n; q++) {
          const { ops } = runOps({ seed: 0, config: strict(n, q, q), writes: [0], reads: [{ at: 300 }], latency: links({}), down }, 800);
          const reachable = canGather(n, down.length, q);
          expect(ops[0].outcome, `write N=${n} q=${q} down=${down}`).toBe(reachable ? 'ok' : 'refused');
          expect(ops[1].outcome, `read N=${n} q=${q} down=${down}`).toBe(reachable ? 'ok' : 'refused');
          if (!reachable) expect(ops[0].response).toBe(TIMEOUT_MS);
          cases++;
        }
      }
    }
    expect(cases).toBe(3 * 8 + 4 * 16 + 5 * 32);
  });
  it('crashing every replica gives "no quorum" at the timeout, never an infinite wait', () => {
    const { ops } = runOps({ seed: 0, config: strict(5, 3, 3), writes: [0], reads: [{ at: 200 }], down: [...HOMES.slice(0, 5)] }, 1000);
    expect(ops.map((o) => o.outcome)).toEqual(['refused', 'refused']);
  });
  it('a read returns the maximum version among the replies it used, against a reference, on 1,000 seeded runs (no faults)', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const c = storeCluster({ seed, config: strict(5, 3, 3), writes: [0, 60, 120], reads: [{ at: 30 }, { at: 100 }, { at: 160 }] });
      c.run();
      const ops = opsOf(c.snapshot());
      for (const read of ops.filter((o) => o.kind === 'read')) {
        // Every reply a replica sent for this read, in arrival order, from the trace: the read used the first three.
        const replies = c.trace.filter((t) => t.kind === 'deliver' && t.to === read.node && t.payload?.type === 'value' && t.payload.op === read.op);
        const used = replies.slice(0, 3).map((t) => (t.payload as { version: number }).version);
        expect(read.value, `seed ${seed} op ${read.op}`).toBe(Math.max(...used));
      }
    }
  });
});
