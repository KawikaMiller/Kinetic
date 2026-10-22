import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { BROKEN_RULE, BROKEN_SEED, checkSeeds, SCHEDULE_SEEDS } from './check';
import lesson from './index';
import { DEFAULT_SEED, LiveRaft } from './live';
import { HEARTBEAT, LATENCY, MAJORITY, Raft, TIMEOUT_MIN, type RaftVariant } from './sim';

const LEADER_WAIT_MS = 20_000;
const SLICE_MS = 100;

/** Advance until `done` holds, in small slices, or fail after `limitMs`. Returns the simulated time reached. */
function until(live: LiveRaft, done: () => boolean, limitMs = LEADER_WAIT_MS): number {
  for (let spent = 0; spent < limitMs; spent += SLICE_MS) {
    if (done()) return live.raft.now;
    live.advance(SLICE_MS);
  }
  throw new Error(`condition not reached within ${limitMs} ms`);
}

const withLeader = (variant: RaftVariant = 'raft') => {
  const live = new LiveRaft(DEFAULT_SEED, variant);
  until(live, () => live.raft.leader !== null);
  return live;
};

describe("try-this entries, from the default state, as written", () => {
  it('try-this 1: the first election is won by the server whose timer ran out first, with a majority of votes', () => {
    // The first timeout draw of each server, from the same seed: the shortest one fires first.
    const draws = new Raft({ rnd: mulberry32(DEFAULT_SEED) }).nodes.map((n) => n.timeoutDur);
    const first = draws.indexOf(Math.min(...draws));
    const live = new LiveRaft(DEFAULT_SEED, 'raft');
    until(live, () => live.raft.leader !== null);
    const election = live.raft.events.find((e) => e.kind === 'election');
    expect(election?.text.startsWith(`S${first + 1} timed out`)).toBe(true);
    const win = live.raft.events.find((e) => e.kind === 'leader');
    expect(win).toBeDefined();
    const votes = Number(/won (\d)\//.exec(win!.text)?.[1]);
    expect(votes).toBeGreaterThanOrEqual(MAJORITY);
    expect(live.raft.leader!.term).toBeGreaterThanOrEqual(1);
  });

  it('try-this 2: commands are pending (dashed) until a majority stores them, then committed (solid)', () => {
    const live = withLeader();
    const leader = live.raft.leader!;
    for (let i = 0; i < 3; i += 1) live.raft.clientCommand();
    expect(leader.log).toHaveLength(3);
    expect(leader.commit, 'nothing is committed the instant the commands are sent').toBe(0);
    until(live, () => leader.commit === 3);
    expect(live.raft.nodes.filter((n) => n.log.length === 3).length).toBeGreaterThanOrEqual(MAJORITY);
    expect(live.monitor.violation).toBeNull();
  });

  it('try-this 3: after the leader crashes there is no leader until a new one wins, no sooner than a timeout and a vote round trip allow', () => {
    const live = withLeader();
    const crashed = live.raft.leader!;
    live.raft.toggleNode(crashed.id);
    const crashAt = live.raft.now;
    expect(live.raft.leader).toBeNull();
    const wonAt = until(live, () => live.raft.leader !== null, 30_000);
    expect(live.raft.leader!.id).not.toBe(crashed.id);
    // The last timer reset anywhere was at most one heartbeat before the crash, a follower waits at least
    // TIMEOUT_MIN after it, and winning needs a request out and a reply back (each at least 0.85 x LATENCY).
    const earliest = TIMEOUT_MIN - HEARTBEAT + 2 * LATENCY * 0.85;
    expect(wonAt - crashAt).toBeGreaterThanOrEqual(earliest);
    const lines = live.raft.events.filter((e) => e.kind === 'crash' || e.kind === 'leader');
    expect(lines.at(-2)?.t, 'the crash line carries the time the lesson tells the learner to read').toBe(crashAt);
  });

  it('try-this 4: a cut-off leader keeps its entries pending, the other three commit, and the heal overwrites the stale entries without breaking safety', () => {
    const live = withLeader();
    live.raft.clientCommand();
    until(live, () => live.raft.nodes.every((n) => n.commit === 1));
    const stale = live.raft.leader!;
    live.raft.setPartition(true);
    until(live, () => live.raft.nodes.some((n) => n.alive && !live.raft.minority!.has(n.id) && n.role === 'leader'));
    const fresh = live.raft.nodes.find((n) => !live.raft.minority!.has(n.id) && n.role === 'leader')!;
    live.raft.clientCommand();
    live.advance(6_000);
    expect(fresh.commit, 'the three-server side commits').toBe(2);
    expect(stale.commit, 'the cut-off leader cannot').toBe(1);
    expect(stale.log.length, 'it still appended the entry').toBe(2);
    const staleEntry = stale.log[1];
    live.raft.setPartition(false);
    live.advance(15_000);
    expect(stale.log[1].id, 'its entry was replaced by the new leader').not.toBe(staleEntry.id);
    expect(live.monitor.violation).toBeNull();
  });

  it(`try-this 5: without a majority rule the cut-off leader commits on 2 of 5 and the monitor reads ${BROKEN_RULE['commit-without-majority']}; the check breaks on the pinned seed`, () => {
    const live = withLeader('commit-without-majority');
    expect(live.monitor.violation).toBeNull();
    live.raft.setPartition(true);
    live.raft.clientCommand();
    live.advance(3_000);
    expect(live.monitor.violation?.rule).toBe('committed-on-majority');
    expect(live.monitor.violation?.message).toContain('only 2 of 5');
    const summary = checkSeeds('commit-without-majority');
    expect(summary.lowest?.seed).toBe(BROKEN_SEED['commit-without-majority']);
    expect(summary.failures).toBeGreaterThan(0);
    expect(summary.seeds).toBe(SCHEDULE_SEEDS);
    const real = withLeader('raft');
    real.raft.setPartition(true);
    real.raft.clientCommand();
    real.advance(3_000);
    expect(real.monitor.violation).toBeNull();
  });
});

describe('the lesson text', () => {
  it('has five try-this entries and five quiz questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });

  it('states the commit rule and the model scope in the summary', () => {
    expect(lesson.summary.what).toContain('written in its own term');
  });

  it('quotes the pinned vote-check seed in the quiz, and the pinned seed and rule are the ones the check finds', () => {
    expect(lesson.quiz[4].why).toContain(`seed ${BROKEN_SEED['vote-without-log-check']}`);
    expect(checkSeeds('vote-without-log-check').lowest?.violation?.rule).toBe(BROKEN_RULE['vote-without-log-check']);
  });
});
