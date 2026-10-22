import { describe, expect, it } from 'vitest';
import { createCluster, forSeeds, type Safety } from './distSim';
import { explore } from './explore';
import { asDistNodes, networkExplorer, type PureProtocol } from './pureProtocol';
import { atMostOneChosen, chosenValues, majority, paxosProtocol, SPIKE_CONFIG, type PaxosConfig, type PaxosState } from './fixtures/paxosProtocol';

/* ---------- a lock server: the planted-violation system both harnesses must agree on ---------- */

type LockMsg = { type: 'request' } | { type: 'grant' };
type LockState = { holder: string | null; held: boolean; asked: boolean };

/** The broken server grants every request; the fixed one grants only to the current holder or when free. */
const lockProtocol = (broken: boolean): PureProtocol<LockState, LockMsg> => ({
  nodes: ['server', 'c1', 'c2'],
  init: () => ({ holder: null, held: false, asked: false }),
  onTimeout: (id, s) => (id === 'server' || s.asked ? null : { state: { ...s, asked: true }, send: [{ to: 'server', payload: { type: 'request' } }] }),
  onMessage: (id, s, { from, payload }) => {
    if (id === 'server' && payload.type === 'request') {
      if (broken || s.holder === null || s.holder === from) return { state: { ...s, holder: s.holder ?? from }, send: [{ to: from, payload: { type: 'grant' } }] };
      return { state: s, send: [] };
    }
    return payload.type === 'grant' ? { state: { ...s, held: true }, send: [] } : { state: s, send: [] };
  },
});

const twoHolders = (states: Record<string, LockState>) => (states.c1.held && states.c2.held ? 'both clients hold the lock' : null);

const exploreLock = (broken: boolean) => {
  const net = networkExplorer(lockProtocol(broken));
  return explore({ ...net, invariant: (s) => twoHolders(net.nodeStates(s)) });
};

const seedsLock = (broken: boolean, seeds: number) => {
  const safety: Safety<LockState>[] = [(snap) => twoHolders(Object.fromEntries(Object.entries(snap.nodes).map(([id, n]) => [id, n.state!])))];
  return forSeeds(
    seeds,
    (seed) => {
      const c = createCluster<LockMsg, LockState>({ seed, nodes: asDistNodes(lockProtocol(broken)), latency: { min: 1, max: 15 }, loss: 0.1, duplicate: 0.15 });
      c.randomFaults({ horizonMs: 60, partitions: 1 });
      return c;
    },
    safety,
  );
};

describe('one protocol, two harnesses: they agree', () => {
  it('both find the planted violation in the broken copy', () => {
    const exhaustive = exploreLock(true);
    expect(exhaustive.violation?.message).toBe('both clients hold the lock');
    // each client: spontaneous request, delivery of the request, delivery of the grant = 3 steps, twice
    expect(exhaustive.violation?.path).toHaveLength(6);
    const seeded = seedsLock(true, 500);
    expect(seeded.ok).toBe(false);
    if (!seeded.ok) expect(seeded.message).toBe('both clients hold the lock');
  });

  it('both pass the fixed copy: exhaustively, and over 500 faulted seeds', () => {
    const exhaustive = exploreLock(false);
    expect(exhaustive.violation).toBeNull();
    expect(exhaustive.truncated).toBe(false);
    expect(seedsLock(false, 500)).toEqual({ ok: true, seeds: 500 });
  });

  it('the explorer path labels carry the acting node', () => {
    const path = exploreLock(true).violation!.path;
    expect(new Set(path.map((p) => p.label.actor))).toEqual(new Set(['server', 'c1', 'c2']));
    expect(path[0].label.kind).toBe('timeout');
  });
});

/* ---------- network models ---------- */

type Count = { type: 'n' };
const sender: PureProtocol<{ got: number }, Count> = {
  nodes: ['a', 'b'],
  init: () => ({ got: 0 }),
  onTimeout: (id, s) => (id === 'a' && s.got === 0 ? { state: { got: -1 }, send: [{ to: 'b', payload: { type: 'n' } }, { to: 'b', payload: { type: 'n' } }] } : null),
  onMessage: (id, s) => (id === 'b' ? { state: { got: s.got + 1 }, send: [] } : { state: s, send: [] }),
};

