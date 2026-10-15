import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds, historyOf, linearizable, type Cluster } from '../../core/distSim';
import { expectCaption } from '../../core/testing/captions';
import lesson from './index';
import { buildFrames } from './frames';
import {
  BROKEN_SEED, choiceAfterNetSwitch, clientsSeeOneRegister, faultScenario, HEALTHY_ONE_WAY_MS, partitionOnlyScenario, INITIAL_VALUE, MAJORITY,
  minorityRefuses, NODE_IDS, OP_TIMEOUT_MS, PARTITION, PROCESS_MS, reachableAt, runStory, SEARCH_END_MS, staleReads, writeLatencyMs,
  type Choice, type Msg, type Net, type NodeState, type OpRecord,
} from './model';

const SEEDS = 300;
const STORIES: [Net, Choice][] = [['partition', 'cp'], ['partition', 'ap'], ['healthy', 'ec'], ['healthy', 'el']];
const op = (kind: 'write' | 'read', invoke: number, response: number, value: number): OpRecord => ({
  op: 0, kind, client: 'C', node: 'N1', invoke, response, outcome: 'ok', value,
});

describe('the CP choice (majority quorum) over seeded fault schedules', () => {
  it(`what clients are told is one consistent register on all ${SEEDS} seeds (delay, loss, duplication, a partition, a crash, skewed clocks)`, () => {
    const verdict = forSeeds(SEEDS, faultScenario('quorum'), [clientsSeeOneRegister], { until: SEARCH_END_MS });
    expect(verdict).toEqual({ ok: true, seeds: SEEDS });
  });

  it(`a replica on the minority side never answers ok, on all ${SEEDS} seeds`, () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const cluster = faultScenario('quorum')(seed);
      const result = checkInvariants(cluster, [minorityRefuses(cluster)], { until: SEARCH_END_MS });
      expect(result.ok, `seed ${seed}`).toBe(true);
    }
  });

  it('refusals are real in that search: some seed has a refused request', () => {
    const refused = Array.from({ length: SEEDS }, (_, seed) => {
      const c = faultScenario('quorum')(seed);
      c.run({ until: SEARCH_END_MS });
      return Object.values(c.snapshot().nodes).some((n) => n.state?.ops.some((o) => o.outcome === 'refused'));
    });
    expect(refused.some(Boolean)).toBe(true);
  });
});

describe('the AP choice (answer locally, merge later) is the broken mode', () => {
  const consistent = (scenario: (seed: number) => Cluster<Msg, NodeState>) =>
    (seed: number) => checkInvariants(scenario(seed), [clientsSeeOneRegister], { until: SEARCH_END_MS }).ok;

  it('breaks the consistency check on the full random fault search', () => {
    expect(forSeeds(SEEDS, faultScenario('local'), [clientsSeeOneRegister], { until: SEARCH_END_MS }).ok).toBe(false);
  });

  it(`a partition alone (no loss, crash or skew) breaks it: the lowest seed where the schedule fails with the cut and passes without it is the pinned BROKEN_SEED (${BROKEN_SEED})`, () => {
    const caused = (seed: number) => !consistent(partitionOnlyScenario('local'))(seed) && consistent(partitionOnlyScenario('local', false))(seed);
    let lowest = -1;
    for (let seed = 0; seed < SEEDS && lowest < 0; seed++) if (caused(seed)) lowest = seed;
    expect(lowest).toBe(BROKEN_SEED);
  });

  it('the pinned seed shows the stated reason: the trace has a partition, and AP failed because of it', () => {
    const cluster = partitionOnlyScenario('local')(BROKEN_SEED);
    const result = checkInvariants(cluster, [clientsSeeOneRegister], { until: SEARCH_END_MS });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.trace.some((row) => row.kind === 'partition')).toBe(true);
    expect(consistent(partitionOnlyScenario('local', false))(BROKEN_SEED)).toBe(true);
  });

  it('CP stays consistent on the same partition-only schedules, on all seeds', () => {
    const verdict = forSeeds(SEEDS, partitionOnlyScenario('quorum'), [clientsSeeOneRegister], { until: SEARCH_END_MS });
    expect(verdict).toEqual({ ok: true, seeds: SEEDS });
  });

  it('AP is non-linearizable with the partition removed too (the EL point): some seed fails with no fault at all', () => {
    const failing = Array.from({ length: SEEDS }, (_, seed) => seed).filter((seed) => !consistent(partitionOnlyScenario('local', false))(seed));
    expect(failing.length).toBeGreaterThan(0);
  });

  it('also answers ok from the minority side on some seed (so the minority check can fail)', () => {
    const failing = Array.from({ length: SEEDS }, (_, seed) => {
      const cluster = faultScenario('local')(seed);
      return !checkInvariants(cluster, [minorityRefuses(cluster)], { until: SEARCH_END_MS }).ok;
    });
    expect(failing.some(Boolean)).toBe(true);
  });
});

