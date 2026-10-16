import { describe, expect, it } from 'vitest';
import { BROKEN_SEED, COUNTEREXAMPLE, SEEDED_SEQUENCES, SEQUENCE_LENGTH, firstStaleRead, lowestStaleSeed, randomOps, runOps } from './counterexample';
import {
  CORES, MESI_STATES, allOps, freshMachine, invariantViolations, localTransition, snoopTransition, step,
  type BusOp, type Machine, type MesiState, type Op,
} from './mesi';

const w = (core: number): Op => ({ core, access: 'write' });
const r = (core: number): Op => ({ core, access: 'read' });
const states = (m: Machine) => m.caches.map((c) => c.state).join('');

describe('every (state, event) pair against an independent table', () => {
  // Hand-typed from the textbook protocol: [state, access, others hold] -> [next, bus]
  const local: [MesiState, 'read' | 'write', boolean, MesiState, BusOp | null][] = [
    ['M', 'read', false, 'M', null], ['E', 'read', false, 'E', null], ['S', 'read', true, 'S', null],
    ['M', 'read', true, 'M', null], ['E', 'read', true, 'E', null], ['S', 'read', false, 'S', null],
    ['I', 'read', false, 'E', 'BusRd'], ['I', 'read', true, 'S', 'BusRd'],
    ['M', 'write', false, 'M', null], ['E', 'write', false, 'M', null], ['S', 'write', true, 'M', 'BusUpgr'],
    ['I', 'write', false, 'M', 'BusRdX'], ['I', 'write', true, 'M', 'BusRdX'],
    ['M', 'write', true, 'M', null], ['E', 'write', true, 'M', null], ['S', 'write', false, 'M', 'BusUpgr'],
  ];
  it('own accesses', () => {
    for (const [state, access, others, next, bus] of local) expect(localTransition(state, access, others), `${state} ${access}`).toEqual({ next, bus });
    expect(local.length).toBe(MESI_STATES.length * 2 * 2);
  });

  const snoop: Record<BusOp, Record<MesiState, [MesiState, boolean]>> = {
    BusRd: { M: ['S', true], E: ['S', false], S: ['S', false], I: ['I', false] },
    BusRdX: { M: ['I', true], E: ['I', false], S: ['I', false], I: ['I', false] },
    BusUpgr: { M: ['I', true], E: ['I', false], S: ['I', false], I: ['I', false] },
  };
  it('snooped transactions', () => {
    for (const bus of ['BusRd', 'BusRdX', 'BusUpgr'] as const) {
      for (const s of MESI_STATES) {
        const [next, writesBack] = snoop[bus][s];
        expect(snoopTransition(s, bus), `${bus} on ${s}`).toEqual({ next, writesBack });
      }
    }
  });
});

describe('hand-worked transitions', () => {
  it('a read on I with no sharers gives E; a second core\'s read gives S and S', () => {
    const a = step(freshMachine(), r(0));
    expect([states(a.machine), a.bus, a.source]).toEqual(['EIII', 'BusRd', 'memory']);
    const b = step(a.machine, r(1));
    expect([states(b.machine), b.bus, b.source]).toEqual(['SSII', 'BusRd', 'cache']);
  });

  it('a write on S gives M and I; a write on E is silent; a read of an M line writes back', () => {
    const shared = step(step(freshMachine(), r(0)).machine, r(1)).machine;
    const upgrade = step(shared, w(0));
    expect([states(upgrade.machine), upgrade.bus]).toEqual(['MIII', 'BusUpgr']);
    const exclusive = step(freshMachine(), r(2)).machine;
    const silent = step(exclusive, w(2));
    expect([silent.bus, silent.machine.busCount - exclusive.busCount, states(silent.machine)]).toEqual([null, 0, 'IIMI']);
    const modified = step(freshMachine(), w(0)).machine;
    expect(modified.memory).toBe(0);
    const readIt = step(modified, r(3));
    expect(readIt.machine.memory).toBe(1);
    expect(readIt.reactions).toEqual([{ core: 0, from: 'M', to: 'S', supplied: true, wroteBack: true }]);
    expect(states(readIt.machine)).toBe('SIIS');
    expect(readIt.readValue).toBe(1);
  });

  it('a write miss fetches the line and invalidates every other copy, and an M holder writes back first', () => {
    const m = step(step(freshMachine(), w(0)).machine, w(1));
    expect([states(m.machine), m.bus, m.machine.memory]).toEqual(['IMII', 'BusRdX', 1]);
    expect(m.machine.caches[1].value).toBe(2);
    expect(m.reactions[0]).toMatchObject({ core: 0, from: 'M', to: 'I', wroteBack: true });
  });

  it('memory is stale while a line is M and every write stores latest + 1', () => {
    let m = freshMachine();
    for (let i = 1; i <= 5; i++) {
      const out = step(m, w(i % CORES));
      expect(out.written).toBe(i);
      m = out.machine;
    }
    expect(m.latest).toBe(5);
    expect(m.memory).toBeLessThan(m.latest);
  });
});

