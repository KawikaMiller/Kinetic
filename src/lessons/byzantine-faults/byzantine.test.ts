import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forSeeds } from '../../core/distSim';
import { choose } from '../../core/stats';
import { SEED_MAX } from '../../core/seed';
import { quorumCaption, signedCaption, traitorCaption } from './captions';
import lesson from './index';
import {
  ATTACK, COMMANDER, DEFAULT_TRAITOR_STATE, ONE_TRAITOR_REFUSAL, RETREAT, behaviourOfState, behaviours, breakText, chooseTraitor, held, judge, majorityRuleNumber,
  runOm, seededSetup, setupOf, setupOfState, tryEveryBehaviour, tryEveryRule, type Bit,
} from './om';
import {
  BROKEN_SEED_OM1, BROKEN_SEED_OM2, RULES, SEED_RANGE, SEEDS_TOTAL, omScenario, referenceDecisions, runOmSeed, sweepOm,
} from './omNodes';
import { F_RANGE, MAX_NODES, nodeRange, quorumOverlap } from './quorums';
import { decideSigned, runSigned, signedBehaviours, trySignedBehaviours, type SignedBehaviour } from './signed';

// ---- an independent OM(1), written with plain arrays -------------------------------------------------------------

/** One traitor, n generals, binary values: what every loyal lieutenant decides, computed from scratch. */
function referenceOm1(n: number, traitor: number, order: number, bits: readonly number[]): { loyal: number[]; decisions: number[] } {
  const lieutenants = Array.from({ length: n - 1 }, (_, k) => k + 1);
  const audience = (t: number) => lieutenants.filter((l) => l !== t);
  const fromCommander = lieutenants.map((l) => (traitor === 0 ? bits[l - 1] : order));
  const relay = (j: number, i: number) => (traitor === j ? bits[audience(j).indexOf(i)] : fromCommander[j - 1]);
  const decisions = lieutenants.map((i) => {
    const values = [fromCommander[i - 1], ...lieutenants.filter((j) => j !== i).map((j) => relay(j, i))];
    return values.filter((v) => v === 1).length * 2 > values.length ? 1 : 0;
  });
  const loyal = lieutenants.filter((l) => l !== traitor);
  return { loyal, decisions: loyal.map((l) => decisions[l - 1]) };
}

const referenceBreaks = (n: number, traitor: number, order: number, bits: readonly number[]): boolean => {
  const { decisions } = referenceOm1(n, traitor, order, bits);
  const ic1 = decisions.every((d) => d === decisions[0]);
  const ic2 = traitor === 0 || decisions.every((d) => d === order);
  return !ic1 || !ic2;
};