describe('the EC choice (write to all replicas first)', () => {
  it('is consistent on a healthy network on every seed, and a write costs the round trip', () => {
    const verdict = forSeeds(SEEDS, faultScenario('all', false), [clientsSeeOneRegister], { until: SEARCH_END_MS });
    expect(verdict).toEqual({ ok: true, seeds: SEEDS });
    expect(writeLatencyMs('ec')).toBe(PROCESS_MS + 2 * HEALTHY_ONE_WAY_MS);
  });
});

describe('what the stories show, against hand-worked expectations', () => {
  const outcomes = (net: Net, choice: Choice) => runStory(net, choice).ops.map((o) => `${o.kind}@${o.node}:${o.outcome}${o.kind === 'read' && o.value !== null ? `=${o.value}` : ''}`);

  it('partition + CP: N1 refuses the write and the read, N2 and N3 accept theirs and N3 reads it back', () => {
    expect(outcomes('partition', 'cp')).toEqual(['write@N1:refused', 'write@N2:ok', 'read@N1:refused', 'read@N3:ok=3']);
    const story = runStory('partition', 'cp');
    expect(story.valuesAt(200)).toEqual({ N1: 1, N2: 1, N3: 1 });
    expect(story.valuesAt(320)).toEqual({ N1: 1, N2: 3, N3: 3 });
    expect(story.valuesAt(PARTITION.to + 200)).toEqual({ N1: 3, N2: 3, N3: 3 });
    expect(story.staleAt(800)).toBe(0);
    expect(linearizable(historyOf(story.ops), { initial: INITIAL_VALUE })).toBeNull();
  });

  it('partition + CP: N1 sees 1 of 3 replicas, N2 sees 2 of 3, and refuses after exactly the timeout', () => {
    const story = runStory('partition', 'cp');
    expect(reachableAt(story.cluster, 'N1', 150)).toBe(1);
    expect(reachableAt(story.cluster, 'N2', 250)).toBe(2);
    expect(reachableAt(story.cluster, 'N1', PARTITION.to)).toBe(NODE_IDS.length);
    expect(MAJORITY).toBe(Math.floor(NODE_IDS.length / 2) + 1);
    const [w1] = story.ops;
    expect((w1.response ?? 0) - w1.invoke).toBe(OP_TIMEOUT_MS);
  });

  it('partition + AP: both writes are acknowledged at once, the reads return 2 and 3, one read is stale, and the replicas end on 3', () => {
    expect(outcomes('partition', 'ap')).toEqual(['write@N1:ok', 'write@N2:ok', 'read@N1:ok=2', 'read@N3:ok=3']);
    const story = runStory('partition', 'ap');
    expect(story.ops.slice(0, 2).map((o) => (o.response ?? 0) - o.invoke)).toEqual([PROCESS_MS, PROCESS_MS]);
    expect(story.staleAt(800)).toBe(1);
    expect(story.valuesAt(360)).toEqual({ N1: 2, N2: 3, N3: 3 });
    expect(story.valuesAt(PARTITION.to + 5)).toEqual({ N1: 2, N2: 3, N3: 3 });
    expect(story.valuesAt(PARTITION.to + 200)).toEqual({ N1: 3, N2: 3, N3: 3 });
    expect(linearizable(historyOf(story.ops), { initial: INITIAL_VALUE })).not.toBeNull();
  });

  it('partition + AP: the background copy of N1 write really is dropped by the partition', () => {
    const story = runStory('partition', 'ap');
    const dropped = story.cluster.trace.filter((r) => r.kind === 'drop' && r.reason === 'partition' && r.from === 'N1' && r.t < PARTITION.to);
    expect(dropped.length).toBeGreaterThan(0);
  });

  it('healthy + EC: the write is acknowledged after the round trip and a later read at N3 returns it', () => {
    expect(outcomes('healthy', 'ec')).toEqual(['write@N1:ok', 'read@N3:ok=2']);
    const story = runStory('healthy', 'ec');
    expect(story.valuesAt(10)).toEqual({ N1: 2, N2: 1, N3: 1 });
    expect(story.valuesAt(HEALTHY_ONE_WAY_MS + PROCESS_MS)).toEqual({ N1: 2, N2: 2, N3: 2 });
    expect(story.staleAt(800)).toBe(0);
  });

  it('healthy + EL: the write is acknowledged after the local work only, and a read in between is stale', () => {
    expect(outcomes('healthy', 'el')).toEqual(['write@N1:ok', 'read@N3:ok=1', 'read@N3:ok=2']);
    expect(writeLatencyMs('el')).toBe(PROCESS_MS);
    const story = runStory('healthy', 'el');
    expect(story.staleAt(800)).toBe(1);
    expect(story.valuesAt(HEALTHY_ONE_WAY_MS + PROCESS_MS - 1).N3).toBe(1);
    expect(story.valuesAt(HEALTHY_ONE_WAY_MS + PROCESS_MS).N3).toBe(2);
  });

  it('the four stories are the same on every seed (fixed delays, no loss), so no seed is shown for them', () => {
    for (const [net, choice] of STORIES) {
      expect(runStory(net, choice, 3).cluster.trace).toEqual(runStory(net, choice, 999).cluster.trace);
    }
  });

  it('the stories are deterministic: the same seed gives the same trace', () => {
    for (const [net, choice] of STORIES) {
      expect(runStory(net, choice, 7).cluster.trace).toEqual(runStory(net, choice, 7).cluster.trace);
    }
  });
});

