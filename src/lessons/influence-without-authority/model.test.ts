import { describe, expect, it } from 'vitest';
import {
  ANGLES, EMPTY_PLAN, MAX_CONVERSATIONS, NATURAL_PLANS, SIX_SLOT_PLAN, STAKEHOLDERS, SUPPORT_TO_PASS, matchedPlan, planText, runPlan, searchPlans, startPositions, weightedScore,
  type Angle, type Slot, type StakeholderId,
} from './model';

// Independent oracle: the rules as index tables over six parallel arrays (order Dana, Eli, Fay, Gus, Hana, Ivo), no code shared with the model.
const IDS: StakeholderId[] = ['dana', 'eli', 'fay', 'gus', 'hana', 'ivo'];
const INFLUENCE = [5, 4, 3, 2, 2, 3];
const START = [-1, 0, 0, 1, -1, 0];
const CONCERN: Angle[] = ['workload', 'risk', 'cost', 'credibility', 'cost', 'autonomy'];
/** Index of the person each one listens to, or -1. */
const LISTENS_TO = [3, 3, 1, -1, 0, -1];

function oracle(talks: readonly [number, Angle][]): { final: number[]; score: number; pass: boolean } {
  const p = [...START];
  const met = new Set<number>();
  for (const [who, angle] of talks) {
    met.add(who);
    if (CONCERN[who] === angle) p[who] = Math.min(2, p[who] + 1); // R1
    if (p[who] >= 1) for (let i = 0; i < 6; i += 1) if (LISTENS_TO[i] === who && p[i] < p[who]) p[i] = Math.min(2, p[i] + 1); // R2
  }
  for (let i = 0; i < 6; i += 1) if (!met.has(i) && p[i] <= 0) p[i] = Math.max(-2, p[i] - 1); // R3
  const score = p.reduce((s, v, i) => s + INFLUENCE[i] * v, 0);
  const veto = p.some((v, i) => INFLUENCE[i] >= 4 && v <= -1);
  return { final: p, score, pass: score >= 8 && !veto }; // R4
}

const slotsOf = (talks: readonly [number, Angle][]): Slot[] => talks.map(([w, a]) => ({ who: IDS[w], angle: a }));
const finalOf = (plan: readonly Slot[]): number[] => IDS.map((id) => runPlan(plan).final[id]);
const ANGLE_IDS = ANGLES.map((a) => a.id);

describe('the plan model against a second implementation, over every three-slot plan', () => {
  it('agrees with the table oracle on all 27,000 plans: final positions, weighted score and the outcome', () => {
    const options: [number, Angle][] = IDS.flatMap((_, w) => ANGLE_IDS.map((a) => [w, a] as [number, Angle]));
    expect(options).toHaveLength(30);
    let seen = 0;
    for (const a of options) for (const b of options) for (const c of options) {
      const talks = [a, b, c] as const;
      const out = runPlan(slotsOf(talks));
      const want = oracle(talks);
      expect(finalOf(slotsOf(talks))).toEqual(want.final);
      expect(out.score).toBe(want.score);
      expect(out.pass).toBe(want.pass);
      seen += 1;
    }
    expect(seen).toBe(27_000);
  });

  it('keeps every position inside [-2, +2], never lowers anyone in a conversation, and the score is sum(influence x position)', () => {
    const options: Slot[] = STAKEHOLDERS.flatMap((s) => ANGLES.map((a) => ({ who: s.id, angle: a.id })));
    for (const a of options) for (const b of options) for (const c of options) {
      const out = runPlan([a, b, c]);
      for (const s of STAKEHOLDERS) {
        expect(out.final[s.id]).toBeGreaterThanOrEqual(-2);
        expect(out.final[s.id]).toBeLessThanOrEqual(2);
        expect(out.before[s.id]).toBeGreaterThanOrEqual(s.start);
      }
      for (const entry of out.ledger.filter((e) => e.slot > 0)) for (const m of entry.moves) expect(m.to).toBeGreaterThan(m.from);
      expect(out.score).toBe(IDS.reduce((sum, id, i) => sum + INFLUENCE[i] * out.final[id], 0));
    }
  });

  it('a matched conversation never lowers anyone, and a person you spoke with is never surprised', () => {
    for (const s of STAKEHOLDERS) {
      const out = runPlan([{ who: s.id, angle: s.concern }]);
      for (const t of STAKEHOLDERS) expect(out.before[t.id]).toBeGreaterThanOrEqual(t.start);
      expect(out.final[s.id]).toBe(out.before[s.id]);
    }
  });
});