describe('the invariants, exhaustively over every access sequence of up to 6 operations on 4 cores', () => {
  it('hold after every step, and every read returns the latest write', () => {
    const ops = allOps();
    expect(ops).toHaveLength(8);
    let sequences = 0;
    let steps = 0;
    const walk = (m: Machine, depth: number) => {
      for (const op of ops) {
        const out = step(m, op, 'mesi');
        steps++;
        const bad = invariantViolations(out.machine);
        if (bad.length || out.stale) throw new Error(`violated at depth ${depth}: ${bad.join('; ')} stale=${out.stale}`);
        if (depth === 6) sequences++;
        else walk(out.machine, depth + 1);
      }
    };
    walk(freshMachine(), 1);
    expect(sequences).toBe(8 ** 6);
    expect(steps).toBe([1, 2, 3, 4, 5, 6].reduce((s, d) => s + 8 ** d, 0));
  });

  it('hold over 300 seeded access sequences of 40 operations', () => {
    expect(SEEDED_SEQUENCES).toBeGreaterThanOrEqual(200);
    for (let seed = 1; seed <= SEEDED_SEQUENCES; seed++) {
      let machine = freshMachine();
      for (const op of randomOps(seed, SEQUENCE_LENGTH)) {
        const out = step(machine, op);
        machine = out.machine;
        expect(invariantViolations(machine), `seed ${seed}`).toEqual([]);
        expect(out.stale, `seed ${seed}`).toBe(false);
      }
    }
  });
});

describe('the broken protocol (invalidation off)', () => {
  it('makes a read return an old value; the shortest violating sequence has 3 operations, found by trying every shorter one', () => {
    expect(COUNTEREXAMPLE).toHaveLength(3);
    // independent confirmation by hand: read on core 0 (E, value 0), write on core 1 (core 0 keeps its copy), read on core 0 returns 0, not 1
    const hand: Op[] = [r(0), w(1), r(0)];
    const stale = firstStaleRead(hand, 'no-invalidate');
    expect(stale?.index).toBe(2);
    expect(stale?.result.readValue).toBe(0);
    expect(stale?.result.machine.latest).toBe(1);
    // no shorter sequence is stale
    for (const ops of allOps().flatMap((a) => allOps().map((b) => [a, b]))) expect(firstStaleRead(ops, 'no-invalidate')).toBeNull();
  });

  it('the spec\'s four-operation example (write 0, read 1, write 0, read 1) is stale too, for the stated reason: core 1 kept a Shared copy', () => {
    const ops: Op[] = [w(0), r(1), w(0), r(1)];
    const out = firstStaleRead(ops, 'no-invalidate');
    expect(out?.index).toBe(3);
    const results = runOps(ops, 'no-invalidate');
    expect(results[2].reactions).toEqual([{ core: 1, from: 'S', to: 'S', supplied: false, wroteBack: false }]);
    expect(results[3].from).toBe('S');
    expect(results[3].readValue).toBe(1);
    expect(results[3].machine.latest).toBe(2);
  });

  it('counterfactual: the same sequences under real MESI are never stale, and the other copy is invalidated', () => {
    for (const ops of [COUNTEREXAMPLE, [w(0), r(1), w(0), r(1)]]) {
      expect(firstStaleRead(ops, 'mesi')).toBeNull();
    }
    const results = runOps([w(0), r(1), w(0), r(1)], 'mesi');
    expect(results[2].reactions[0]).toMatchObject({ core: 1, from: 'S', to: 'I' });
    expect(results[3].bus).toBe('BusRd');
    expect(results[3].readValue).toBe(2);
  });

  it('on the pinned seed the broken protocol returns a stale read because a copy survived a write, and real MESI does not', () => {
    expect(lowestStaleSeed('no-invalidate')).toBe(BROKEN_SEED);
    const ops = randomOps(BROKEN_SEED, SEQUENCE_LENGTH);
    const bad = firstStaleRead(ops, 'no-invalidate')!;
    expect(bad.result.from).not.toBe('I');
    // the stale copy was valid when read, and some other core wrote after it was filled
    const results = runOps(ops, 'no-invalidate');
    const core = bad.result.op.core;
    const filled = results.map((x, i) => ({ x, i })).filter(({ x, i }) => i < bad.index && x.op.core === core && x.to !== 'I').pop()!;
    expect(results.slice(filled.i + 1, bad.index).some((x) => x.op.core !== core && x.op.access === 'write')).toBe(true);
    expect(firstStaleRead(ops, 'mesi')).toBeNull();
    // and the broken protocol fails on most seeded sequences, so the failing seed is not a fluke
    let failing = 0;
    for (let seed = 1; seed <= SEEDED_SEQUENCES; seed++) if (firstStaleRead(randomOps(seed, SEQUENCE_LENGTH), 'no-invalidate')) failing++;
    expect(failing).toBeGreaterThan(SEEDED_SEQUENCES / 2);
  });
});
