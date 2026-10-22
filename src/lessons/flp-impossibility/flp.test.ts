import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forSeeds } from '../../core/distSim';
import {
  AND_TABLE, ALL_TABLES, BROKEN_SEED, INPUT_VECTORS, OR_TABLE, PROCS, SCENARIOS, SEED_RANGE, SEEDS_TOTAL, agreementOnlySurvivors, agreementRule, deliveriesIn,
  patternRows, pinnedRuleSet, runSeed, runSeeds, scenarioCounts, seededInputs, seededScenario, shortestDisagreement, symmetric, tryPerProcessRules,
  trySymmetricRules, type Bit, type Inputs, type RuleTable,
} from './onePhase';
import {
  CYCLE_WITNESS, DELIVERIES_PER_ROUND, MAX_REPEATS, START_INPUTS, allChoices, choicesFromGrid, cyclingChoices, exhaustive, pinnedTakeRefusal, playRound,
  assistChoices, repeatRounds, sameConfiguration, searchFor, take, takes, togglePick, undecidedCounts, undecidedProbabilities, initialState, type Configuration, type Pair, type RoundChoices,
} from './rounds';
import { DEFAULT_SETUP, decideNow, deliverFromTo, deliverable, noNewsRefusal, replay, sessionValency, sessionVerdict, settle, startSession } from './session';
import { propagateValency } from './valency';
import { configurationView, cycleCaption, decideCaption, escapeCaption, escapeStartText } from './captions';
import captionsSource from './captions.tsx?raw';
import cycleSource from './CycleScene.tsx?raw';
import decideSource from './DecideScene.tsx?raw';
import escapeSource from './EscapeScene.tsx?raw';
import { traceFrames } from '../../core/traceFrames';
import lesson from './index';

const AND = symmetric(AND_TABLE);
const ones = (inputs: readonly Bit[]) => inputs.reduce<number>((a, b) => a + b, 0);

// ---- independent references -------------------------------------------------------------------

/** A reference for scene 1, written differently: process i hears (i + 1 + c) % 3 where c in {0, 1} is its choice. */
function referenceDecisions(table: readonly number[], inputs: readonly number[], choice: readonly number[]): number[] {
  return [0, 1, 2].map((i) => {
    const heard = inputs[(i + 1 + choice[i]) % 3];
    return table[inputs[i] * 2 + heard];
  });
}

function referenceSymmetric() {
  let agreeing = 0;
  let valid = 0;
  let safe = 0;
  for (let n = 0; n < 16; n++) {
    const table = [0, 1, 2, 3].map((k) => (n >> k) & 1);
    let agrees = true;
    let isValid = true;
    for (let v = 0; v < 8; v++) {
      const inputs = [(v >> 2) & 1, (v >> 1) & 1, v & 1];
      for (let c = 0; c < 8; c++) {
        const d = referenceDecisions(table, inputs, [c & 1, (c >> 1) & 1, (c >> 2) & 1]);
        if (new Set(d).size > 1) agrees = false;
        if (new Set(inputs).size === 1 && d.some((x) => x !== inputs[0])) isValid = false;
      }
    }
    if (agrees) agreeing++;
    if (isValid) valid++;
    if (agrees && isValid) safe++;
  }
  return { agreeing, valid, safe };
}

/** Reference for the round rule: plain arrays, one phase at a time, no state machine. */
function referenceRound(est: readonly number[], choices: RoundChoices, coin?: readonly number[]): { est: number[]; decision: (number | null)[]; proposals: (number | null)[] } {
  const proposals = [0, 1, 2].map((i) => {
    const [a, b] = choices.phase1[i];
    return est[a] === est[b] ? est[a] : null;
  });
  const next = [...est];
  const decision: (number | null)[] = [null, null, null];
  for (let i = 0; i < 3; i++) {
    const [a, b] = choices.phase2[i];
    const [x, y] = [proposals[a], proposals[b]];
    if (x !== null && x === y) {
      next[i] = x;
      decision[i] = x;
    } else if (x !== null || y !== null) next[i] = (x ?? y) as number;
    else if (coin) next[i] = coin[i];
  }
  return { est: next, decision, proposals };
}

// ---- scene 1: one round of news -------------------------------------------------------------------

