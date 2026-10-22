import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { SEED_MAX } from '../../core/seed';
import { TICK_MS } from './check';
import { LiveRaft } from './live';
import { motionView } from './view';
import { SafetyMonitor } from './safety';
import { MAJORITY, N, Raft, TIMEOUT_MAX, type Entry, type RaftVariant } from './sim';

const entry = (id: number, term: number): Entry => ({ id, term, cmd: `c${id}` });
const fresh = (variant: RaftVariant = 'raft') => new Raft({ rnd: mulberry32(1), variant });
const leaderNames = (live: LiveRaft) => live.raft.events.filter((e) => e.kind === 'leader').map((e) => e.text);

describe('the model is seeded', () => {
  it('replays the same run for the same seed, with no global randomness involved', () => {
    const texts = (seed: number) => {
      const live = new LiveRaft(seed, 'raft');
      live.advance(40_000);
      return live.raft.events.map((e) => `${e.t} ${e.text}`);
    };
    expect(texts(7)).toEqual(texts(7));
    expect(texts(7)).not.toEqual(texts(8));
  });

  it('does not depend on how the run is sliced into frames', () => {
    const whole = new LiveRaft(7, 'raft');
    whole.advance(30_000);
    const sliced = new LiveRaft(7, 'raft');
    for (let t = 0; t < 30_000; t += 7) sliced.advance(7);
    sliced.advance(30_000 % 7);
    expect(sliced.raft.events.map((e) => e.text)).toEqual(whole.raft.events.map((e) => e.text));
  });

  it('survives the ends of the seed range, a zero advance and a huge one', () => {
    for (const seed of [0, SEED_MAX]) {
      const live = new LiveRaft(seed, 'raft');
      live.advance(0);
      live.advance(60_000);
      expect(live.raft.leader, `seed ${seed} elects a leader within 60 s`).not.toBeNull();
      expect(live.monitor.violation).toBeNull();
    }
  });

  it('copes with a wire that drops every message and a partition that cuts off every server', () => {
    const dead = new Raft({ rnd: mulberry32(3), loss: 1 });
    for (let t = 0; t < 30_000; t += TICK_MS) dead.step(TICK_MS);
    expect(dead.leader).toBeNull();
    const cut = fresh();
    cut.setPartition(true, [0, 1, 2, 3, 4]);
    for (let t = 0; t < 30_000; t += TICK_MS) cut.step(TICK_MS);
    expect(cut.nodes.every((n) => n.commit === 0)).toBe(true);
  });
});

describe('the commit rule: a leader counts replicas only for entries of its own term', () => {
  // A hand-built version of the case the Raft paper uses to motivate the rule: the new leader (term 4)
  // holds an entry from term 2 that three of five servers already store.
  const leaderWithOldEntry = () => {
    const raft = fresh();
    const leader = raft.nodes[0];
    leader.role = 'leader';
    leader.term = 4;
    leader.log = [entry(1, 1), entry(2, 2)];
    leader.matchIndex = [2, 2, 2, 0, 0];
    return { raft, leader };
  };

  it('does not commit an older-term entry by counting, even on 3 of 5', () => {
    const { raft, leader } = leaderWithOldEntry();
    raft.advanceCommit(leader);
    expect(leader.commit).toBe(0);
  });

  it('commits the older entries once a newer entry of its own term reaches a majority', () => {
    const { raft, leader } = leaderWithOldEntry();
    leader.log.push(entry(3, 4));
    leader.matchIndex = [3, 3, 3, 0, 0];
    raft.advanceCommit(leader);
    expect(leader.commit).toBe(3);
  });

  it('commits nothing for a current-term entry that is on only a minority', () => {
    const { raft, leader } = leaderWithOldEntry();
    leader.log.push(entry(3, 4));
    leader.matchIndex = [3, 3, 0, 0, 0];
    raft.advanceCommit(leader);
    expect(leader.commit).toBe(0);
  });
});

