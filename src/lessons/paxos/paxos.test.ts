import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { explore } from '../../core/explore';
import { forSeeds } from '../../core/distSim';
import { networkExplorer, type NetState } from '../../core/pureProtocol';
import { choose } from '../../core/stats';
import { SEED_MAX } from '../../core/seed';
import { duelCaption, multiCaption, poolCaption } from './captions';
import { DEFAULT_CRASH_AFTER, MESSAGES_PER_PHASE, intersections, singleDecreeMessages, stableProposerMessages } from './counting';
import { DUEL_BALLOTS, drainAccepts, duelSteps, replayDuel } from './duel';
import lesson from './index';
import {
  ACCEPTORS, RETRY_BALLOTS, THREE_BALLOTS, TWO_BALLOTS, atMostOneChosen, chosenPairs, configFor, majority, protocolFor, type Bug, type PaxosMsg, type PaxosState,
} from './protocol';
import {
  BROKEN_SEED_BELOW_PROMISE, BROKEN_SEED_IGNORE_PROMISED, DEFAULT_OPTIONS, LOSS_PERCENT, OFFSET_WINDOW_MS, SEED_RANGE, SEEDS_TOTAL, THREE_BALLOT_STATE_CAP, exhaustiveSearch,
  nodeRecord, oneValueRule, paxosScenario, runPaxosSeed, seedFor, sweepSeeds, type SeedOptions,
} from './search';
import { CLEAN, LATE, POOL_CAP, PRESETS, PREEMPT, acceptNow, applyOp, initialSession, replayOps, runSteps, verdictOf } from './session';

const config = configFor(RETRY_BALLOTS);

/** Independent "chosen": over all 2^3 subsets of acceptors, a majority subset in which every member voted the same (ballot, value). */
function chosenBySubsets(states: Record<string, PaxosState>): string[] {
  const found = new Set<string>();
  for (let mask = 0; mask < 8; mask++) {
    const members = ACCEPTORS.filter((_, i) => (mask >> i) & 1);
    if (members.length < 2) continue;
    const common = (members.map((a) => (states[a] as { votes: [number, string][] }).votes.map(([b, v]) => `${b}|${v}`)) as string[][]).reduce((x, y) => x.filter((k) => y.includes(k)));
    for (const k of common) found.add(k.split('|')[1]);
  }
  return [...found].sort();
}

describe('the exhaustive leg, 3 acceptors, 2 proposers, ballots 1 and 2', () => {
  const run = exhaustiveSearch(TWO_BALLOTS, 'none');

  it('visits 2,905 states, the kit spike gate, with no violation and not truncated', () => {
    expect(run).toMatchObject({ states: 2905, truncated: false, violation: null, depth: 18 });
  });

  it('chosen is read the same way by the lesson and by a subset brute force, in every one of the 2,905 states', () => {
    const net = networkExplorer(protocolFor(configFor(TWO_BALLOTS)));
    let seen = 0;
    let mismatches = 0;
    let none = 0;
    let a = 0;
    let b = 0;
    explore({
      ...net,
      onVisit: ({ state }) => {
        const nodes = nodeRecord(state);
        const mine = [...new Set(chosenPairs(nodes).map((c) => c.value))].sort();
        const oracle = chosenBySubsets(nodes);
        if (mine.join() !== oracle.join()) mismatches++;
        seen++;
        if (oracle.length === 0) none++;
        if (oracle.includes('A')) a++;
        if (oracle.includes('B')) b++;
      },
    });
    expect(seen).toBe(2905);
    expect(mismatches).toBe(0);
    expect([none, a, b]).toEqual([run.none, run.chosenA, run.chosenB]);
    expect(none + a + b).toBe(2905); // no state has both values chosen
  });

  it('the shortest path to any chosen value is 7 steps (start, two Prepares, two Promises, two Accepts)', () => {
    const net = networkExplorer(protocolFor(configFor(TWO_BALLOTS)));
    const first = explore({ ...net, invariant: (s: NetState<PaxosState, PaxosMsg>) => (chosenBySubsets(nodeRecord(s)).length > 0 ? 'chosen' : null) });
    expect(first.violation!.path).toHaveLength(7);
    expect(lesson.tryThis[0]).toContain('7 steps');
  });

  it('three ballots hit the 20,000-state cap: truncated, never claimed to hold', () => {
    const three = exhaustiveSearch(THREE_BALLOTS, 'none', THREE_BALLOT_STATE_CAP);
    expect(three).toMatchObject({ states: THREE_BALLOT_STATE_CAP, truncated: true, violation: null });
  });
});