describe('scene 1: the rule search, against a reference written another way', () => {
  it('16 symmetric rules: 2 agree, 4 are valid, none is both (the spec says 0 of 16)', () => {
    const ref = referenceSymmetric();
    expect(trySymmetricRules()).toEqual({ rules: 16, agreeing: ref.agreeing, valid: ref.valid, safe: ref.safe });
    expect(ref).toEqual({ agreeing: 2, valid: 4, safe: 0 });
  });

  it('the two agreeing rules are the constants, and both break validity', () => {
    const agreeing = ALL_TABLES.filter((t) => scenarioCounts(symmetric(t)).disagree === 0);
    expect(agreeing).toEqual([[0, 0, 0, 0], [1, 1, 1, 1]]);
    expect(agreeing.every((t) => scenarioCounts(symmetric(t)).invalid > 0)).toBe(true);
  });

  it('4,096 per-process rules with validity pinned: none agrees on all 64 scenarios', () => {
    expect(tryPerProcessRules()).toEqual({ rules: 4096, safe: 0 });
    // The pinned rule set really pins validity: 00 decides 0 and 11 decides 1 in every table.
    for (let n = 0; n < 4096; n += 37) {
      for (const pair of pinnedRuleSet(n)) for (const t of pair) expect([t[0], t[3]]).toEqual([0, 1]);
    }
  });

  it('with validity NOT pinned, exactly 2 of the 2^24 per-process rules agree on all 64 scenarios, both constants', () => {
    const survivors = agreementOnlySurvivors();
    expect(survivors).toEqual([0, 2 ** 24 - 1]);
  });

  it('the AND rule disagrees on 18 of 64 scenarios: 6 of 8 orders for each of the three vectors with two ones', () => {
    expect(scenarioCounts(AND)).toEqual({ disagree: 18, invalid: 0, scenarios: 64 });
    expect(SCENARIOS).toBe(64);
    for (const inputs of INPUT_VECTORS) {
      const broken = patternRows(inputs, AND).filter((r) => !r.verdict.agree).length;
      expect(broken).toBe(ones(inputs) === 2 ? 6 : 0);
    }
    expect(scenarioCounts(symmetric(OR_TABLE)).disagree).toBe(18);
  });

  it('the pattern table matches the reference on all 64 scenarios for the AND rule', () => {
    for (const inputs of INPUT_VECTORS) {
      for (const row of patternRows(inputs, AND)) {
        const choice = [0, 1, 2].map((i) => {
          const heardIndex = PROCS.indexOf(row.heardFirst[i] as (typeof PROCS)[number]);
          return (heardIndex - i - 1 + 3) % 3;
        });
        expect(row.decisions).toEqual(referenceDecisions(AND_TABLE, inputs, choice));
      }
    }
  });
});

describe('scene 1: valency, two ways', () => {
  /** A memoised depth-first search over the session's own deliveries: no use of the propagation code. */
  function reachable(session: ReturnType<typeof startSession>, memo = new Map<string, Set<string>>()): Set<string> {
    const key = JSON.stringify(session.net.nodes.map((n) => n.decision)) + JSON.stringify(session.net.net.map((m) => m.key));
    const hit = memo.get(key);
    if (hit) return hit;
    const found = new Set<string>();
    const decided = session.net.nodes.map((n) => n.decision).filter((d) => d !== null);
    decided.forEach((d) => found.add(`v${d}`));
    if (decided.includes(0) && decided.includes(1)) found.add('split');
    memo.set(key, found);
    for (let k = 0; k < deliverable(session).length; k++) {
      const next = replayOne(session, k);
      for (const f of reachable(next, memo)) found.add(f);
    }
    return found;
  }
  const replayOne = (s: ReturnType<typeof startSession>, k: number) => {
    const t = deliverable(s)[k];
    return { ...s, net: t.next, deliveries: s.deliveries + 1 };
  };

  it('backward propagation equals the memoised search on all 16 rules x 8 inputs (128 graphs)', () => {
    let bivalent = 0;
    for (const table of ALL_TABLES) {
      for (const inputs of INPUT_VECTORS) {
        const session = startSession({ inputs, mode: 'one', rules: symmetric(table) });
        const analysis = sessionValency(session);
        const oracle = reachable(session);
        const expected = oracle.has('v0') && oracle.has('v1') ? 'bivalent' : oracle.has('v0') ? '0-valent' : oracle.has('v1') ? '1-valent' : 'undecided';
        expect(analysis.valency, `${table.join('')} ${inputs.join('')}`).toBe(expected);
        expect(analysis.disagreementReachable).toBe(oracle.has('split'));
        if (expected === 'bivalent') bivalent++;
      }
    }
    expect(bivalent).toBeGreaterThan(20);
  });

  it('the explorer finds a disagreement exactly when some delivery pattern disagrees, for all 128 configurations', () => {
    for (const table of ALL_TABLES) {
      for (const inputs of INPUT_VECTORS) {
        const reachableByPattern = patternRows(inputs, symmetric(table)).some((r) => !r.verdict.agree);
        expect(sessionValency(startSession({ inputs, mode: 'one', rules: symmetric(table) })).disagreementReachable).toBe(reachableByPattern);
      }
    }
  });

  it('the default configuration (inputs 1 1 0, AND) is bivalent and a disagreement is reachable', () => {
    const v = sessionValency(replay(DEFAULT_SETUP));
    expect(v.valency).toBe('bivalent');
    expect(v.disagreementReachable).toBe(true);
  });

  it('wait-for-all is univalent on every input vector (the majority) and never disagrees', () => {
    for (const inputs of INPUT_VECTORS) {
      const v = sessionValency(startSession({ inputs, mode: 'all', rules: AND }));
      expect(v.valency).toBe(ones(inputs) >= 2 ? '1-valent' : '0-valent');
      expect(v.disagreementReachable).toBe(false);
    }
  });
});

