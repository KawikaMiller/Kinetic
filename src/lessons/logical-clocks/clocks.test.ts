import { describe, expect, it } from 'vitest';
import { createCluster, type DistNode, type TraceRow } from '../../core/distSim';
import { buildLaneModel } from '../../core/laneEditor';
import { mulberry32, type Rnd } from '../../core/random';
import {
  executionOf, happenedBefore, lamportBetween, misleadingPairs, stampExecution, truthBetween, vectorBetween, type Execution, type Relation,
} from './clocks';

const RANDOM_EXECUTIONS = 300;

/** A random execution: up to 14 events on 3 lanes with forward messages between lanes. */
function randomExecution(rnd: Rnd): Execution {
  const n = 2 + Math.floor(rnd() * 13);
  const lanes = 3;
  const events = Array.from({ length: n }, (_, order) => ({ id: `e${order}`, lane: Math.floor(rnd() * lanes), order }));
  const messages: { from: string; to: string }[] = [];
  const attempts = Math.floor(rnd() * 2 * n);
  for (let k = 0; k < attempts; k++) {
    const i = Math.floor(rnd() * n);
    const j = Math.floor(rnd() * n);
    if (i < j && events[i].lane !== events[j].lane && !messages.some((m) => m.from === events[i].id && m.to === events[j].id)) messages.push({ from: events[i].id, to: events[j].id });
  }
  return { lanes, events, messages };
}

const executions = (() => {
  const rnd = mulberry32(1978);
  return Array.from({ length: RANDOM_EXECUTIONS }, () => randomExecution(rnd));
})();

/** The execution a distSim run left behind: every send and every delivery is an event, in trace order. */
export function executionFromTrace(trace: readonly TraceRow<unknown>[], nodes: readonly string[]): Execution {
  const rows = trace.filter((r) => r.kind === 'send' || r.kind === 'deliver');
  const events = rows.map((r, order) => ({ id: `r${r.id}`, lane: nodes.indexOf(r.kind === 'send' ? r.from! : r.to!), order }));
  const sendOf = new Map<number, string>();
  rows.forEach((r) => {
    if (r.kind === 'send') sendOf.set(r.msgId!, `r${r.id}`);
  });
  const messages = rows.flatMap((r) => (r.kind === 'deliver' && sendOf.has(r.msgId!) ? [{ from: sendOf.get(r.msgId!)!, to: `r${r.id}` }] : []));
  return { lanes: nodes.length, events, messages };
}

function gossipTrace(seed: number) {
  const ids = ['n1', 'n2', 'n3', 'n4'];
  const rnd = mulberry32(seed);
  const node = (): DistNode<string> => {
    let rounds = 0;
    return {
      init: (ctx) => ctx.setTimer('tick', 1 + Math.floor(rnd() * 10)),
      onTimer: (ctx) => {
        const others = ctx.peers.filter((p) => p !== ctx.id);
        ctx.send(others[Math.floor(rnd() * others.length)], 'gossip');
        if (++rounds < 4) ctx.setTimer('tick', 1 + Math.floor(rnd() * 10));
      },
      onMessage: (ctx) => {
        if (rnd() < 0.5) {
          const others = ctx.peers.filter((p) => p !== ctx.id);
          ctx.send(others[Math.floor(rnd() * others.length)], 'gossip');
        }
      },
    };
  };
  const c = createCluster<string>({ seed, nodes: Object.fromEntries(ids.map((id) => [id, node()])), latency: { min: 1, max: 12 }, loss: 0.1, duplicate: 0.15 });
  c.run({ maxEvents: 5000 });
  return executionFromTrace(c.trace, ids);
}

const relationFromLamport = (a: { lamport: number; lane: number }, b: { lamport: number; lane: number }): Relation => lamportBetween(a, b);

describe('hand-worked executions', () => {
  it('P1 sends to P2, P2 sends on to P3: Lamport 1, 2, 3 and vectors [1,0,0], [1,1,0], [1,1,1]', () => {
    const model = buildLaneModel<undefined>(
      { lanes: 3, slots: 8 },
      [{ lane: 0, slot: 1, data: undefined }, { lane: 1, slot: 3, data: undefined }, { lane: 1, slot: 4, data: undefined }, { lane: 2, slot: 6, data: undefined }],
      [[0, 1], [2, 3]],
    );
    const s = stampExecution(executionOf(model));
    expect(s.map((e) => e.lamport)).toEqual([1, 2, 3, 4]);
    expect(s.map((e) => e.vector)).toEqual([[1, 0, 0], [1, 1, 0], [1, 2, 0], [1, 2, 1]]);
    expect(s.map((e) => e.kind)).toEqual(['send', 'receive', 'send', 'receive']);
  });

  it('a receive takes max(own, message) + 1: P2 is at 5 when a message stamped 2 arrives, so it reads 6; and for the other way round it reads 4', () => {
    const exec: Execution = {
      lanes: 2,
      events: [
        { id: 'a', lane: 0, order: 0 }, { id: 'b', lane: 0, order: 1 }, // P1 reaches 2
        { id: 'p', lane: 1, order: 2 }, { id: 'q', lane: 1, order: 3 }, { id: 'r', lane: 1, order: 4 }, { id: 's', lane: 1, order: 5 }, { id: 't', lane: 1, order: 6 }, // P2 reaches 5
        { id: 'u', lane: 1, order: 7 },
      ],
      messages: [{ from: 'b', to: 'u' }],
    };
    const s = stampExecution(exec);
    expect(s[1].lamport).toBe(2);
    expect(s[6].lamport).toBe(5);
    expect(s[7].lamport).toBe(6);
    expect(s[7].vector).toEqual([2, 6]);
    expect(s[7].incoming).toHaveLength(1);
  });

  it('two concurrent writes get the same Lamport stamp and incomparable vectors', () => {
    const model = buildLaneModel<undefined>(
      { lanes: 3, slots: 8 },
      [{ lane: 0, slot: 1, data: undefined }, { lane: 1, slot: 1, data: undefined }, { lane: 2, slot: 4, data: undefined }, { lane: 2, slot: 6, data: undefined }],
      [[0, 2], [1, 3]],
    );
    const exec = executionOf(model);
    const s = stampExecution(exec);
    const hb = happenedBefore(exec);
    expect(s[0].lamport).toBe(s[1].lamport);
    expect(truthBetween(hb, 0, 1)).toBe('concurrent');
    expect(vectorBetween(s[0].vector, s[1].vector)).toBe('concurrent');
  });
});