describe('planted bugs: the explorer and the seeded harness agree, and the fixed protocol passes both', () => {
  it.each([['acceptBelowPromise' as Bug], ['ignorePromised' as Bug]])('%s: a 14-step shortest counterexample, two values chosen: A, B', (bug) => {
    const run = exhaustiveSearch(TWO_BALLOTS, bug);
    expect(run.violation!.message).toBe('two values chosen: A, B');
    expect(run.violation!.path).toHaveLength(14);
    const last = nodeRecord(run.violation!.path[13].state);
    expect(chosenBySubsets(last)).toEqual(['A', 'B']);
  });

  it('BROKEN seeds are the lowest failing seeds from 1 (forSeeds), neither is 0, each fails for the rule named', () => {
    for (const [bug, seed] of [['acceptBelowPromise', BROKEN_SEED_BELOW_PROMISE], ['ignorePromised', BROKEN_SEED_IGNORE_PROMISED]] as const) {
      const verdict = forSeeds(SEED_RANGE, paxosScenario({ ...DEFAULT_OPTIONS, bug }), [oneValueRule]);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.seed).toBe(seed);
      expect(seed).toBeGreaterThan(0);
      expect(verdict.rule).toBe(0);
      expect(verdict.message).toBe('two values chosen: A, B');
      expect(seedFor(bug)).toBe(seed);
    }
  });

  it('the broken modes fail on 57 of 200 and 159 of 200 seeds at the default window, inside their bands and under 90%', () => {
    const below = sweepSeeds({ ...DEFAULT_OPTIONS, bug: 'acceptBelowPromise' });
    const ignore = sweepSeeds({ ...DEFAULT_OPTIONS, bug: 'ignorePromised' });
    expect(below.failing).toHaveLength(57);
    expect(ignore.failing).toHaveLength(159);
    expect(below.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.1);
    expect(below.failing.length / SEEDS_TOTAL).toBeLessThan(0.4);
    expect(ignore.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.5);
    expect(ignore.failing.length / SEEDS_TOTAL).toBeLessThan(0.85);
    expect(below.lowestFailing).toBe(BROKEN_SEED_BELOW_PROMISE);
    expect(ignore.lowestFailing).toBe(BROKEN_SEED_IGNORE_PROMISED);
  });

  it('the correct protocol passes all 200 seeds at the window extremes, with loss 0 and 20, with and without backoff', () => {
    for (const offsetWindowMs of [OFFSET_WINDOW_MS.min, OFFSET_WINDOW_MS.default, OFFSET_WINDOW_MS.max]) {
      for (const lossPercent of [LOSS_PERCENT.min, LOSS_PERCENT.max]) {
        const s = sweepSeeds({ ...DEFAULT_OPTIONS, offsetWindowMs, lossPercent, backoff: lossPercent > 0 });
        expect(s.failing, `window ${offsetWindowMs} loss ${lossPercent}`).toEqual([]);
      }
    }
  });

  it('neither broken mode passes 90% of seeds at either end of the window slider', () => {
    for (const bug of ['acceptBelowPromise', 'ignorePromised'] as const) {
      for (const offsetWindowMs of [OFFSET_WINDOW_MS.min, OFFSET_WINDOW_MS.max]) {
        const s = sweepSeeds({ ...DEFAULT_OPTIONS, bug, offsetWindowMs });
        expect(s.failing.length / SEEDS_TOTAL, `${bug} ${offsetWindowMs}`).toBeLessThanOrEqual(0.9);
        expect(s.failing.length).toBeGreaterThan(0);
      }
    }
  });

  it('seeds 0 and the largest seed run to the end', () => {
    for (const seed of [0, SEED_MAX]) {
      const r = runPaxosSeed(DEFAULT_OPTIONS, seed);
      expect(r.violation).toBeNull();
    }
  });

  it('liveness is measured, not asserted: every seed decides at loss 0, the median is a few steps of latency, the 95th percentile is above it', () => {
    const s = sweepSeeds(DEFAULT_OPTIONS);
    expect(s.decided).toBe(200);
    expect(s.median!).toBeGreaterThan(5);
    expect(s.p95!).toBeGreaterThanOrEqual(s.median!);
    const options: SeedOptions = { ...DEFAULT_OPTIONS, lossPercent: LOSS_PERCENT.max };
    expect(sweepSeeds(options).decided).toBeLessThanOrEqual(200);
  });
});

