import { describe, expect, it } from 'vitest';
import { forSeeds } from '../../core/distSim';
import { expectCaption } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  acknowledged, allOps, BROKEN_SEED, buildCluster, DETECT_MS, everSent, failoverScenario, FLUSH_MS, followersArePrefixes, lagOf, landedAt,
  latencyOf, LAT, noAcknowledgedWriteLost, runStory, SEARCH_END_MS, staleReads, writeMs, type Mode, type NodeView, type OpRecord, type Scenario,
} from './model';

const SEEDS = 300;
const STORIES: [Scenario, Mode][] = [['stale', 'async'], ['stale', 'sync'], ['failover', 'async'], ['failover', 'sync']];
const bounds = { until: SEARCH_END_MS };

describe('failover under seeded faults (jitter, 5% loss, 10% duplication, the leader crashing at a seeded moment)', () => {
  it(`sync: the promoted follower holds every acknowledged write, on all ${SEEDS} seeds`, () => {
    expect(forSeeds(SEEDS, failoverScenario('sync'), [noAcknowledgedWriteLost], bounds)).toEqual({ ok: true, seeds: SEEDS });
  });

  it(`async is the broken mode: it loses an acknowledged write, and the lowest failing seed is the pinned BROKEN_SEED (${BROKEN_SEED})`, () => {
    const verdict = forSeeds(SEEDS, failoverScenario('async'), [noAcknowledgedWriteLost], bounds);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.seed).toBe(BROKEN_SEED);
      expect(verdict.message).toMatch(/order #\d/);
    }
  });

  it('async loses a write on many seeds, not just one', () => {
    const failing = Array.from({ length: SEEDS }, (_, i) => i).filter((seed) => !forSeeds({ from: seed, to: seed + 1 }, failoverScenario('async'), [noAcknowledgedWriteLost], bounds).ok);
    expect(failing.length).toBeGreaterThan(SEEDS / 10);
  });

  it(`in both modes a follower only ever falls behind the leader, it never holds a different entry (${SEEDS} seeds each)`, () => {
    for (const mode of ['async', 'sync'] as const) {
      expect(forSeeds(SEEDS, failoverScenario(mode), [followersArePrefixes], bounds), mode).toEqual({ ok: true, seeds: SEEDS });
    }
  });
});

describe('write latency, from closed forms', () => {
  it('async is the client round trip; sync adds a round trip to the slowest follower', () => {
    expect(writeMs('async')).toBe(2 * LAT.client);
    expect(writeMs('sync')).toBe(2 * LAT.client + 2 * LAT.f2);
  });

  it('is the same for every write of the stories (they are acknowledged the same way)', () => {
    for (const [scenario, mode] of STORIES) {
      for (const w of runStory(scenario, mode).ops.filter((o) => o.kind === 'write')) expect(latencyOf(w)).toBe(writeMs(mode));
    }
  });

  it('sync writes stall when a follower is down; async writes do not', () => {
    const run = (mode: Mode) => {
      const cluster = buildCluster({ seed: 0, mode, initialLog: ['x'], requests: [{ sentAt: 10, node: 'L', kind: 'write', entry: 'y' }], crashAt: null });
      cluster.crash('F2', 0);
      cluster.run({ until: 2000 });
      return allOps(cluster.snapshot().nodes)[0].response;
    };
    expect(run('sync')).toBeNull();
    expect(run('async')).not.toBeNull();
  });
});

describe('the stale-read story', () => {
  it('async: the entry reaches F1 and F2 on the background sender, and the read at F2 before that returns the old name', () => {
    const story = runStory('stale', 'async');
    const [write, read] = story.ops;
    expect(landedAt(story, 'F1', 'name=Ada')).toBe(FLUSH_MS + LAT.f1);
    expect(landedAt(story, 'F2', 'name=Ada')).toBe(FLUSH_MS + LAT.f2);
    expect(read.entry).toBe('name=Ana');
    expect(story.staleAt(500)).toBe(1);
    expect(write.response).toBeLessThan(read.invoke);
    expect(story.at(read.response ?? 0).F2.log).toEqual(['name=Ana']);
    expect(story.at(FLUSH_MS + LAT.f2).F2.log).toEqual(['name=Ana', 'name=Ada']);
  });

  it('sync: the entry lands on arrival, every replica has it when the client is told ok, and the read returns it', () => {
    const story = runStory('stale', 'sync');
    const [write, read] = story.ops;
    expect(landedAt(story, 'F1', 'name=Ada')).toBe(LAT.client + LAT.f1);
    expect(landedAt(story, 'F2', 'name=Ada')).toBe(LAT.client + LAT.f2);
    for (const node of Object.values(story.at(write.response ?? 0))) expect(node.log).toEqual(['name=Ana', 'name=Ada']);
    expect(read.entry).toBe('name=Ada');
    expect(story.staleAt(500)).toBe(0);
  });
});