describe('staleReads', () => {
  it('counts a read that returns something other than the latest write acknowledged before it began', () => {
    const writes = [op('write', 0, 5, 2), op('write', 10, 15, 3)];
    expect(staleReads([...writes, op('read', 20, 25, 3)])).toHaveLength(0);
    expect(staleReads([...writes, op('read', 20, 25, 2)])).toHaveLength(1);
    expect(staleReads([...writes, op('read', 20, 25, INITIAL_VALUE)])).toHaveLength(1);
  });

  it('does not count a read that overlaps the write (the old value is allowed there)', () => {
    expect(staleReads([op('write', 0, 50, 2), op('read', 10, 20, INITIAL_VALUE)])).toHaveLength(0);
  });

  it('counts only reads answered by the cut-off time', () => {
    const ops = [op('write', 0, 5, 2), op('read', 20, 25, INITIAL_VALUE)];
    expect(staleReads(ops, 24)).toHaveLength(0);
    expect(staleReads(ops, 25)).toHaveLength(1);
  });
});

describe('frames', () => {
  const sameValues = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(a) === JSON.stringify(b);

  it('draw replica values, refusals and stale counts that the run holds, and the first frame is the initial state', () => {
    for (const [net, choice] of STORIES) {
      const story = runStory(net, choice);
      const frames = buildFrames(story);
      expect(frames[0].values).toEqual({ N1: INITIAL_VALUE, N2: INITIAL_VALUE, N3: INITIAL_VALUE });
      expect(frames[0].stale).toBe(0);
      expect(sameValues(frames[frames.length - 1].values, story.valuesAt(800))).toBe(true);
      expect(frames[frames.length - 1].stale).toBe(story.staleAt(800));
    }
  });

  it('only show a node as refusing when it refused a request in the run', () => {
    const story = runStory('partition', 'cp');
    const refusers = new Set(story.ops.filter((o) => o.outcome === 'refused').map((o) => o.node));
    for (const frame of buildFrames(story)) for (const n of frame.refusing) expect(refusers.has(n)).toBe(true);
    for (const [net, choice] of STORIES.filter(([, c]) => c !== 'cp')) {
      for (const frame of buildFrames(runStory(net, choice))) expect(frame.refusing).toEqual([]);
    }
  });

  it('have captions with no glued sentences, whose numbers come from the run', () => {
    const text = (net: Net, choice: Choice) => buildFrames(runStory(net, choice)).map((f) => expectCaption(f.say)).join(' | ');
    const cp = text('partition', 'cp');
    expect(cp).toContain(`N1 can reach 1 of 3 replicas, and a majority is ${MAJORITY}`);
    expect(cp).toContain(`waits ${OP_TIMEOUT_MS} ms`);
    expect(cp).toContain('N2 and N3 can reach 2 of 3 replicas');
    const ap = text('partition', 'ap');
    expect(ap).toContain('answering in 5 ms');
    expect(ap).toContain('different answers: x=2 and x=3');
    expect(ap).toContain('every replica ends at x=3');
    expect(ap).toContain('AP can serve a stale read with no partition too');
    expect(text('healthy', 'ec')).toContain(`The write took ${PROCESS_MS + 2 * HEALTHY_ONE_WAY_MS} ms`);
    expect(text('healthy', 'el')).toContain('acknowledged 15 ms earlier');
  });

  it('colour a client red only for a refusal or a stale answer', () => {
    const redReads = (net: Net, choice: Choice) => buildFrames(runStory(net, choice)).flatMap((f) => [f.c1, f.c2]).filter((c) => c.tone === 'bad' && c.text.startsWith('reads')).filter((c, i, all) => all.findIndex((d) => d.text === c.text) === i);
    expect(redReads('partition', 'ap').map((c) => c.text)).toEqual(['reads x=2']);
    expect(redReads('healthy', 'el').map((c) => c.text)).toEqual(['reads x=1 (stale)']);
    expect(redReads('partition', 'cp')).toEqual([]);
    expect(redReads('healthy', 'ec')).toEqual([]);
  });
});