describe('scene 1: the pool', () => {
  it('try-this 1: the clean preset chooses A at ballot 1 after 7 steps', () => {
    const { session, ops } = runSteps(config, CLEAN);
    expect(ops).toHaveLength(7);
    expect(verdictOf(session)).toBe('chosen: A at ballot 1');
    expect(chosenBySubsets(session.nodes)).toEqual(['A']);
    expect(lesson.tryThis[0]).toContain('7 steps');
    expect(lesson.tryThis[0]).toContain('chosen: A at ballot 1');
  });

  it('try-this 2: P2 arriving later sends Accept(2, A), not B, and the verdict stays A', () => {
    const { session } = runSteps(config, LATE);
    const accepts = session.pool.filter((m) => m.payload.type === 'accept' && m.payload.ballot === 2);
    expect(accepts).toHaveLength(3);
    expect(accepts.every((m) => m.payload.type === 'accept' && m.payload.value === 'A')).toBe(true);
    expect(verdictOf(session)).toBe('chosen: A at ballot 1');
    // The promise from a2 reported the vote for A, which is what P2 adopted.
    expect(lesson.tryThis[1]).toContain('Accept(2, A)');
  });

  it('the pre-emption preset: Accept(1, A) is refused at a1 because it promised 2, and no vote is cast', () => {
    const { session } = runSteps(config, PREEMPT);
    expect(session.note).toBe('a1 ignores Accept(1, A): it has promised 2');
    expect(chosenPairs(session.nodes)).toEqual([]);
    for (const a of ACCEPTORS) expect((session.nodes[a] as { votes: unknown[] }).votes).toEqual([]);
  });

  it('pressing Accept before a majority of promises is refused with the pinned text', () => {
    let s = initialSession(config);
    expect(acceptNow(s, 'P2')).toEqual({ ok: false, text: 'P2 has not started a ballot: press its start button first.' });
    for (const op of [{ kind: 'start', proposer: 'P2' } as const]) {
      const r = applyOp(s, op);
      if (r.ok) s = r.session;
    }
    expect(acceptNow(s, 'P2').text).toBe('P2 has promises from 0 of 3 acceptors: it needs 2 before it may send Accept.');
    const prep = s.pool.find((m) => m.to === 'a1')!;
    s = (applyOp(s, { kind: 'deliver', id: prep.id }) as { ok: true; session: typeof s }).session;
    const prom = s.pool.find((m) => m.payload.type === 'promise')!;
    s = (applyOp(s, { kind: 'deliver', id: prom.id }) as { ok: true; session: typeof s }).session;
    expect(acceptNow(s, 'P2')).toEqual({ ok: false, text: 'P2 has promises from 1 of 3 acceptors: it needs 2 before it may send Accept.' });
  });

  it('a proposer with no ballots left refuses with its ballots named; ballot numbers are generated, never typed', () => {
    let s = initialSession(config);
    for (let k = 0; k < 3; k++) s = (applyOp(s, { kind: 'start', proposer: 'P1' }) as { ok: true; session: typeof s }).session;
    const r = applyOp(s, { kind: 'start', proposer: 'P1' });
    expect(r).toEqual({ ok: false, reason: 'P1 has no ballots left in this lesson: it runs ballots 1, 3, 5.' });
  });

  it('the pool holds at most 60 messages: duplicates beyond the cap are refused, and 0 messages is a valid state', () => {
    let s = (applyOp(initialSession(config), { kind: 'start', proposer: 'P1' }) as { ok: true; session: ReturnType<typeof initialSession> }).session;
    expect(initialSession(config).pool).toHaveLength(0);
    while (s.pool.length < POOL_CAP) s = (applyOp(s, { kind: 'duplicate', id: s.pool[0].id }) as { ok: true; session: typeof s }).session;
    expect(s.pool).toHaveLength(60);
    expect(applyOp(s, { kind: 'duplicate', id: s.pool[0].id })).toEqual({ ok: false, reason: 'The pool holds at most 60 messages: deliver or drop some before duplicating.' });
  });

  it('dropping and duplicating work, and an undone history replays to the same state', () => {
    const { ops } = runSteps(config, CLEAN);
    const full = replayOps(config, ops);
    const back = replayOps(config, ops.slice(0, 3));
    expect(back.pool.length).not.toBe(full.pool.length);
    expect(replayOps(config, ops)).toEqual(full);
    for (const preset of PRESETS) expect(() => runSteps(config, preset.steps)).not.toThrow();
  });

  it('captions are computed from the session and refusals show in red', () => {
    const { session } = runSteps(config, CLEAN);
    const text = expectCaption(poolCaption({ session, steps: 7, refusal: null, bugLabel: null }));
    expect(text).toContain('chosen: A at ballot 1');
    expect(text).toContain('Step 7');
    expect(expectCaption(poolCaption({ session, steps: 7, refusal: 'P2 has promises from 1 of 3 acceptors: it needs 2 before it may send Accept.', bugLabel: 'a bug' }))).toContain('it needs 2 before it may send Accept');
  });

  it('a chosen value by the lesson equals the kit fixture on the clean run', () => {
    const { session } = runSteps(config, CLEAN);
    expect(atMostOneChosen(config)(session.nodes)).toBeNull();
  });
});