describe('scene 1 and 3: the timeout protocol breaks, the safe one does not, the harnesses agree', () => {
  const explored = shortestDisagreement({ inputs: [1, 1, 0], mode: 'one', rules: AND });

  it('the shortest disagreement has 2 deliveries, and BFS finds nothing shorter', () => {
    expect(explored.violation).not.toBeNull();
    expect(deliveriesIn(explored.violation!.path)).toBe(2);
    expect(explored.violation!.path).toHaveLength(2);
    expect(explored.violation!.message).toMatch(/^disagreement/);
  });

  it('BROKEN_SEED is the lowest failing seed of forSeeds, for the rule the lesson names, and is not 0', () => {
    const verdict = forSeeds(SEED_RANGE, seededScenario('one', AND), [agreementRule]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.seed).toBe(BROKEN_SEED);
    expect(BROKEN_SEED).toBeGreaterThan(0);
    expect(verdict.rule).toBe(0);
    expect(verdict.message).toMatch(/^disagreement/);
    expect(runSeed('one', AND, BROKEN_SEED).broken).toMatch(/^disagreement/);
  });

  it('the timeout protocol fails on 58 of 200 seeds (29%), inside the 20 to 40% band and under 90%', () => {
    const result = runSeeds('one', AND);
    expect(result.failing).toHaveLength(58);
    expect(result.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.2);
    expect(result.failing.length / SEEDS_TOTAL).toBeLessThan(0.4);
    expect(result.failing[0]).toBe(BROKEN_SEED);
    expect(result.undecided).toBe(0);
  });

  it('wait for all three passes the same 200 seeds, and with one process held back 200 of 200 seeds have no decision', () => {
    expect(forSeeds(SEED_RANGE, seededScenario('all', AND), [agreementRule])).toEqual({ ok: true, seeds: 200 });
    const crashed = runSeeds('all', AND, 2);
    expect(crashed.failing).toHaveLength(0);
    expect(crashed.undecided).toBe(200);
    expect(runSeeds('all', AND).undecided).toBe(0);
  });

  it('the seeds draw all eight input vectors, so the 29% is over mixed inputs, not one', () => {
    const seen = new Set<string>();
    for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) seen.add((seededInputs(seed) as Inputs).join(''));
    expect(seen.size).toBe(8);
  });
});