describe('the clock conditions on seeded executions', () => {
  it(`vector comparison equals happened-before on every pair of ${RANDOM_EXECUTIONS} random executions (all pairs, all three outcomes occur)`, () => {
    const seen = new Set<Relation>();
    for (const exec of executions) {
      const stamps = stampExecution(exec);
      const hb = happenedBefore(exec);
      for (let i = 0; i < stamps.length; i++) {
        for (let j = 0; j < stamps.length; j++) {
          if (i === j) continue;
          const truth = truthBetween(hb, i, j);
          seen.add(truth);
          expect(vectorBetween(stamps[i].vector, stamps[j].vector), JSON.stringify(exec)).toBe(truth);
        }
      }
    }
    expect([...seen].sort()).toEqual(['after', 'before', 'concurrent']);
  });

  it('the Lamport clock condition holds on every pair: a happened before b implies L(a) < L(b)', () => {
    for (const exec of executions) {
      const stamps = stampExecution(exec);
      const hb = happenedBefore(exec);
      for (let i = 0; i < stamps.length; i++) for (let j = 0; j < stamps.length; j++) if (hb[i][j]) expect(stamps[i].lamport).toBeLessThan(stamps[j].lamport);
    }
  });

  it('the converse fails: some execution has L(a) < L(b) with a and b concurrent (and the Lamport order calls them ordered)', () => {
    const withMisleading = executions.filter((e) => misleadingPairs(stampExecution(e), happenedBefore(e)).length > 0);
    expect(withMisleading.length).toBeGreaterThan(50);
    const exec = withMisleading[0];
    const stamps = stampExecution(exec);
    const hb = happenedBefore(exec);
    const { a, b } = misleadingPairs(stamps, hb)[0];
    expect(truthBetween(hb, a, b)).toBe('concurrent');
    expect(relationFromLamport(stamps[a], stamps[b])).toBe('before');
  });

  it('a broken vector clock that forgets the componentwise max on receive fails the vector-equals-truth test', () => {
    let wrong = 0;
    for (const exec of executions) {
      const stamps = stampExecution(exec, { forgetMax: true });
      const hb = happenedBefore(exec);
      for (let i = 0; i < stamps.length; i++) for (let j = 0; j < stamps.length; j++) if (i !== j && vectorBetween(stamps[i].vector, stamps[j].vector) !== truthBetween(hb, i, j)) wrong++;
    }
    expect(wrong).toBeGreaterThan(100);
  });

  it('the same two conditions hold on executions made by distSim traces with loss and duplication (50 seeds)', () => {
    let pairs = 0;
    for (let seed = 0; seed < 50; seed++) {
      const exec = gossipTrace(seed);
      const stamps = stampExecution(exec);
      const hb = happenedBefore(exec);
      for (let i = 0; i < stamps.length; i++) {
        for (let j = 0; j < stamps.length; j++) {
          if (i === j) continue;
          pairs++;
          expect(vectorBetween(stamps[i].vector, stamps[j].vector)).toBe(truthBetween(hb, i, j));
          if (hb[i][j]) expect(stamps[i].lamport).toBeLessThan(stamps[j].lamport);
        }
      }
    }
    expect(pairs).toBeGreaterThan(10_000);
  });

  it('happened-before is a strict partial order: irreflexive, transitive, and never both ways', () => {
    for (const exec of executions.slice(0, 100)) {
      const hb = happenedBefore(exec);
      const n = hb.length;
      for (let i = 0; i < n; i++) {
        expect(hb[i][i]).toBe(false);
        for (let j = 0; j < n; j++) {
          if (hb[i][j]) expect(hb[j][i]).toBe(false);
          for (let k = 0; k < n; k++) if (hb[i][j] && hb[j][k]) expect(hb[i][k]).toBe(true);
        }
      }
    }
  });
});