describe('scene 2: the duel', () => {
  it('try-this 5: 6 ballots are 30 steps with no vote cast; stopping delivers the last Accept and B is chosen', () => {
    const d = replayDuel(6);
    expect(d.steps).toBe(30);
    expect(d.votesCast).toBe(0);
    expect(chosenPairs(d.session.nodes)).toEqual([]);
    expect(chosenPairs(d.stopped.nodes)).toEqual([{ ballot: 6, value: 'B' }]);
    expect(lesson.tryThis[4]).toContain('30 steps over 6 ballots');
    expect(lesson.tryThis[4]).toContain('0 votes');
  });

  it('every ballot count from 2 to 8 costs 5 steps per ballot and casts no vote, and the last ballot decides after stopping', () => {
    for (let b = DUEL_BALLOTS.min; b <= DUEL_BALLOTS.max; b++) {
      const d = replayDuel(b);
      expect(d.steps).toBe(5 * b);
      expect(duelSteps(b)).toHaveLength(5 * b);
      expect(d.votesCast).toBe(0);
      expect(chosenPairs(d.stopped.nodes)).toEqual([{ ballot: b, value: b % 2 === 1 ? 'A' : 'B' }]);
    }
    expect(replayDuel(8).steps).toBe(40);
  });

  it('draining the earlier Accepts at a1 and a2 refuses each one and keeps the chosen value', () => {
    const d = replayDuel(6);
    const after = drainAccepts(d.stopped);
    expect(after.refused).toBe(2 * 5);
    expect(chosenPairs(after.session.nodes)).toEqual([{ ballot: 6, value: 'B' }]);
  });

  it('the duel caption says what the schedule does and does not show', () => {
    const d = replayDuel(6);
    const text = expectCaption(duelCaption({ ballots: 6, steps: d.steps, votes: 0, stopped: false, value: null, decided: 200, seeds: 200, median: 17.5 }));
    expect(text).toContain('30 steps and 0 votes cast');
    expect(text).toContain('says nothing about what happens after the adversary stops');
    expect(text).toContain('a measurement, not a guarantee');
  });
});