describe('networkExplorer', () => {
  const reachable = (opts: Parameters<typeof networkExplorer<{ got: number }, Count>>[1]) => {
    const net = networkExplorer(sender, opts);
    const counts = new Set<number>();
    explore({ ...net, maxStates: 50, onVisit: (v) => counts.add(net.nodeState(v.state, 'b').got) });
    return [...counts].sort((x, y) => x - y);
  };

  it('set network: a sent message can be delivered any number of times (duplication), so b can count past the sends', () => {
    // identical payloads are one message in a set, and its deliveries are unbounded: bounded here by maxStates
    const net = networkExplorer(sender);
    const first = net.actions(net.init);
    expect(first).toHaveLength(1);
    expect(first[0].label.kind).toBe('timeout');
    const afterSend = first[0].next;
    expect(afterSend.net).toHaveLength(1);
    const delivered = net.actions(afterSend);
    expect(delivered.map((t) => net.nodeState(t.next, 'b').got)).toEqual([1]);
    // delivering again is a further step from the new state: the message was not consumed
    expect(net.actions(delivered[0].next).map((t) => net.nodeState(t.next, 'b').got)).toEqual([2]);
  });

  it('multiset network: each send is delivered at most once, so b ends at 0, 1 or 2', () => {
    expect(reachable({ network: 'multiset' })).toEqual([0, 1, 2]);
  });

  it('a message to a crashed node stays undelivered, and crashes are limited by maxCrashed', () => {
    const net = networkExplorer(sender, { network: 'multiset', maxCrashed: 1 });
    let states = 0;
    const crashes = new Set<string>();
    explore({ ...net, onVisit: (v) => { states++; v.state.crashed.forEach((c) => crashes.add(c)); } });
    expect(crashes).toEqual(new Set(['a', 'b']));
    const none = networkExplorer(sender, { network: 'multiset' });
    expect(none.actions(none.init).some((t) => t.label.kind === 'crash')).toBe(false);
    expect(states).toBeGreaterThan(explore({ ...none }).states);
  });

  it('client inputs are on the wire from the start', () => {
    const net = networkExplorer(sender, { network: 'multiset', clientInputs: [{ to: 'b', payload: { type: 'n' } }] });
    expect(net.init.net.map((m) => m.from)).toEqual(['client']);
    expect(net.actions(net.init).map((t) => t.label.kind)).toContain('deliver');
  });

  it('fifo needs the multiset network', () => {
    expect(() => networkExplorer(sender, { fifo: true })).toThrow(RangeError);
  });
});

describe('networkExplorer: per-channel FIFO', () => {
  type Num = { n: number };
  /** a sends 1, 2, 3 to b in one spontaneous step; b records the order it receives them. */
  const ordered: PureProtocol<{ sent: boolean; seen: number[] }, Num> = {
    nodes: ['a', 'b'],
    init: () => ({ sent: false, seen: [] }),
    onTimeout: (id, s) => (id === 'a' && !s.sent ? { state: { ...s, sent: true }, send: [1, 2, 3].map((n) => ({ to: 'b', payload: { n } })) } : null),
    onMessage: (id, s, { payload }) => (id === 'b' ? { state: { ...s, seen: [...s.seen, payload.n] }, send: [] } : { state: s, send: [] }),
  };
  const orders = (fifo: boolean) => {
    const net = networkExplorer(ordered, { network: 'multiset', fifo });
    const seen = new Set<string>();
    explore({ ...net, onVisit: (v) => seen.add(net.nodeState(v.state, 'b').seen.join('')) });
    return seen;
  };

  it('with FIFO b only ever sees a prefix of 1, 2, 3 in order; without it every order appears', () => {
    expect([...orders(true)].sort()).toEqual(['', '1', '12', '123']);
    expect(orders(false).has('321')).toBe(true);
    expect(orders(false).size).toBe(1 + 3 + 6 + 6);
  });
});

/* ---------- Paxos: the gate ---------- */

/** Oracle for "chosen": brute force over all subsets of acceptors, straight from the definition. */
const chosenBySubsets = (config: PaxosConfig, states: Record<string, PaxosState>): string[] => {
  const acceptors = config.acceptors;
  const chosen = new Set<string>();
  for (let mask = 1; mask < 1 << acceptors.length; mask++) {
    const group = acceptors.filter((_, i) => mask & (1 << i));
    if (group.length < majority(acceptors.length)) continue;
    const votesOf = (a: string) => { const s = states[a]; return s.kind === 'acceptor' ? s.votes : []; };
    for (const [b, v] of votesOf(group[0])) if (group.every((a) => votesOf(a).some(([b2, v2]) => b2 === b && v2 === v))) chosen.add(v);
  }
  return [...chosen].sort();
};