describe('scene 1: manipulations', () => {
  it('manipulation 1: editing a rule cell and trying every delivery order reports the violated property and a schedule', () => {
    const flipped = DEFAULT_SETUP.table.map((b, k) => (k === 3 ? 0 : b)) as unknown as RuleTable; // D(1,1) = 0: breaks validity on 1 1 1
    const counts = scenarioCounts(symmetric(flipped));
    expect(counts.invalid).toBeGreaterThan(0);
    const rows = patternRows([1, 1, 1], symmetric(flipped));
    expect(rows.every((r) => !r.verdict.valid)).toBe(true);
    const sd = shortestDisagreement({ inputs: [1, 1, 0], mode: 'one', rules: AND });
    expect(sd.violation!.path.map((p) => p.label.text)).toHaveLength(2);
  });

  it('manipulation 5: picking the two deliveries that show P1 and P2 different news makes the configuration disagree', () => {
    let s = replay(DEFAULT_SETUP);
    expect(sessionVerdict(s).broken).toBeNull();
    s = deliverFromTo(s, 'P0', 'P1');
    expect(sessionVerdict(s).broken).toBeNull();
    s = deliverFromTo(s, 'P0', 'P2');
    expect(sessionVerdict(s).broken).toMatch(/^disagreement/);
    expect(s.deliveries).toBe(2);
    expect(s.net.nodes.map((n) => n.decision)).toEqual([null, 1, 0]);
  });

  it('manipulation 6: asking a process with no news to decide is refused with the pinned text', () => {
    const s = replay(DEFAULT_SETUP);
    expect(decideNow(s, 2)).toEqual({ ok: false, text: 'P2 has heard no one yet: it has nothing to decide from.' });
    expect(noNewsRefusal(0)).toBe('P0 has heard no one yet: it has nothing to decide from.');
    const heard = deliverFromTo(s, 'P0', 'P1');
    expect(decideNow(heard, 1).text).toBe('P1 already decided 1.');
  });

  it('manipulation 4: switching to wait for all three and crashing one process reports no decision within the deliveries made', () => {
    const stuck = settle(startSession({ inputs: [1, 1, 0], mode: 'all', rules: AND }, 2));
    const verdict = sessionVerdict(stuck);
    expect(verdict.stuck).toBe(true);
    expect(verdict.undecided).toEqual(['P0', 'P1']);
    expect(stuck.deliveries).toBe(2);
    // Without the crash the same protocol decides on every delivery order.
    const fine = settle(startSession({ inputs: [1, 1, 0], mode: 'all', rules: AND }));
    expect(sessionVerdict(fine).undecided).toEqual([]);
  });
});

// ---- scene 2: the safe protocol that does not terminate -----------------------------------------------

describe('scene 2: the round', () => {
  const start = (est: Bit[]): Configuration => ({ est, decision: [null, null, null] });

  it('the witness round from inputs 0 0 1: every process proposes bottom, nobody decides, and the configuration returns to the start in 12 deliveries', () => {
    const outcome = playRound(start([0, 0, 1]), CYCLE_WITNESS);
    expect(outcome.proposals).toEqual([null, null, null]);
    expect(outcome.after).toEqual(start([0, 0, 1]));
    expect(sameConfiguration(outcome.after, start([0, 0, 1]))).toBe(true);
    expect(DELIVERIES_PER_ROUND).toBe(3 * 2 * 2);
    // Hand check, as in the spec: P0 takes 0 and 1 (differ), P1 takes 0 and 1, P2 takes 1 and 0.
    expect(CYCLE_WITNESS.phase1).toEqual([[0, 2], [1, 2], [0, 2]]);
  });

  it('the round rule equals a reference written with plain arrays, on all 729 schedules x 8 estimate vectors, with and without coins', () => {
    for (const choices of allChoices()) {
      for (const inputs of INPUT_VECTORS) {
        const real = playRound(start([...inputs]), choices);
        const ref = referenceRound(inputs, choices);
        expect(real.after.est).toEqual(ref.est);
        expect(real.after.decision).toEqual(ref.decision);
        expect(real.proposals).toEqual(ref.proposals);
        const coin: Bit[] = [1, 0, 1];
        expect(playRound(start([...inputs]), choices, (i) => coin[i]).after.est).toEqual(referenceRound(inputs, choices, coin).est);
      }
    }
  });

  it('two different non-bottom proposals never coexist, and decisions never disagree (the pigeonhole step, over every schedule)', () => {
    for (const choices of allChoices()) {
      for (const inputs of INPUT_VECTORS) {
        const o = playRound(start([...inputs]), choices);
        const nonBottom = new Set(o.proposals.filter((p) => p !== null));
        expect(nonBottom.size).toBeLessThanOrEqual(1);
        expect(new Set(o.after.decision.filter((d) => d !== null)).size).toBeLessThanOrEqual(1);
      }
    }
  });

  it('324 of the 729 round schedules cycle from 0 0 1 (found by trying all of them), and the witness is one of them', () => {
    const cycling = cyclingChoices([0, 0, 1]);
    expect(allChoices()).toHaveLength(729);
    expect(cycling).toHaveLength(324);
    expect(cycling).toContainEqual(CYCLE_WITNESS);
    // Independent recount with the reference round.
    const ref = allChoices().filter((c) => {
      const r = referenceRound([0, 0, 1], c);
      return r.decision.every((d) => d === null) && r.est.join('') === '001';
    });
    expect(ref).toHaveLength(324);
  });

  it('repeating the witness 50 times asserts equality with the start every time and no decision in 600 deliveries', () => {
    const run = repeatRounds(start([0, 0, 1]), CYCLE_WITNESS, MAX_REPEATS);
    expect(run.decidedIn).toBeNull();
    expect(run.rounds).toHaveLength(50);
    expect(run.rounds.every((r) => sameConfiguration(r.after, start([0, 0, 1])))).toBe(true);
    expect(run.rounds.length * DELIVERIES_PER_ROUND).toBe(600);
    expect(repeatRounds(start([0, 0, 1]), CYCLE_WITNESS, 1).rounds).toHaveLength(1);
  });

  it('a schedule that lets P0 and P1 take each other decides: the same inputs, a different adversary', () => {
    const decide: RoundChoices = { phase1: [[0, 1], [0, 1], [0, 1]], phase2: [[0, 1], [0, 1], [0, 1]] };
    const run = repeatRounds(start([0, 0, 1]), decide, 5);
    expect(run.decidedIn).toBe(1);
    expect(run.rounds[0].after.decision).toEqual([0, 0, 0]);
  });
});