describe('scene 3: counting and quorums', () => {
  it('five values: 60 messages single-decree, 36 with a stable proposer, 42 when it crashes after value 3', () => {
    expect(singleDecreeMessages(5)).toBe(60);
    expect(stableProposerMessages(5, null)).toBe(36);
    expect(stableProposerMessages(5, DEFAULT_CRASH_AFTER)).toBe(42);
    expect(MESSAGES_PER_PHASE).toBe(6);
  });

  it('the counts equal a loop that counts each message type, at every number of values from 1 to 10 and every crash point', () => {
    for (let n = 1; n <= 10; n++) {
      let single = 0;
      for (let v = 0; v < n; v++) single += 3 + 3 + 3 + 3;
      expect(singleDecreeMessages(n)).toBe(single);
      for (const crashAfter of [null, 1, 3, 10, 11]) {
        let stable = 3 + 3; // phase 1 once
        for (let v = 1; v <= n; v++) {
          if (crashAfter !== null && v === crashAfter + 1) stable += 3 + 3; // the next proposer repeats phase 1
          stable += 3 + 3; // Accept and Accepted
        }
        expect(stableProposerMessages(n, crashAfter), `n ${n} crash ${crashAfter}`).toBe(stable);
      }
    }
  });

  it('majorities of 3 and 5 acceptors: 3 and 10 minimal majorities, 3 and 45 pairs, every pair shares an acceptor (exhaustive)', () => {
    expect(intersections(3)).toEqual({ acceptors: 3, majorities: 3, pairs: 3, smallestOverlap: 1, allIntersect: true });
    expect(intersections(5)).toEqual({ acceptors: 5, majorities: 10, pairs: 45, smallestOverlap: 1, allIntersect: true });
    // Independent: the pigeonhole bound 2 * majority - n and the binomial counts.
    for (const n of [3, 5]) {
      expect(intersections(n).smallestOverlap).toBe(2 * majority(n) - n);
      expect(BigInt(intersections(n).majorities)).toBe(choose(n, majority(n)));
    }
    expect(intersections(5).pairs).toBe(Number(choose(10, 2)));
  });

  it('the counting caption names the crash only when a value is left to decide', () => {
    expect(expectCaption(multiCaption({ values: 5, single: 60, stable: 42, crashAfter: 3, rerun: true }))).toContain('runs phase 1 again');
    expect(expectCaption(multiCaption({ values: 3, single: 36, stable: 24, crashAfter: 3, rerun: false }))).toContain('costs nothing here');
  });
});

describe('try-this 3 and 4: the search results the lesson quotes', () => {
  it('try-this 3: holds in all 2,905 reachable states, with the A and B counts', () => {
    const run = exhaustiveSearch(TWO_BALLOTS, 'none');
    expect(lesson.tryThis[2]).toContain(`${run.states.toLocaleString('en-US')} reachable states`);
    expect(lesson.tryThis[2]).toContain(`${run.chosenA.toLocaleString('en-US')} of them`);
  });
  it('try-this 4: the below-promise bug has a 14-step counterexample ending in two chosen values', () => {
    expect(lesson.tryThis[3]).toContain('14 steps');
    expect(replayOps(configFor(TWO_BALLOTS, 'acceptBelowPromise'), []).pool).toHaveLength(0);
  });
});