describe('the exhaustive search', () => {
  it('has 27,000 plans, 856 that pass, a best score of 15 reached by 3 plans, and nothing above 15', () => {
    const r = searchPlans();
    expect(r.total).toBe((STAKEHOLDERS.length * ANGLES.length) ** MAX_CONVERSATIONS);
    expect(r.total).toBe(27_000);
    expect(r.passing).toBe(856);
    expect(r.best).toBe(15);
    expect(r.bestPlans).toHaveLength(3);
    for (const plan of r.bestPlans) expect(oracle(plan.map((s) => [IDS.indexOf(s.who!), s.angle!] as [number, Angle])).score).toBe(15);
  });

  it('counts passing plans by the oracle, without the model', () => {
    let pass = 0;
    let best = -Infinity;
    for (let a = 0; a < 30; a += 1) for (let b = 0; b < 30; b += 1) for (let c = 0; c < 30; c += 1) {
      const talks = [a, b, c].map((n) => [Math.floor(n / 5), ANGLE_IDS[n % 5]] as [number, Angle]);
      const o = oracle(talks);
      if (o.pass) pass += 1;
      best = Math.max(best, o.score);
    }
    expect([pass, best]).toEqual([856, 15]);
  });

  it('is memoised: the second call returns the same object', () => {
    expect(searchPlans()).toBe(searchPlans());
  });
});