describe('the safety monitor catches each property on a hand-built cluster', () => {
  const holders = (raft: Raft, who: number[], log: Entry[], commit = 0) => {
    for (const i of who) {
      raft.nodes[i].log = log.slice();
      raft.nodes[i].commit = commit;
    }
  };

  it('accepts a healthy cluster', () => {
    const raft = fresh();
    holders(raft, [0, 1, 2], [entry(1, 1)], 1);
    expect(new SafetyMonitor().observe(raft)).toBeNull();
  });

  it('one-leader-per-term: two servers both lead term 2', () => {
    const raft = fresh();
    const monitor = new SafetyMonitor();
    raft.nodes[0].role = 'leader';
    raft.nodes[0].term = 2;
    expect(monitor.observe(raft)).toBeNull();
    raft.nodes[3].role = 'leader';
    raft.nodes[3].term = 2;
    expect(monitor.observe(raft)?.rule).toBe('one-leader-per-term');
  });

  it('log-matching: the same term at index 2 but different entries at index 1', () => {
    const raft = fresh();
    raft.nodes[0].log = [entry(1, 1), entry(2, 2)];
    raft.nodes[1].log = [entry(9, 1), entry(3, 2)];
    expect(new SafetyMonitor().observe(raft)?.rule).toBe('log-matching');
  });

  it('state-machine-safety: two servers commit different entries at index 1', () => {
    const raft = fresh();
    holders(raft, [0, 2, 3], [entry(1, 1)], 1);
    holders(raft, [1], [entry(2, 1)], 1);
    expect(new SafetyMonitor().observe(raft)?.rule).toBe('state-machine-safety');
  });

  it('leader-completeness: a term-2 leader without the entry committed in term 1', () => {
    const raft = fresh();
    const monitor = new SafetyMonitor();
    holders(raft, [0, 1, 2], [entry(1, 1)], 1);
    raft.nodes[0].term = 1;
    expect(monitor.observe(raft)).toBeNull();
    raft.nodes[4].role = 'leader';
    raft.nodes[4].term = 2;
    expect(monitor.observe(raft)?.rule).toBe('leader-completeness');
  });

  it('leader-completeness does not blame a leader of an earlier term for an entry committed after it was elected', () => {
    const raft = fresh();
    const monitor = new SafetyMonitor();
    holders(raft, [0, 1, 2], [entry(1, 3)], 1);
    raft.nodes[0].term = 3;
    expect(monitor.observe(raft)).toBeNull();
    raft.nodes[4].role = 'leader';
    raft.nodes[4].term = 2;
    expect(monitor.observe(raft)).toBeNull();
  });

  it('committed-on-majority: a committed entry stored on only 2 of 5 servers', () => {
    const raft = fresh();
    holders(raft, [0, 1], [entry(1, 1)], 1);
    const found = new SafetyMonitor().observe(raft);
    expect(found?.rule).toBe('committed-on-majority');
    expect(found?.message).toContain(`only 2 of ${N}`);
    expect(MAJORITY).toBe(3);
  });

  it('keeps the first violation and stops counting events', () => {
    const raft = fresh();
    const monitor = new SafetyMonitor();
    holders(raft, [0, 1], [entry(1, 1)], 1);
    const first = monitor.observe(raft);
    const seen = monitor.events;
    expect(monitor.observe(raft)).toBe(first);
    expect(monitor.events).toBe(seen);
  });
});

describe('the live run', () => {
  it('elects a leader inside the timeout range plus a vote round trip, from the default state', () => {
    const live = new LiveRaft(7, 'raft');
    live.advance(TIMEOUT_MAX * 3);
    expect(leaderNames(live).length).toBeGreaterThan(0);
  });
});

describe('a message cut by a partition while in flight', () => {
  it('keeps its position when it was already past halfway, instead of jumping back', () => {
    const raft = fresh();
    // Run until some message is well past halfway on a link the partition will cut.
    const cutLink = (m: (typeof raft.msgs)[number]) => [1, 2].includes(m.from) !== [1, 2].includes(m.to);
    const pastHalf = () => raft.msgs.some((m) => cutLink(m) && (raft.now - m.sentAt) / (m.arriveAt - m.sentAt) > 0.6);
    for (let t = 0; t < 30_000 && !pastHalf(); t += 20) raft.step(20);
    expect(pastHalf(), 'a message crossing the future cut is past halfway').toBe(true);
    const before = motionView(raft).msgs.map((m) => ({ id: m.id, x: m.x, y: m.y }));
    raft.setPartition(true, [1, 2]);
    const after = motionView(raft).msgs;
    for (const b of before) {
      const a = after.find((m) => m.id === b.id)!;
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
    }
    expect(raft.msgs.some((m) => m.lost && m.stopAt! > 0.5)).toBe(true);
  });
});