describe('the leader-crash story', () => {
  it('async: order #4 is confirmed, never shipped, and is on no live node after the crash; F1 is promoted; the query finds nothing', () => {
    const story = runStory('failover', 'async');
    const [first, second, query] = story.ops;
    expect(acknowledged(story.ops).map((w) => w.entry)).toEqual(['order #3', 'order #4']);
    expect(everSent(story, 'order #4')).toBe(false);
    expect(everSent(story, 'order #3')).toBe(true);
    const crashAt = story.script.crashAt ?? NaN;
    expect(story.missingAt(crashAt - 1)).toEqual([]);
    expect(story.missingAt(crashAt + 1)).toEqual(['order #4']);
    expect(story.missingAt(400)).toEqual(['order #4']);
    const atPromotion = story.at((story.promotedAt ?? NaN) - 1);
    expect(atPromotion.F1.log).toHaveLength(3);
    expect(atPromotion.F2.log).toHaveLength(2);
    expect(story.at(400).F1.role).toBe('promoted');
    expect(story.at(400).F2.role).toBe('follower');
    expect(query.entry).toBeNull();
    expect(first.response).toBeLessThan(second.response ?? 0);
    expect(story.promotedAt).toBeGreaterThan(crashAt + DETECT_MS);
  });

  it('async: the slow copy of #3 still reaches F2 after the failover', () => {
    const story = runStory('failover', 'async');
    const lands = landedAt(story, 'F2', 'order #3') ?? NaN;
    expect(lands).toBe(FLUSH_MS + LAT.f2);
    expect(lands).toBeGreaterThan(story.promotedAt ?? NaN);
  });

  it('sync: nothing is missing at any sampled moment, the promoted follower holds #4, and the query finds it', () => {
    const story = runStory('failover', 'sync');
    for (let t = 0; t <= 500; t += 7) expect(story.missingAt(t), `t=${t}`).toEqual([]);
    expect(story.at(450).F1.role).toBe('promoted');
    expect(story.at(450).F1.log).toContain('order #4');
    expect(story.ops[2].entry).toBe('order #4');
  });

  it('the failover manager promotes the longer log (a longer F2 would be chosen)', () => {
    const cluster = buildCluster({
      seed: 0, mode: 'async', initialLog: ['a'], requests: [], crashAt: 5,
    });
    // F2 is given a longer log by shipping it an extra entry before the leader dies.
    cluster.inject(1, 'F2', { type: 'append', index: 2, entry: 'b' }, 'L');
    cluster.run({ until: 200 });
    const nodes = cluster.snapshot().nodes;
    expect(nodes.F2.state?.role).toBe('promoted');
    expect(nodes.F1.state?.role).toBe('follower');
  });
});

describe('staleReads and lagOf, hand-worked', () => {
  const write = (invoke: number, response: number, entry: string): OpRecord => ({ op: 0, kind: 'write', node: 'L', invoke, response, entry });
  const read = (invoke: number, response: number, entry: string | null, asked?: string): OpRecord => ({ op: 1, kind: 'read', node: 'F2', invoke, response, entry, asked });

  it('a read that returns something older than the latest write acknowledged before it was sent is stale', () => {
    const ops = [write(0, 5, 'b'), read(10, 12, 'a')];
    expect(staleReads(ops, 'a')).toHaveLength(1);
    expect(staleReads([write(0, 5, 'b'), read(10, 12, 'b')], 'a')).toHaveLength(0);
  });

  it('a read sent before the write was acknowledged may return the old value', () => {
    expect(staleReads([write(0, 50, 'b'), read(10, 12, 'a')], 'a')).toHaveLength(0);
  });

  it('a read of one named entry is not a freshness test', () => {
    expect(staleReads([write(0, 5, 'b'), read(10, 12, null, 'b')], 'a')).toHaveLength(0);
  });

  it('lag is measured against the longest log that is still alive, and a dead leader does not count', () => {
    const view = (role: NodeView['role'], n: number): NodeView => ({ role, log: Array.from({ length: n }, (_, i) => `e${i}`) });
    expect(lagOf({ L: view('leader', 4), F1: view('follower', 3), F2: view('follower', 1) })).toEqual({ F1: 1, F2: 3 });
    expect(lagOf({ L: view('dead', 4), F1: view('promoted', 3), F2: view('follower', 2) })).toEqual({ F1: 0, F2: 1 });
  });
});