describe('the hand-worked vectors', () => {
  it('1. no conversations: Dana -2, Eli -1, Fay -1, Gus +1, Hana -2, Ivo -1, score -22, fails with Dana and Eli against', () => {
    // R3: unmet and at 0 or below drop one: -1 -> -2, 0 -> -1, 0 -> -1, +1 stays, -1 -> -2, 0 -> -1.
    // Score 5(-2) + 4(-1) + 3(-1) + 2(+1) + 2(-2) + 3(-1) = -10 - 4 - 3 + 2 - 4 - 3 = -22.
    const out = runPlan(EMPTY_PLAN);
    expect(IDS.map((id) => out.final[id])).toEqual([-2, -1, -1, 1, -2, -1]);
    expect(out.score).toBe(-22);
    expect(out.pass).toBe(false);
    expect(out.vetoes).toEqual(['dana', 'eli']);
  });

  it('2. Gus (credibility), Dana (workload), Eli (risk): [+1, +2, +1, +2, -1, -1], score 15, passes', () => {
    // Gus +1 -> +2; Dana (listens to Gus, lower) -1 -> 0; Eli 0 -> +1. Dana 0 -> +1; Hana (listens to Dana) -1 -> 0.
    // Eli +1 -> +2; Fay (listens to Eli) 0 -> +1. R3: Hana 0 -> -1, Ivo 0 -> -1. Score 5 + 8 + 3 + 4 - 2 - 3 = 15.
    const out = runPlan(matchedPlan(['gus', 'dana', 'eli']));
    expect(IDS.map((id) => out.final[id])).toEqual([1, 2, 1, 2, -1, -1]);
    expect(out.score).toBe(15);
    expect(out.pass).toBe(true);
    expect(out.vetoes).toEqual([]);
    expect(out.ledger.filter((e) => e.slot > 0).map((e) => e.moves.map((m) => `${m.who}:${m.from}>${m.to}:${m.rule}`))).toEqual([
      ['gus:1>2:match', 'dana:-1>0:spill', 'eli:0>1:spill'],
      ['dana:0>1:match', 'hana:-1>0:spill'],
      ['eli:1>2:match', 'fay:0>1:spill'],
    ]);
    expect(out.ledger[3].moves.map((m) => `${m.who}:${m.from}>${m.to}`)).toEqual(['hana:0>-1', 'ivo:0>-1']);
  });

  it('3. Dana, Eli, Fay each matched: [0, +1, +2, +1, -2, -1], score 5, fails (no veto, too little support)', () => {
    // Dana -1 -> 0 (no spillover, she is not yet +1). Eli 0 -> +1; Fay 0 -> +1. Fay +1 -> +2. R3: Hana -1 -> -2, Ivo 0 -> -1.
    // Score 0 + 4 + 6 + 2 - 4 - 3 = 5.
    const out = runPlan(NATURAL_PLANS[0].plan);
    expect(IDS.map((id) => out.final[id])).toEqual([0, 1, 2, 1, -2, -1]);
    expect(out.score).toBe(5);
    expect(out.pass).toBe(false);
    expect(out.vetoes).toEqual([]);
  });

  it('3b. the other tie for the third most influential, Ivo, gives [0, +1, +1, +1, -2, +1] and a score of 8, which just passes', () => {
    // Dana 0; Eli +1 and Fay +1 by spillover (Fay is unmet but positive); Ivo 0 -> +1 on autonomy; Hana -1 -> -2.
    // Score 0 + 4 + 3 + 2 - 4 + 3 = 8.
    const out = runPlan(NATURAL_PLANS[1].plan);
    expect(IDS.map((id) => out.final[id])).toEqual([0, 1, 1, 1, -2, 1]);
    expect(out.score).toBe(8);
    expect(SUPPORT_TO_PASS).toBe(8);
    expect(out.pass).toBe(true);
  });

  it('4. Dana on cost three times: nothing moves for Dana, and the ledger says no match three times; score -17, fails', () => {
    // Dana stays -1. R3: Eli -1, Fay -1, Hana -2, Ivo -1, Gus +1. Score -5 - 4 - 3 + 2 - 4 - 3 = -17.
    const plan: Slot[] = [{ who: 'dana', angle: 'cost' }, { who: 'dana', angle: 'cost' }, { who: 'dana', angle: 'cost' }];
    const out = runPlan(plan);
    expect(out.final.dana).toBe(-1);
    expect(out.score).toBe(-17);
    expect(out.pass).toBe(false);
    expect(out.ledger.filter((e) => e.slot > 0).every((e) => !e.matched && e.moves.length === 0)).toBe(true);
    expect(runPlan([{ who: 'dana', angle: 'cost' }, EMPTY_PLAN[0], EMPTY_PLAN[0]]).score).toBe(-17);
  });

  it('5. the six-slot plan (Gus, Dana, Eli, Fay, Hana, Ivo each matched) scores 28', () => {
    // Gus +2; Dana 0 then +1; Eli +1 then +2; Fay +1 (spill) then +2; Hana 0 (spill) then +1; Ivo +1. Score 5 + 8 + 6 + 4 + 2 + 3 = 28.
    const out = runPlan(SIX_SLOT_PLAN);
    expect(IDS.map((id) => out.final[id])).toEqual([1, 2, 2, 2, 1, 1]);
    expect(out.score).toBe(28);
    expect(oracle(SIX_SLOT_PLAN.map((s) => [IDS.indexOf(s.who!), s.angle!] as [number, Angle])).score).toBe(28);
  });

  it('an empty slot, or one with only a person or only an angle, is unused', () => {
    expect(runPlan([{ who: 'gus', angle: null }, { who: null, angle: 'risk' }, EMPTY_PLAN[0]])).toEqual(runPlan(EMPTY_PLAN));
  });

  it('a second conversation with the same person is allowed and shown in the ledger', () => {
    const out = runPlan([{ who: 'gus', angle: 'credibility' }, { who: 'gus', angle: 'credibility' }, EMPTY_PLAN[0]]);
    expect(out.final.gus).toBe(2);
    expect(out.ledger.filter((e) => e.slot > 0)).toHaveLength(2);
    expect(out.ledger[1].moves).toEqual([{ who: 'dana', from: 0, to: 1, rule: 'spill' }, { who: 'eli', from: 1, to: 2, rule: 'spill' }]);
  });

  it('reads the start positions and plans in words', () => {
    expect(weightedScore(startPositions())).toBe(-5 + 0 + 0 + 2 - 2 + 0);
    expect(planText(EMPTY_PLAN)).toBe('no conversations');
    expect(planText(matchedPlan(['gus', 'dana']))).toBe('Gus on credibility, then Dana on workload');
  });
});