describe('scene 2: manipulations', () => {
  it('manipulation 3: a third pick in a cell is refused with the pinned text, and the cell keeps its two picks', () => {
    const two = togglePick([], 0, 0);
    expect(two).toEqual({ ok: true, picks: [0] });
    const full = togglePick([0], 0, 2);
    expect(full).toEqual({ ok: true, picks: [0, 2] });
    if (!full.ok) return;
    const third = togglePick(full.picks, 0, 1);
    expect(third).toEqual({ ok: false, reason: 'P0 already took 2 messages in this phase and moved on; late messages are ignored in this toy.' });
    expect(pinnedTakeRefusal(2)).toBe('P2 already took 2 messages in this phase and moved on; late messages are ignored in this toy.');
    expect(togglePick(full.picks, 0, 2)).toEqual({ ok: true, picks: [0] });
  });

  it('manipulation 2: playing the witness choices leaves everyone undecided and returns to the start configuration', () => {
    const picks = (pairs: readonly Pair[]) => pairs.map((p) => [...p]);
    const choices = choicesFromGrid(picks(CYCLE_WITNESS.phase1), picks(CYCLE_WITNESS.phase2));
    expect(choices).toEqual(CYCLE_WITNESS);
    const run = repeatRounds({ est: [0, 0, 1], decision: [null, null, null] }, choices!, 1);
    expect(run.decidedIn).toBeNull();
    expect(sameConfiguration(run.rounds[0].after, { est: [0, 0, 1], decision: [null, null, null] })).toBe(true);
  });

  it('an incomplete grid is not a round yet', () => {
    expect(choicesFromGrid([[0, 1], [], [1, 2]], [[0, 1], [0, 1], [0, 1]])).toBeNull();
  });

  it('a take is refused when the message does not exist yet or was already taken', () => {
    const s = initialState([0, 0, 1]);
    const first = take(s, 0, 1, 2);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(take(first.state, 0, 1, 2)).toEqual({ ok: false, reason: "P0 already took P1's message in this phase." });
    // P0 moves on to phase 2 after a second take; P2's phase-2 proposal does not exist until P2 finished phase 1.
    const second = take(first.state, 0, 0, 2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(take(second.state, 0, 2, 2)).toEqual({ ok: false, reason: 'P2 has not sent its round 1 proposal yet.' });
  });
});

describe('scene 2: the exhaustive search (the explorer, every interleaving of takes)', () => {
  it('R = 1: 2,372 states and R = 2: 33,551, none with two different decisions; 112 of 135 final configurations undecided at R = 2', () => {
    // The counts equal the spec author's independent scratch run (2,372 and 33,551), written with its own model code.
    const one = exhaustive([0, 0, 1], 1);
    expect(one).toMatchObject({ states: 2372, truncated: false, disagreements: 0 });
    const two = exhaustive([0, 0, 1], 2);
    expect(two).toMatchObject({ states: 33551, truncated: false, disagreements: 0, terminal: 135, terminalUndecided: 112 });
  });

  it('every one of the eight input vectors is univalent within 2 rounds, 0-valent with a majority of zeros and 1-valent otherwise', () => {
    for (const inputs of INPUT_VECTORS) {
      const r = searchFor(inputs, 2);
      expect(r.valency, inputs.join('')).toBe(ones(inputs) >= 2 ? '1-valent' : '0-valent');
      expect(r.disagreements).toBe(0);
      expect(r.truncated).toBe(false);
    }
  });

  it('the explorer and a second propagation agree on the valency of all eight R = 1 graphs', () => {
    for (const inputs of INPUT_VECTORS) {
      const memo = new Map<string, number>();
      const decidedMask = (procs: ReturnType<typeof initialState>['procs']) => procs.reduce((m, p) => (p.decision === null ? m : m | (p.decision === 0 ? 1 : 2)), 0);
      const walk = (s: ReturnType<typeof initialState>): number => {
        const key = JSON.stringify(s.procs);
        const hit = memo.get(key);
        if (hit !== undefined) return hit;
        let mask = decidedMask(s.procs);
        for (const t of takes(s, 1)) mask |= walk(t.next);
        memo.set(key, mask);
        return mask;
      };
      const mask = walk(initialState(inputs));
      const expected = mask === 3 ? 'bivalent' : mask === 1 ? '0-valent' : mask === 2 ? '1-valent' : 'undecided';
      expect(exhaustive(inputs, 1).valency).toBe(expected);
    }
  });

  it('propagateValency labels a hand-built two-branch graph bivalent at the root', () => {
    const graph = { states: ['root', 'a', 'b'], edges: [[{ to: 1, label: null }, { to: 2, label: null }], [], []] };
    const decided: Record<string, Bit[]> = { root: [], a: [0], b: [1] };
    expect(propagateValency(graph, (s) => decided[s]).valency).toBe('bivalent');
  });
});

describe('scene 3: the coin', () => {
  it('the exact probability that nobody has decided after round r is 2^-(r-1), by dynamic programming over estimate vectors', () => {
    const p = undecidedProbabilities([0, 0, 1], CYCLE_WITNESS, 8);
    p.forEach((x, r) => expect(x).toBeCloseTo(2 ** -r, 12));
    expect(p[3]).toBe(0.125);
    expect(p[7]).toBe(0.0078125);
  });

  it('the same fixed schedule without a coin is undecided with probability 1 in every round (the cycle)', () => {
    expect(repeatRounds({ est: [0, 0, 1], decision: [null, null, null] }, CYCLE_WITNESS, 8).decidedIn).toBeNull();
  });

  it('measured over 1,000 seeded coin runs, each round is within 3 standard errors of the exact value', () => {
    const exact = undecidedProbabilities([0, 0, 1], CYCLE_WITNESS, 8);
    const counts = undecidedCounts([0, 0, 1], CYCLE_WITNESS, 8, 1000);
    counts.forEach((k, r) => {
      const p = exact[r];
      const se = Math.sqrt((p * (1 - p)) / 1000);
      expect(Math.abs(k / 1000 - p), `round ${r + 1}`).toBeLessThanOrEqual(3 * se + 1e-12);
    });
    expect(counts[0]).toBe(1000);
  });
});

// ---- the lesson's text -------------------------------------------------------------------------------------

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: P0 to P1 then P0 to P2 makes P1 decide 1 and P2 decide 0, a disagreement after 2 deliveries', () => {
    let s = replay(DEFAULT_SETUP);
    s = deliverFromTo(deliverFromTo(s, 'P0', 'P1'), 'P0', 'P2');
    expect(s.net.nodes.map((n) => n.decision)).toEqual([null, 1, 0]);
    expect(s.deliveries).toBe(2);
    expect(sessionVerdict(s).broken).toMatch(/^disagreement/);
    expect(decideNow(replay(DEFAULT_SETUP), 2).ok).toBe(false);
    const caption = expectCaption(decideCaption({ setup: DEFAULT_SETUP, session: s, valency: sessionValency(s).valency, disagreementReachable: true, verdict: sessionVerdict(s), decisions: [null, 1, 0], terminal: false }));
    expect(caption).toContain('2 deliveries');
    expect(lesson.tryThis[0]).toContain('2 deliveries');
  });

  it('try-this 2: 6 of 8 orders and 18 of 64 scenarios break agreement; 0 of 16 and 0 of 4,096 rules survive', () => {
    expect(patternRows([1, 1, 0], AND).filter((r) => !r.verdict.agree)).toHaveLength(6);
    expect(scenarioCounts(AND).disagree).toBe(18);
    expect(lesson.tryThis[1]).toContain('6 of 8 orders');
    expect(lesson.tryThis[1]).toContain('18 of 64 scenarios');
    expect(lesson.tryThis[1]).toContain('0 of 16 symmetric rules and 0 of 4,096 per-process rules');
  });

  it('try-this 3: wait for all three agrees on every order, and crashing P2 leaves P0 and P1 undecided within 2 deliveries', () => {
    expect(patternRows([1, 1, 0], AND, 'all').every((r) => r.verdict.agree && r.decisions.every((d) => d === 1))).toBe(true);
    const stuck = settle(startSession({ inputs: [1, 1, 0], mode: 'all', rules: AND }, 2));
    expect(stuck.deliveries).toBe(2);
    expect(lesson.tryThis[2]).toContain('within 2 deliveries');
    const caption = expectCaption(decideCaption({ setup: { ...DEFAULT_SETUP, mode: 'all', silent: 2 }, session: stuck, valency: 'undecided', disagreementReachable: false, verdict: sessionVerdict(stuck), decisions: [null, null, null], terminal: true }));
    expect(caption).toContain('did not decide within 2 deliveries');
  });

  it('try-this 4: Assist then Play round reads same configuration yes; repeating 10 times is 120 deliveries and no decision', () => {
    const start: Configuration = { est: [...START_INPUTS], decision: [null, null, null] };
    const run = repeatRounds(start, CYCLE_WITNESS, 10);
    expect(run.decidedIn).toBeNull();
    expect(sameConfiguration(run.rounds[0].after, start)).toBe(true);
    expect(run.rounds.length * DELIVERIES_PER_ROUND).toBe(120);
    expect(lesson.tryThis[3]).toContain('120 deliveries');
    expect(expectCaption(cycleCaption({ inputs: START_INPUTS, choices: CYCLE_WITNESS, run, same: true, repeats: 10, cycling: 324 }))).toContain('120 deliveries so far and no decision');
  });

  it('try-this 5: the coin table reads 0.125 for round 4 and a measured count of 1,000 seeds beside it', () => {
    const exact = undecidedProbabilities(START_INPUTS, CYCLE_WITNESS, 8);
    const measured = undecidedCounts(START_INPUTS, CYCLE_WITNESS, 8, 1000);
    expect(exact[3]).toBe(0.125);
    expect(lesson.tryThis[4]).toContain('0.125');
    expect(lesson.tryThis[4]).toContain(`${measured[3]} of 1,000 seeds`);
    const run = runSeed('one', AND, BROKEN_SEED);
    const caption = expectCaption(escapeCaption({ seed: BROKEN_SEED, run, failing: 58, lowest: BROKEN_SEED, deliveries: 2, coin: true, exact, plainDecided: null }));
    expect(caption).toContain('0.125');
    expect(caption).toContain('58 of 200 seeds');
  });
});