describe('OM(1), every traitor behaviour', () => {
  it('n = 3: 12 behaviours, 2 break a rule; n = 4: 32 behaviours, 0 do', () => {
    expect(tryEveryBehaviour(3)).toMatchObject({ total: 12 });
    expect(tryEveryBehaviour(3).breaking).toHaveLength(2);
    expect(tryEveryBehaviour(4)).toMatchObject({ total: 32 });
    expect(tryEveryBehaviour(4).breaking).toHaveLength(0);
  });

  it('the behaviour counts come from the structure: traitor commander 2^(n-1); a traitor lieutenant (n-1) x 2 orders x 2^(n-2)', () => {
    for (const n of [3, 4]) expect(behaviours(n)).toHaveLength(2 ** (n - 1) + (n - 1) * 2 * 2 ** (n - 2));
  });

  it('agrees with the plain-array reference on every behaviour: which ones break, and every decision', () => {
    for (const n of [3, 4]) {
      for (const b of behaviours(n)) {
        const s = setupOf(n, b);
        const run = runOm(s);
        const v = judge(s, run);
        const ref = referenceOm1(n, b.traitor, b.order, b.bits);
        expect([...v.loyal.keys()]).toEqual(ref.loyal);
        expect([...v.loyal.values()]).toEqual(ref.decisions);
        expect(!v.ic1 || !v.ic2).toBe(referenceBreaks(n, b.traitor, b.order, b.bits));
      }
    }
  });

  it('the two breaking behaviours at n = 3 are a lieutenant traitor with order 1 and relay 0, both IC2', () => {
    const breaking = tryEveryBehaviour(3).breaking;
    expect(breaking.map((b) => [b.traitor, b.order, b.bits.join('')])).toEqual([[1, 1, '0'], [2, 1, '0']]);
    for (const b of breaking) {
      const s = setupOf(3, b);
      const v = judge(s, runOm(s));
      expect(v.ic1).toBe(true);
      expect(v.ic2).toBe(false);
    }
    // The mirrored lie, order 0 and relay 1, ties and retreats, which equals the order: it does not break.
    const mirrored = setupOf(3, { traitor: 2, order: RETREAT, bits: [ATTACK] });
    expect(judge(mirrored, runOm(mirrored))).toMatchObject({ ic1: true, ic2: true });
  });

  it('hand vector 1: L1 holds (C: 1, L2: 0), one vote each, a tie, so retreat', () => {
    const s = setupOfState(DEFAULT_TRAITOR_STATE);
    const run = runOm(s);
    expect(held(s, run, 1).map((h) => [h.from, h.value])).toEqual([[0, 1], [2, 0]]);
    expect(run.decisions.get(1)).toBe(0);
    expect(judge(s, run).ic2).toBe(false);
  });

  it('hand vector 2: at n = 4 the same lie is outvoted, L1 holds (C: 1, L2: 0, L3: 1) and decides 1', () => {
    const s = setupOf(4, { traitor: 2, order: ATTACK, bits: [RETREAT, RETREAT] });
    const run = runOm(s);
    expect(held(s, run, 1).map((h) => h.value)).toEqual([1, 0, 1]);
    expect(run.decisions.get(1)).toBe(1);
    expect(run.decisions.get(3)).toBe(1);
    expect(judge(s, run)).toMatchObject({ ic1: true, ic2: true });
  });

  it('hand vector 3: an equivocating commander at n = 3 (1 to L1, 0 to L2) leaves both lieutenants tied and retreating: IC1 holds', () => {
    const s = setupOf(3, { traitor: 0, order: RETREAT, bits: [ATTACK, RETREAT] });
    const run = runOm(s);
    expect(held(s, run, 1).map((h) => h.value)).toEqual([1, 0]);
    expect(held(s, run, 2).map((h) => h.value)).toEqual([0, 1]);
    expect([run.decisions.get(1), run.decisions.get(2)]).toEqual([0, 0]);
    expect(judge(s, run).ic1).toBe(true);
  });

  it('the break text names the conflicting pair and the rule', () => {
    const b = tryEveryBehaviour(3).breaking[1];
    expect(breakText(3, b)).toBe('L1 holds C: 1 and L2: 0, a tie, so retreat; the commander said attack: IC2 broken');
    expect(lesson.tryThis[0]).toContain('L1 holds C: 1 and L2: 0, a tie, so retreat; the commander said attack: IC2 broken');
  });
});