const exploreAbsolute = (config: PaxosConfig, maxStates?: number) => {
  const net = networkExplorer(paxosProtocol(config));
  const safe = atMostOneChosen(config);
  const t0 = performance.now();
  const result = explore({ ...net, invariant: (s) => safe(net.nodeStates(s)), maxStates });
  return { net, result, ms: performance.now() - t0 };
};

describe('Paxos over the set network (the K4-2 spike gate)', () => {
  it('3 acceptors, 2 proposers, ballots 1 and 2: exhaustive, safe, within 250,000 states and 5 s', () => {
    const { result, ms } = exploreAbsolute(SPIKE_CONFIG);
    expect(result.violation).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.states).toBeLessThanOrEqual(250_000);
    expect(ms).toBeLessThan(5000);
    // the measured count recorded in docs/shared-api.md (pinned: a change here changes the lesson's on-screen number)
    expect(result.states).toBe(2905);
  });

  it('the fixture\'s chosen() agrees with the subset oracle on every reachable state, and a value does get chosen', () => {
    const net = networkExplorer(paxosProtocol(SPIKE_CONFIG));
    const seen = new Set<string>();
    explore({
      ...net,
      onVisit: (v) => {
        const states = net.nodeStates(v.state);
        const chosen = chosenValues(SPIKE_CONFIG, states);
        expect(chosen).toEqual(chosenBySubsets(SPIKE_CONFIG, states));
        chosen.forEach((c) => seen.add(c));
      },
    });
    expect(seen).toEqual(new Set(['v1', 'v2']));
  });

  it('the shortest path to any chosen value is 7 steps', () => {
    // Hand count: p1 starts (1), two acceptors receive Prepare (2), p1 receives two promises (2), two acceptors receive Accept (2) = 7.
    // (The part-2 prototype counted 8 because it also delivered an Accepted announcement, which this fixture does not send.)
    const net = networkExplorer(paxosProtocol(SPIKE_CONFIG));
    const r = explore({ ...net, invariant: (s) => (chosenValues(SPIKE_CONFIG, net.nodeStates(s)).length > 0 ? 'chosen' : null) });
    expect(r.violation?.path).toHaveLength(7);
  });

  it.each([
    ['accepts below its promise', { ...SPIKE_CONFIG, acceptBelowPromise: true }],
    ['ignores promised values', { ...SPIKE_CONFIG, ignorePromised: true }],
  ])('the broken copy (%s) is caught by the explorer with a shortest path', (_name, config: PaxosConfig) => {
    const { result } = exploreAbsolute(config);
    expect(result.violation?.message).toBe('two values chosen: v1, v2');
    expect(result.violation!.path.length).toBeGreaterThan(7);
    expect(result.violation!.path.length).toBeLessThanOrEqual(20);
  });

  it('under distSim seeds: the fixed protocol holds over 300 faulted seeds and the planted bugs are caught', () => {
    const runSeeds = (config: PaxosConfig, seeds: number) => {
      const safe = atMostOneChosen(config);
      const safety: Safety<PaxosState>[] = [(snap) => safe(Object.fromEntries(Object.entries(snap.nodes).map(([id, n]) => [id, n.state!])))];
      return forSeeds(
        seeds,
        (seed) => {
          const c = createCluster<unknown, PaxosState>({
            seed,
            nodes: asDistNodes(paxosProtocol(config)) as never,
            latency: { min: 1, max: 40 },
            loss: 0.1,
            duplicate: 0.15,
          });
          c.randomFaults({ horizonMs: 100, partitions: 1 });
          return c;
        },
        safety,
      );
    };
    expect(runSeeds(SPIKE_CONFIG, 300)).toEqual({ ok: true, seeds: 300 });
    expect(runSeeds({ ...SPIKE_CONFIG, ignorePromised: true }, 300).ok).toBe(false);
    expect(runSeeds({ ...SPIKE_CONFIG, acceptBelowPromise: true }, 300).ok).toBe(false);
  });
});