describe('every control at its extremes and one beyond', () => {
  it('all 8 inputs x 16 rules x both protocols build a session, a valency and a verdict without throwing', () => {
    for (const mode of ['one', 'all'] as const) {
      for (const table of ALL_TABLES) {
        for (const inputs of INPUT_VECTORS) {
          for (const silent of [null, 0, 1, 2]) {
            const s = startSession({ inputs, mode, rules: symmetric(table) }, silent);
            expect(sessionValency(s).states).toBeGreaterThan(0);
            expect(sessionVerdict(s)).toBeDefined();
          }
        }
      }
    }
  });

  it('delivering past the end of the pending list changes nothing', () => {
    const s = replay(DEFAULT_SETUP);
    expect(deliverFromTo(s, 'P1', 'P1')).toBe(s);
    const done = settle(s);
    expect(deliverable(done)).toHaveLength(0);
    expect(settle(done)).toBe(done);
  });

  it('seeds 0 and the largest seed run to the end without breaking the model', () => {
    for (const seed of [0, 2 ** 31 - 1]) {
      const r = runSeed('one', AND, seed);
      expect(r.decisions).toHaveLength(3);
    }
  });
});

describe('fix pass T4-B4: captions and chips are functions of the model state', () => {
  const sources: Record<string, string> = { 'captions.tsx': captionsSource, 'CycleScene.tsx': cycleSource, 'DecideScene.tsx': decideSource, 'EscapeScene.tsx': escapeSource };
  const read = (f: string) => sources[f];

  /** Every session reachable by delivering messages, for each mode and held-back choice (breadth first, deduplicated by pick path). */
  function* everySession(): Generator<ReturnType<typeof startSession>> {
    for (const mode of ['one', 'all'] as const) {
      for (const silent of [null, 0, 1, 2]) {
        const frontier = [startSession({ inputs: [1, 1, 0], mode, rules: AND }, silent)];
        while (frontier.length > 0) {
          const s = frontier.pop()!;
          yield s;
          deliverable(s).forEach((_, k) => frontier.push(settleOne(s, k)));
        }
      }
    }
  }
  const settleOne = (s: ReturnType<typeof startSession>, k: number) => {
    const t = deliverable(s)[k];
    return deliverFromTo(s, t.label.message!.from, t.label.message!.to);
  };

  it('a finished configuration is never called bivalent or "can still be decided" (reachable sessions of both protocols)', () => {
    let finished = 0;
    for (const s of everySession()) {
      const v = sessionValency(s);
      const decisions = s.net.nodes.map((n) => n.decision);
      const view = configurationView({ valency: v.valency, terminal: deliverable(s).length === 0, decisions });
      if (deliverable(s).length === 0 && decisions.some((d) => d !== null)) {
        finished++;
        expect(view.chip.startsWith('finished')).toBe(true);
        expect(view.stat).toBe('finished');
        expect(view.chip).not.toMatch(/valent/);
      } else {
        expect(view.chip).not.toMatch(/still be decided/);
      }
    }
    expect(finished).toBeGreaterThan(10);
  });

  it('a finished run with a disagreement says so, and one that agreed does not', () => {
    const done = settle(replay(DEFAULT_SETUP));
    const decisions = done.net.nodes.map((n) => n.decision);
    const view = configurationView({ valency: 'bivalent', terminal: true, decisions });
    expect(new Set(decisions.filter((d) => d !== null)).size).toBe(2);
    expect(view.chip).toContain('disagreement');
    const agreed = configurationView({ valency: '1-valent', terminal: true, decisions: [1, 1, 1] });
    expect(agreed.chip).not.toContain('disagreement');
  });

  it('the refusal for P2 is worked out from the session: it is gone once P2 has heard P0 and decided', () => {
    const before = replay(DEFAULT_SETUP);
    expect(decideNow(before, 2).text).toBe(noNewsRefusal(2));
    const after = deliverFromTo(before, 'P0', 'P2');
    expect(after).not.toBe(before);
    expect(decideNow(after, 2).text).not.toContain('heard no one');
    expect(decideNow(after, 2).text).toBe('P2 already decided 0.');
    const source = read('DecideScene.tsx');
    expect(source).toContain('decideNow(session, probeProc)');
    expect(source).not.toMatch(/useState<\{ ok: boolean; text: string \}/);
  });

  it('M1: the scene-1 theorem label says guarantees both agreement and termination', () => {
    const source = read('DecideScene.tsx');
    expect(source).toContain('no deterministic protocol guarantees both agreement and termination');
    expect(source).not.toContain('no deterministic protocol decides');
  });

  it('M9: the trace player opens on the scene sentence, not "start"', () => {
    const text = escapeStartText({ inputs: [1, 1, 0], failing: 58, seeds: 200, deliveries: 2 });
    expect(text).toContain('58 of 200 seeds');
    expect(text).toContain('2 deliveries');
    expect(traceFrames({}, [], text)[0].say).toBe(text);
    expect(read('EscapeScene.tsx')).toContain('startText={escapeStartText(');
  });

  it('Assist loads a round only when one cycles: the ring from 0 0 1, nothing from 0 0 0 and 1 1 1', () => {
    expect(JSON.stringify(assistChoices(START_INPUTS))).toBe(JSON.stringify(CYCLE_WITNESS));
    expect(assistChoices([0, 0, 0])).toBeNull();
    expect(assistChoices([1, 1, 1])).toBeNull();
    for (const v of INPUT_VECTORS) {
      const found = assistChoices(v);
      expect(found === null).toBe(cyclingChoices(v).length === 0);
    }
  });

  it('every highlighted caption span can wrap on a phone', () => {
    for (const f of ['captions.tsx', 'DecideScene.tsx', 'CycleScene.tsx', 'EscapeScene.tsx']) {
      for (const m of read(f).matchAll(/className=(?:"|\{`)(hl[^"`]*)/g)) expect(m[1], f).toContain('wrap');
    }
  });

  it('the exhaustive-facts table scrolls inside a WideRegion', () => {
    expect(read('CycleScene.tsx')).toMatch(/<WideRegion minWidth=\{FACTS_TABLE_MIN_WIDTH\} noun="table">/);
  });

  it('the quiz answer is option B in at most two of five questions', () => {
    expect(lesson.quiz.filter((q) => q.answer === 1).length).toBeLessThanOrEqual(2);
  });
});
