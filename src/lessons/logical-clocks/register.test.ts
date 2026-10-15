import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import {
  BROKEN_SEED, NO_PRUNE_SEED, REGISTER_SAFETY, REPLICAS, causality, noConcurrentWriteDiscarded, placesFor, registerCluster, registerScenario, replicaStates, runRegister,
  siblingsAreMaximal, type RegMode, type Resolve, type VV,
} from './register';

const SEEDS = 300;
const hand = { places: { a: 'r1', b: 'r2', resolver: 'r3' }, fixedLatencyMs: 20, seed: 0 } as const;
const finalStates = (mode: RegMode, resolve: Resolve = 'merge', extra: object = {}) => {
  const c = registerCluster({ ...hand, mode, resolve, ...extra });
  c.run();
  return Object.fromEntries(replicaStates(c.snapshot()).map(([id, st]) => [id, st.versions]));
};

describe('hand-built schedule: two writes before any message arrives', () => {
  it('Lamport last-write-wins throws a write away: both stamped 1, the tie goes to r2, so r2 drops the incoming a while it is concurrent with b', () => {
    const verdict = checkInvariants(registerCluster({ ...hand, mode: 'lww', resolve: 'merge' }), REGISTER_SAFETY);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toBe('r2 discarded write a although no surviving write came after it: it is concurrent with b');
    const finals = finalStates('lww');
    for (const r of REPLICAS) expect(finals[r].map((v) => v.id), r).toEqual(['b']);
  });

  it('version vectors keep both as siblings with incomparable vectors, then the resolution dominates both and replaces them everywhere', () => {
    const { frames } = runRegister({ ...hand, mode: 'siblings', resolve: 'merge' });
    expect(frames.every((f) => f.violation === null)).toBe(true);
    const bothSiblings = frames.find((f) => Object.values(f.replicas).every((vs) => vs.length === 2));
    expect(bothSiblings).toBeDefined();
    expect(bothSiblings!.replicas.r1.map((v) => v.id).sort()).toEqual(['a', 'b']);
    const finals = finalStates('siblings');
    for (const r of REPLICAS) {
      expect(finals[r].map((v) => `${v.id}:${v.value}`), r).toEqual(['m:a+b']);
      expect(finals[r][0].vv).toEqual({ r1: 1, r2: 1, r3: 1 });
    }
  });

  it('picking one sibling still writes a version that dominates both, so both are replaced by the picked value', () => {
    for (const [how, value] of [['pick-a', 'a'], ['pick-b', 'b']] as const) {
      const finals = finalStates('siblings', how);
      for (const r of REPLICAS) expect(finals[r].map((v) => `${v.id}:${v.value}`), `${how} ${r}`).toEqual([`m:${value}`]);
    }
  });

  it('never pruning keeps ancestors: after the resolution r1 still holds a, b and m, and invariant (2) fails', () => {
    const verdict = checkInvariants(registerCluster({ ...hand, mode: 'no-prune', resolve: 'merge' }), [siblingsAreMaximal]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toMatch(/ancestor of m$/);
    expect(finalStates('no-prune').r1.map((v) => v.id).sort()).toEqual(['a', 'b', 'm']);
  });
});

describe('seeded fault schedules', () => {
  it(`BROKEN_SEED ${BROKEN_SEED} is the lowest of ${SEEDS} seeds on which Lamport last-write-wins breaks invariant (1)`, () => {
    const verdict = forSeeds(SEEDS, registerScenario('lww', 'merge'), [noConcurrentWriteDiscarded]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(BROKEN_SEED);
  });

  it('on BROKEN_SEED the cause is concurrency, not delay: if b is written after reading a, the same seed with the same latencies passes', () => {
    expect(forSeeds({ from: BROKEN_SEED, to: BROKEN_SEED + 1 }, registerScenario('lww', 'merge'), [noConcurrentWriteDiscarded]).ok).toBe(false);
    const c = registerCluster({ seed: BROKEN_SEED, mode: 'lww', resolve: 'merge', sequential: true });
    expect(checkInvariants(c, [noConcurrentWriteDiscarded]).ok).toBe(true);
  });

  it(`${SEEDS} seeds with loss, duplication, a partition, a crash and a pause: version-vector siblings hold (0), (1) and (2) after every event, for merge and both picks`, () => {
    for (const how of ['merge', 'pick-a', 'pick-b'] as const) {
      expect(forSeeds(SEEDS, registerScenario('siblings', how, true), REGISTER_SAFETY), how).toEqual({ ok: true, seeds: SEEDS });
    }
  });

  it(`NO_PRUNE_SEED ${NO_PRUNE_SEED} is the lowest of ${SEEDS} seeds on which never pruning breaks invariant (2)`, () => {
    const verdict = forSeeds(SEEDS, registerScenario('no-prune', 'merge'), [siblingsAreMaximal]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(NO_PRUNE_SEED);
  });

  it('the vector order the replicas hold equals the ground-truth causal order carried in deps, for every pair of versions in every final state', () => {
    let pairs = 0;
    for (let seed = 0; seed < 200; seed++) {
      const c = registerCluster({ seed, mode: 'no-prune', resolve: 'merge', faults: seed % 2 === 0 });
      c.run();
      const snap = c.snapshot();
      const { before } = causality(snap);
      const versions = replicaStates(snap).flatMap(([, st]) => st.versions);
      const dominates = (x: VV, y: VV) => Object.entries(y).every(([k, n]) => (x[k] ?? 0) >= n);
      for (const u of versions) {
        for (const v of versions) {
          if (u.id === v.id) continue;
          pairs++;
          expect(dominates(v.vv, u.vv), `${u.id} below ${v.id} (seed ${seed})`).toBe(before(u.id, v.id));
        }
      }
    }
    expect(pairs).toBeGreaterThan(100);
  });

  it('same seed, same trace', () => {
    expect(runRegister({ seed: 5, mode: 'siblings', resolve: 'merge', faults: true }).trace).toEqual(runRegister({ seed: 5, mode: 'siblings', resolve: 'merge', faults: true }).trace);
  });
});

describe('liveness, tested apart from safety', () => {
  it('with no loss and no crash every replica ends on the resolution in siblings mode (on 200 seeds), and on one common version in last-write-wins mode', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const how of ['merge', 'pick-a', 'pick-b'] as const) {
        const c = registerCluster({ seed, mode: 'siblings', resolve: how });
        c.run();
        for (const [, st] of replicaStates(c.snapshot())) expect(st.versions.map((v) => v.id), `seed ${seed} ${how}`).toEqual(['m']);
      }
      const lww = registerCluster({ seed, mode: 'lww', resolve: 'merge' });
      lww.run();
      const winners = new Set(replicaStates(lww.snapshot()).map(([, st]) => st.versions[0].id));
      expect(winners.size).toBe(1);
    }
  });
});

describe('the vector grows with the writers', () => {
  it('the widest vector has one entry per replica that coordinated a write: 3 when the resolver is a third replica, 2 when it is one of the writers', () => {
    expect(runRegister({ ...hand, mode: 'siblings', resolve: 'merge' }).widest).toBe(3);
    expect(runRegister({ ...hand, places: { a: 'r1', b: 'r2', resolver: 'r1' }, mode: 'siblings', resolve: 'merge' }).widest).toBe(2);
    for (let seed = 0; seed < 50; seed++) {
      const p = placesFor(seed);
      expect(runRegister({ seed, mode: 'siblings', resolve: 'merge' }).widest).toBe(new Set([p.a, p.b, p.resolver]).size);
    }
  });
});