describe('the net switch keeps the same side of the trade-off', () => {
  it('maps C to C and A to L both ways', () => {
    expect(choiceAfterNetSwitch('healthy', 'cp')).toBe('ec');
    expect(choiceAfterNetSwitch('healthy', 'ap')).toBe('el');
    expect(choiceAfterNetSwitch('partition', 'ec')).toBe('cp');
    expect(choiceAfterNetSwitch('partition', 'el')).toBe('ap');
  });
});

describe('try-this, from the default state (Partition, CP, first frame)', () => {
  it('try-this 1: CP refuses N1 write and read, and no stale read is served', () => {
    const story = runStory('partition', 'cp');
    expect(story.ops[0].outcome).toBe('refused');
    expect(story.ops[2].outcome).toBe('refused');
    expect(story.staleAt(800)).toBe(0);
    expect(lesson.tryThis[0]).toContain('refuses the write and then the read');
  });

  it('try-this 2: switching to AP, both writes are acknowledged, the reads disagree with 1 stale read, and one value is left', () => {
    const story = runStory('partition', choiceAfterNetSwitch('partition', 'ap'));
    expect(story.ops.slice(0, 2).every((o) => o.outcome === 'ok')).toBe(true);
    expect(story.ops[2].value).not.toBe(story.ops[3].value);
    expect(story.staleAt(800)).toBe(1);
    expect(new Set(Object.values(story.valuesAt(800))).size).toBe(1);
    expect(lesson.tryThis[1]).toContain('becomes 1');
  });

  it('try-this 3: from the default, Healthy starts on EC with the write latency the text states, and EL has a stale read', () => {
    const choice = choiceAfterNetSwitch('healthy', 'cp');
    expect(choice).toBe('ec');
    expect(lesson.tryThis[2]).toContain(`${writeLatencyMs('ec')} ms write`);
    expect(lesson.tryThis[2]).toContain(`${writeLatencyMs('el')} ms`);
    expect(runStory('healthy', 'el').staleAt(800)).toBe(1);
  });

  it('try-this 4: the default run has a frame with replicas not identical and zero stale reads', () => {
    const frames = buildFrames(runStory('partition', 'cp'));
    const differing = frames.filter((f) => new Set(Object.values(f.values)).size > 1);
    expect(differing.length).toBeGreaterThan(0);
    expect(differing.every((f) => f.stale === 0)).toBe(true);
  });
});