describe('every decision rule', () => {
  /** Reference: a rule is a truth table over (own receipt, relays in lieutenant order); try each against explicit behaviours. */
  function referenceSurvivors(n: number): number[] {
    const arity = n - 1;
    const survivors: number[] = [];
    for (let rule = 0; rule < 2 ** (2 ** arity); rule++) {
      let ok = true;
      for (let traitor = 0; traitor < n && ok; traitor++) {
        const edges = traitor === 0 ? n - 1 : n - 2;
        for (const order of traitor === 0 ? [0] : [0, 1]) {
          for (let mask = 0; mask < 2 ** edges && ok; mask++) {
            const bits = Array.from({ length: edges }, (_, k) => (mask >> k) & 1);
            const lieutenants = Array.from({ length: n - 1 }, (_, k) => k + 1);
            const audience = (t: number) => lieutenants.filter((l) => l !== t);
            const fromC = lieutenants.map((l) => (traitor === 0 ? bits[l - 1] : order));
            const relay = (j: number, i: number) => (traitor === j ? bits[audience(j).indexOf(i)] : fromC[j - 1]);
            const decided = lieutenants.filter((l) => l !== traitor).map((i) => {
              const args = [fromC[i - 1], ...lieutenants.filter((j) => j !== i).map((j) => relay(j, i))];
              return (rule >> args.reduce((a, v) => a * 2 + v, 0)) & 1;
            });
            if (!decided.every((d) => d === decided[0]) || (traitor !== 0 && !decided.every((d) => d === order))) ok = false;
          }
        }
      }
      if (ok) survivors.push(rule);
    }
    return survivors;
  }

  it('n = 3: 0 of 16 rules satisfy IC1 and IC2 on all 12 behaviours (a bounded instance, not the theorem)', () => {
    expect(tryEveryRule(3)).toMatchObject({ n: 3, rules: 16, survivors: [], behaviours: 12 });
    expect(referenceSurvivors(3)).toEqual([]);
  });

  it('n = 4: exactly 1 of 256 rules works, the majority rule, with the spec\'s truth table', () => {
    const search = tryEveryRule(4);
    expect(search.rules).toBe(256);
    expect(search.survivors).toEqual([majorityRuleNumber(3)]);
    expect(referenceSurvivors(4)).toEqual(search.survivors);
    // 000->0 001->0 010->0 011->1 100->0 101->1 110->1 111->1, read as bits 0..7 of the rule number.
    const table = [0, 0, 0, 1, 0, 1, 1, 1];
    expect(search.survivors[0]).toBe(table.reduce((acc, bit, k) => acc | (bit << k), 0));
    expect(lesson.tryThis[3]).toContain('1 of 256');
  });
});

describe('quorum overlaps (scene 2)', () => {
  /** Reference: Sets of node numbers, no bit tricks. */
  function referenceMinOverlap(n: number, f: number): { quorums: number; min: number } {
    const quorums: Set<number>[] = [];
    const walk = (start: number, chosen: number[]) => {
      if (chosen.length === n - f) {
        quorums.push(new Set(chosen));
        return;
      }
      for (let i = start; i < n; i++) walk(i + 1, [...chosen, i]);
    };
    walk(0, []);
    let min = Infinity;
    for (let a = 0; a < quorums.length; a++) for (let b = a + 1; b < quorums.length; b++) min = Math.min(min, [...quorums[a]].filter((x) => quorums[b].has(x)).length);
    return { quorums: quorums.length, min };
  }

  it('the smallest overlap is n - 2f for every (f, n) the sliders offer, equal to a Set-based enumeration', () => {
    for (let f = F_RANGE.min; f <= F_RANGE.max; f++) {
      const { min, max } = nodeRange(f);
      for (let n = min; n <= max; n++) {
        const o = quorumOverlap(n, f);
        const ref = referenceMinOverlap(n, f);
        expect(o.smallestOverlap, `f ${f} n ${n}`).toBe(ref.min);
        expect(o.smallestOverlap).toBe(n - 2 * f);
        expect(o.quorums).toBe(ref.quorums);
        expect(BigInt(o.quorums)).toBe(choose(n, n - f));
        expect(o.pairs).toBe((o.quorums * (o.quorums - 1)) / 2);
        expect(o.loyalWitness).toBe(n >= 3 * f + 1);
      }
    }
  });

  it('the spec overlaps: f = 1 at n = 4 is 2 and at n = 3 is 1; f = 2 at n = 7 is 3 and at 6 is 2; f = 3 at n = 10 is 4 and at 9 is 3', () => {
    expect([quorumOverlap(4, 1), quorumOverlap(3, 1)].map((o) => o.smallestOverlap)).toEqual([2, 1]);
    expect([quorumOverlap(7, 2), quorumOverlap(6, 2)].map((o) => o.smallestOverlap)).toEqual([3, 2]);
    const ten = quorumOverlap(10, 3);
    expect([ten.smallestOverlap, quorumOverlap(9, 3).smallestOverlap]).toEqual([4, 3]);
    expect(ten.quorums).toBe(120);
    expect(ten.pairs).toBe(7140); // C(120, 2): pairs of distinct quorums (the spec's 7,260 also counts each quorum with itself)
  });

  it('the node range is 3f to 3f + 2 capped at 10, and n above the cap is refused', () => {
    expect(nodeRange(3)).toEqual({ min: 9, max: MAX_NODES });
    expect(nodeRange(1)).toEqual({ min: 3, max: 5 });
    expect(() => quorumOverlap(11, 3)).toThrow(RangeError);
    expect(() => quorumOverlap(0, 1)).toThrow(RangeError);
  });

  it('at n = 3f the shared nodes can all be traitors, and the caption says so', () => {
    const o = quorumOverlap(3, 1);
    expect(o.loyalWitness).toBe(false);
    expect(expectCaption(quorumCaption(o))).toContain('could be traitors');
    expect(expectCaption(quorumCaption(quorumOverlap(4, 1)))).toContain('loyal one');
  });
});