describe('frames', () => {
  const stories = STORIES.map(([scenario, mode]) => ({ scenario, mode, story: runStory(scenario, mode) }));

  it('start from the initial logs and end on the run state at the last sampled time', () => {
    for (const { story } of stories) {
      const frames = buildFrames(story);
      expect(frames[0].nodes).toEqual(story.at(0));
      expect(frames[0].stale).toBe(0);
      expect(frames[0].missing).toBe(0);
    }
  });

  it('captions have no glued sentences, and their numbers come from the run', () => {
    const text = (scenario: Scenario, mode: Mode) => buildFrames(runStory(scenario, mode)).map((f) => expectCaption(f.say)).join(' | ');
    expect(text('stale', 'async')).toContain(`Saved in ${writeMs('async')} ms`);
    expect(text('stale', 'async')).toContain(`every ${FLUSH_MS} ms`);
    expect(text('stale', 'async')).toContain(`F2's copy is still crossing the ocean (${LAT.f2} ms each way)`);
    expect(text('stale', 'sync')).toContain(`it took ${writeMs('sync')} ms instead of ${writeMs('async')}`);
    expect(text('failover', 'async')).toContain(`the manager notices ${DETECT_MS} ms after the crash`);
    expect(text('failover', 'async')).toContain('3 entries on F1, 2 on F2');
    expect(text('failover', 'async')).toContain('1 ms after confirming #4');
    expect(text('failover', 'async')).toContain('never left the building');
    expect(text('failover', 'sync')).toContain(`every order took ${writeMs('sync')} ms instead of ${writeMs('async')}`);
  });

  it('show the client as wrong (red) only when the run says it was told something wrong', () => {
    const red = (scenario: Scenario, mode: Mode) => buildFrames(runStory(scenario, mode)).filter((f) => f.client.tone === 'bad').map((f) => f.client.text).filter((t, i, all) => all.indexOf(t) === i);
    expect(red('stale', 'async')).toEqual(['profile: Ana']);
    expect(red('stale', 'sync')).toEqual([]);
    expect(red('failover', 'async').some((t) => t.includes('not found'))).toBe(true);
    expect(red('failover', 'sync')).toEqual([]);
  });

  it('count stale reads and lost writes only after the run produced them', () => {
    const asyncStale = buildFrames(runStory('stale', 'async'));
    expect(asyncStale.map((f) => f.stale)).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    for (const f of buildFrames(runStory('failover', 'sync'))) expect(f.missing).toBe(0);
    const lost = buildFrames(runStory('failover', 'async')).map((f) => f.missing);
    expect(lost[0]).toBe(0);
    expect(Math.max(...lost)).toBe(1);
    expect(lost.indexOf(1)).toBeGreaterThan(0);
  });
});

describe('try-this, from the default state (Stale read, Asynchronous, first frame)', () => {
  it('try-this 1: the reload on F2 returns the old name and the stale count becomes 1', () => {
    const frames = buildFrames(runStory('stale', 'async'));
    const answered = frames.find((f) => f.client.text === 'profile: Ana' && f.stale === 1);
    expect(answered).toBeDefined();
    expect(lesson.tryThis[0]).toContain('becomes 1');
  });

  it('try-this 2: switching to Synchronous, the reload returns the new name and the write latency is the one the text states', () => {
    const frames = buildFrames(runStory('stale', 'sync'));
    expect(frames.some((f) => f.client.text === 'profile: Ada' && f.client.tone === 'ok')).toBe(true);
    expect(frames.find((f) => f.latencyMs !== null)?.latencyMs).toBe(writeMs('sync'));
    expect(lesson.tryThis[1]).toContain(`${writeMs('sync')} ms instead of ${writeMs('async')} ms`);
  });

  it('try-this 3: picking Leader crash keeps Asynchronous; the second order is confirmed and then counted as lost', () => {
    const frames = buildFrames(runStory('failover', 'async'));
    const confirmed = frames.findIndex((f) => f.client.text.includes('#4 ✓ confirmed'));
    const lost = frames.findIndex((f) => f.missing === 1);
    expect(confirmed).toBeGreaterThan(-1);
    expect(lost).toBeGreaterThan(confirmed);
  });

  it('try-this 4: when the client is told "saved", F2 is still 1 behind with Asynchronous and 0 behind with Synchronous', () => {
    const lagWhenSaved = (mode: Mode) => lagOf(buildFrames(runStory('stale', mode)).find((f) => f.client.text.startsWith('saved'))!.nodes).F2;
    expect(lagWhenSaved('async')).toBe(1);
    expect(lagWhenSaved('sync')).toBe(0);
  });
});

describe('determinism', () => {
  it('the same seed gives the same trace', () => {
    for (const [scenario, mode] of STORIES) {
      expect(runStory(scenario, mode, 3).trace).toEqual(runStory(scenario, mode, 3).trace);
    }
  });
});
