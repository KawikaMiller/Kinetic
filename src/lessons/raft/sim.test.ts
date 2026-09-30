import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/random';
import { Raft } from './sim';

const TICK_MS = 16;
const TRIALS = 12;

/** A cluster driven by seeded randomness, recording every leader seen per term. */
function cluster(seed: number) {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
  const raft = new Raft();
  const leadersByTerm = new Map<number, Set<number>>();
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += TICK_MS) {
      raft.step(TICK_MS);
      for (const n of raft.nodes) {
        if (!n.alive || n.role !== 'leader') continue;
        const set = leadersByTerm.get(n.term) ?? new Set<number>();
        set.add(n.id);
        leadersByTerm.set(n.term, set);
      }
    }
  };
  return { raft, run, leadersByTerm };
}

const logOf = (raft: Raft, i: number, upTo = raft.nodes[i].log.length) =>
  raft.nodes[i].log.slice(0, upTo).map((e) => `${e.term}:${e.cmd}`).join(',');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('raft simulation', () => {
  it.each(Array.from({ length: TRIALS }, (_, i) => i + 1))('keeps Raft safety through partition, heal and crash (seed %i)', (seed) => {
    const { raft, run, leadersByTerm } = cluster(seed);

    run(15_000);
    const first = raft.leader;
    expect(first, 'a leader is elected').toBeTruthy();

    raft.clientCommand();
    raft.clientCommand();
    run(4_000);
    expect(raft.nodes.every((n) => n.commit === 2), 'both commands commit everywhere').toBe(true);

    raft.setPartition(true);
    run(12_000);
    const majorityLeader = raft.leader!;
    expect(majorityLeader.id, 'the majority side elects a new leader').not.toBe(first!.id);
    expect(raft.minority!.has(first!.id)).toBe(true);

    raft.clientCommand(); // lands on both the stale and the new leader
    run(4_000);
    expect(raft.nodes[first!.id].commit, 'a stale minority leader cannot commit').toBe(2);
    expect(majorityLeader.commit, 'the majority leader commits').toBe(3);

    raft.setPartition(false);
    run(12_000);
    const logs = raft.nodes.map((_, i) => logOf(raft, i));
    expect(new Set(logs).size, 'logs converge after the heal').toBe(1);

    const minCommit = Math.min(...raft.nodes.map((n) => n.commit));
    const committed = raft.nodes.map((_, i) => logOf(raft, i, minCommit));
    expect(new Set(committed).size, 'committed prefixes agree').toBe(1);

    const doubleLeaders = [...leadersByTerm].filter(([, ids]) => ids.size > 1);
    expect(doubleLeaders, 'at most one leader per term').toEqual([]);

    const crashed = raft.leader!;
    raft.toggleNode(crashed.id);
    run(30_000);
    expect(raft.leader?.id, 'a new leader after the crash').not.toBe(crashed.id);
    expect(raft.leader).toBeTruthy();
  });
});