describe('signed orders (scene 3)', () => {
  it('17 traitor behaviours at n = 3 (9 for a traitor commander, 8 for a traitor lieutenant), and none breaks a rule', () => {
    const all = signedBehaviours();
    expect(all).toHaveLength(9 + 2 * 2 * 2);
    expect(trySignedBehaviours()).toMatchObject({ total: 17, breaking: [] });
  });

  it('try-this 5: signing attack for L1 and retreat for L2 leaves both holding both orders, retreating together', () => {
    const b: SignedBehaviour = { traitor: 0, given: [ATTACK, RETREAT], order: RETREAT, withhold: false };
    const r = runSigned(b);
    expect(r.holds.get(1)).toEqual([ATTACK, RETREAT]);
    expect(r.holds.get(2)).toEqual([RETREAT, ATTACK]);
    expect([r.decisions.get(1), r.decisions.get(2)]).toEqual([0, 0]);
    expect(r.ic1 && r.ic2).toBe(true);
    expect(lesson.tryThis[4]).toContain('retreating together');
  });

  it('a withheld relay leaves one signed value, which a loyal lieutenant obeys', () => {
    const r = runSigned({ traitor: 2, given: [ATTACK, ATTACK], order: ATTACK, withhold: true });
    expect(r.holds.get(1)).toEqual([ATTACK]);
    expect(r.decisions.get(1)).toBe(1);
  });

  it('a different decision rule (obey the first value heard) would break: the check can fail', () => {
    const naive = (b: SignedBehaviour) => {
      // L1 obeys what the commander signed for it; L2 obeys what it was given: with an equivocating commander they differ.
      const r = runSigned(b);
      return r.holds.get(1)![0] === r.holds.get(2)![0];
    };
    expect(naive({ traitor: 0, given: [ATTACK, RETREAT], order: RETREAT, withhold: false })).toBe(false);
    expect(decideSigned([ATTACK, RETREAT])).toBe(RETREAT);
    expect(decideSigned([])).toBe(RETREAT);
    expect(decideSigned([ATTACK])).toBe(ATTACK);
  });

  it('the caption compares the two models from computed counts', () => {
    const oral = tryEveryBehaviour(3);
    const signed = trySignedBehaviours();
    const text = expectCaption(signedCaption({ oral: { ic1: true, ic2: false }, signed: { ic1: true, ic2: true }, oralTotal: oral.total, oralBreaking: oral.breaking.length, signedTotal: signed.total, signedBreaking: signed.breaking.length }));
    expect(text).toContain('oral 2 of 12 break a rule, signed 0 of 17');
  });
});

describe('the seeded leg on distSim (scene 4 and the sampled line of scene 1)', () => {
  it('the harness and the synchronous recursion decide the same, for the same seeded lies, at 3, 4, 6 and 7 generals', () => {
    for (const [n, m, t] of [[3, 1, 1], [4, 1, 1], [6, 2, 2], [7, 2, 2]] as const) {
      for (let seed = 1; seed <= 60; seed++) {
        const run = runOmSeed(n, m, t, seed);
        const ref = referenceDecisions(n, m, t, seed);
        for (let i = 1; i < n; i++) expect(run.decisions[i], `n ${n} seed ${seed} L${i}`).toBe(ref[i]);
      }
    }
  });

  it('OM(2) at 7 generals sends 6 + 6 x 5 + 6 x 5 x 4 = 156 messages', () => {
    expect(runOmSeed(7, 2, 2, 1).messages).toBe(6 + 6 * 5 + 6 * 5 * 4);
    expect(runOmSeed(3, 1, 1, 1).messages).toBe(2 + 2 * 1);
  });

  it('OM(1), one traitor: 3 generals fail on 27 of 200 seeds (13.5%, inside the 8 to 30% band), 4 generals on 0', () => {
    const three = sweepOm(3, 1, 1);
    expect(three.failing).toHaveLength(27);
    expect(three.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.08);
    expect(three.failing.length / SEEDS_TOTAL).toBeLessThan(0.3);
    expect(sweepOm(4, 1, 1).failing).toEqual([]);
  });

  it('the lowest failing seeds are pinned with the rule they break: seed 9 breaks IC2 at 3 generals and seed 19 breaks IC1 at 6', () => {
    const one = forSeeds(SEED_RANGE, omScenario(3, 1, 1), RULES);
    expect(one.ok).toBe(false);
    if (!one.ok) {
      expect(one.seed).toBe(BROKEN_SEED_OM1);
      expect(one.rule).toBe(1);
      expect(one.message).toBe('IC2 broken: a loyal lieutenant did not obey the loyal commander');
    }
    const two = forSeeds(SEED_RANGE, omScenario(6, 2, 2), RULES);
    expect(two.ok).toBe(false);
    if (!two.ok) {
      expect(two.seed).toBe(BROKEN_SEED_OM2);
      expect(two.rule).toBe(0);
      expect(two.message).toBe('IC1 broken: loyal lieutenants decided different values');
    }
    expect(BROKEN_SEED_OM1).toBeGreaterThan(0);
    expect(BROKEN_SEED_OM2).toBeGreaterThan(0);
  });

  it('OM(2): 6 generals fail on 27 of 200 seeds (13.5%, inside the 5 to 35% band) and 7 generals pass all 200, sampled', () => {
    const six = sweepOm(6, 2, 2);
    expect(six.failing).toHaveLength(27);
    expect(six.failing.length / SEEDS_TOTAL).toBeGreaterThan(0.05);
    expect(six.failing.length / SEEDS_TOTAL).toBeLessThan(0.35);
    expect(six.lowestFailing).toBe(BROKEN_SEED_OM2);
    expect(sweepOm(7, 2, 2)).toMatchObject({ failing: [], seeds: 200 });
  });

  it('seeds 0 and the largest seed run to the end', () => {
    for (const seed of [0, SEED_MAX]) {
      expect(runOmSeed(7, 2, 2, seed).broken).toBeNull();
      expect(runOmSeed(6, 2, 2, seed).decisions).toHaveLength(6);
    }
  });

  it('seeded setups draw the traitors from all generals, the commander included', () => {
    const commanderTraitors = Array.from({ length: 200 }, (_, k) => seededSetup(k + 1, 7, 2, 2)).filter((s) => s.traitors.has(COMMANDER)).length;
    expect(commanderTraitors).toBeGreaterThan(30);
    expect(commanderTraitors).toBeLessThan(90);
    for (let seed = 1; seed <= 50; seed++) expect(seededSetup(seed, 7, 2, 2).traitors.size).toBe(2);
  });
});

describe('manipulations: the learner has to set the lie', () => {
  it('manipulation 1: traitor L2 relaying 0 at n = 3 with a loyal commander ordering 1 breaks IC2 and names the conflicting pair', () => {
    const s = setupOfState(DEFAULT_TRAITOR_STATE);
    const v = judge(s, runOm(s));
    expect(v.ic2).toBe(false);
    const named = breakText(3, behaviourOfState({ ...DEFAULT_TRAITOR_STATE, traitor: 2 }));
    expect(named).toContain('C: 1 and L2: 0');
    expect(expectCaption(traitorCaption({ setup: s, behaviour: behaviourOfState({ ...DEFAULT_TRAITOR_STATE, traitor: 2 }), ran: true, refusal: null }))).toContain('IC2 broken');
  });

  it('manipulation 2: the same choices at n = 4 hold and the loyal lieutenants decide 1', () => {
    const four = { ...DEFAULT_TRAITOR_STATE, n: 4, bits: {} };
    const s = setupOfState(four);
    const run = runOm(s);
    const v = judge(s, run);
    expect(v.ic1 && v.ic2).toBe(true);
    expect([...v.loyal.values()]).toEqual([1, 1]);
    expect(expectCaption(traitorCaption({ setup: s, behaviour: behaviourOfState({ ...four, traitor: 2 }), ran: true, refusal: null }))).toContain('IC1 and IC2 hold');
  });

  it('manipulation 3: choosing a second traitor is refused with the pinned text, and the first stays', () => {
    const one = chooseTraitor({ ...DEFAULT_TRAITOR_STATE, traitor: null, bits: {} }, 1);
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = chooseTraitor(one.state, 2);
    expect(two).toEqual({ ok: false, reason: 'This scene allows one traitor (f = 1).' });
    expect(ONE_TRAITOR_REFUSAL).toBe('This scene allows one traitor (f = 1).');
    expect(chooseTraitor(one.state, 1)).toMatchObject({ ok: true, state: { traitor: null } });
    expect(expectCaption(traitorCaption({ setup: setupOfState(one.state), behaviour: null, ran: false, refusal: ONE_TRAITOR_REFUSAL }))).toContain('one traitor (f = 1)');
  });

  it('try-this 1: Run at the default state makes L1 decide 0 although the commander said attack, and IC2 turns red', () => {
    const s = setupOfState(DEFAULT_TRAITOR_STATE);
    const run = runOm(s);
    expect(run.decisions.get(1)).toBe(0);
    expect(judge(s, run).ic2).toBe(false);
    expect(lesson.tryThis[0]).toContain('L1 decides 0 (retreat)');
  });

  it('try-this 2: at 4 generals with L2 telling everyone 0, L1 and L3 both decide 1 and both rules hold', () => {
    const four = { ...DEFAULT_TRAITOR_STATE, n: 4, bits: {} };
    const run = runOm(setupOfState(four));
    expect([run.decisions.get(1), run.decisions.get(3)]).toEqual([1, 1]);
    expect(lesson.tryThis[1]).toContain('L1 and L3 both decide 1');
  });

  it('try-this 3: every traitor behaviour reads 12 behaviours, 2 break a rule, then 32 behaviours, 0 break a rule', () => {
    expect([tryEveryBehaviour(3).total, tryEveryBehaviour(3).breaking.length, tryEveryBehaviour(4).total, tryEveryBehaviour(4).breaking.length]).toEqual([12, 2, 32, 0]);
    expect(lesson.tryThis[2]).toContain('12 behaviours, 2 break a rule');
    expect(lesson.tryThis[2]).toContain('32 behaviours, 0 break a rule');
  });

  it('try-this 4: every decision rule reads 0 of 16 at 3 generals and 1 of 256 (the majority rule) at 4', () => {
    expect(tryEveryRule(3).survivors).toHaveLength(0);
    expect(tryEveryRule(4).survivors).toEqual([majorityRuleNumber(3)]);
    expect(lesson.tryThis[3]).toContain('0 of 16');
    expect(lesson.tryThis[3]).toContain('1 of 256');
  });

  it('every message the traitor sends is orange in the ladder, and a loyal general relays exactly what it received', () => {
    const s = setupOfState(DEFAULT_TRAITOR_STATE);
    const run = runOm(s);
    for (const m of run.messages) {
      if (m.traitor) continue;
      const received = run.received.get(`${m.from}|${m.path.slice(0, -1).join('.')}`);
      if (m.from !== COMMANDER) expect(m.value as Bit).toBe(received);
    }
    expect(run.messages.filter((m) => m.traitor).length).toBeGreaterThan(0);
  });
});
