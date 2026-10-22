import { describe, expect, it } from 'vitest';
import { choose, dominatedChoices, enumeratePaths, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { INFLUENCE } from '../../core/testing/leadScenarios';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { againstSub, ledgerLine, mapCaption, outcomeText, storyCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { LEAVES_OUT } from './leaves';
import {
  ANGLES, EMPTY_PLAN, FOURTH_REFUSED, MAX_CONVERSATIONS, NATURAL_PLANS, STAKEHOLDERS, matchedPlan, openingStats, orderingScores, planNames, runPlan, searchPlans, type Slot,
} from './model';
import { OPENING } from './opening';
import { MEETING, METER, METERS } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const walkTo = (ids: string[]) => ids.reduce((w, id) => choose(MEETING, w, id), startWalk(MEETING));
const dana = (angle: Slot['angle']): Slot => ({ who: 'dana', angle });

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('influence-without-authority');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('influence-without-authority')).toEqual([]);
  });

  it('opens on the map with three empty conversations and the meeting not run', () => {
    expect(OPENING.scene).toBe('map');
    expect(OPENING.plan.ran).toBe(false);
    expect(OPENING.plan.slots).toHaveLength(MAX_CONVERSATIONS);
    expect(OPENING.plan.slots.every((s) => s.who === null && s.angle === null)).toBe(true);
  });

  it('refuses a fourth conversation with the pinned text', () => {
    expect(FOURTH_REFUSED).toBe('You have 3 conversations before the meeting: pick which three.');
    expect(MAX_CONVERSATIONS).toBe(3);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: no conversations scores −22, fails, and Dana and Eli are named as against', () => {
    const out = runPlan(OPENING.plan.slots);
    expect([out.score, out.pass, out.vetoes]).toEqual([-22, false, ['dana', 'eli']]);
    expect(FACTS.none).toBe(-22);
    expect(expectCaption(mapCaption(OPENING.plan.slots, true))).toContain('Dana and Eli (influence 4 or more) stand at −1 or below');
    expect(lesson.tryThis[0]).toContain('weighted support is -22');
  });

  it('try-this 2: Dana, Eli and Fay each on their own concern scores 5 and fails', () => {
    const out = runPlan(matchedPlan(['dana', 'eli', 'fay']));
    expect([out.score, out.pass]).toEqual([5, false]);
    expect(out.vetoes).toEqual([]);
    expect(outcomeText(out)).toContain('too little support');
    expect(lesson.tryThis[1]).toContain('the score is 5 and it still fails');
  });

  it('try-this 3: Gus, Dana, Eli each on their own concern scores 15 and passes, and the ledger names each spillover', () => {
    const out = runPlan(matchedPlan(['gus', 'dana', 'eli']));
    expect([out.score, out.pass]).toEqual([15, true]);
    expect(ledgerLine(out.ledger[0])).toBe('Conversation 1, Gus on credibility: match (R1): Gus +1 to +2; spillover (R2): Dana −1 to 0, Eli 0 to +1.');
    expect(ledgerLine(out.ledger[1])).toBe('Conversation 2, Dana on workload: match (R1): Dana 0 to +1; spillover (R2): Hana −1 to 0.');
    expect(ledgerLine(out.ledger[2])).toContain('spillover (R2): Fay 0 to +1');
    expect(ledgerLine(out.ledger[3])).toBe('In the meeting, surprise (R3): Hana 0 to −1, Ivo 0 to −1.');
    expect(lesson.tryThis[2]).toContain('the score is 15 and the meeting passes');
  });

  it('try-this 4: Dana on cost three times: nothing moves for her, "no match" three times, score −17', () => {
    const out = runPlan([dana('cost'), dana('cost'), dana('cost')]);
    expect(out.score).toBe(-17);
    const lines = out.ledger.filter((e) => e.slot > 0).map(ledgerLine);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toBe(`Conversation ${lines.indexOf(line) + 1}, Dana on cost: no match: Dana cares about workload, not cost.`);
    expect(lesson.tryThis[3]).toContain('score is -17');
  });

  it('try-this 5: push then hold ends with support 7 (red); ask then pilot reads 17 / 8 / 3 / 65 / 10, which is 35% of scope given up', () => {
    const lost = walkTo(['push', 'hold']);
    expect(lost.meters).toEqual({ support: 7, trust: 3, weeks: 1, scope: 100, risk: 10 });
    expect(redMeters(MEETING, lost.meters).map((m) => m.id)).toEqual([METER.support]);
    expect(walkTo(['ask', 'pilot']).meters).toEqual({ support: 17, trust: 8, weeks: 3, scope: 65, risk: 10 });
    expect(FACTS.scopeGivenUp).toBe(35);
    expect(lesson.tryThis[4]).toContain('support 7, in the red');
    expect(lesson.tryThis[4]).toContain('35% of scope given up');
  });
});

describe('captions across the controls', () => {
  it('the map caption and ledger are clean for every person and angle in every slot, before and after a run', () => {
    for (const s of STAKEHOLDERS) for (const a of ANGLES) {
      const plan: Slot[] = [{ who: s.id, angle: a.id }, EMPTY_PLAN[0], { who: s.id, angle: a.id }];
      for (const ran of [false, true]) expect(expectCaption(mapCaption(plan, ran))).not.toMatch(NO_JUNK);
      for (const e of runPlan(plan).ledger) expect(ledgerLine(e)).not.toMatch(NO_JUNK);
    }
    expect(expectCaption(mapCaption(EMPTY_PLAN, false))).toContain('0 conversations of 3 planned: no conversations');
    expect(expectCaption(mapCaption(matchedPlan(['gus']), false))).toContain('1 conversation of 3 planned: Gus on credibility');
  });

  it('says "already at +2" for a match that cannot move anyone, and "nobody you skipped was surprised" when all are met or positive', () => {
    const out = runPlan(matchedPlan(['gus', 'gus', 'gus']));
    expect(ledgerLine(out.ledger[1])).toContain('Gus is already at +2');
    expect(ledgerLine(runPlan(matchedPlan(['dana', 'eli', 'fay', 'gus', 'hana', 'ivo'])).ledger[6])).toBe('In the meeting: nobody you skipped was surprised.');
  });

  it('the story caption reads the meters and the red ones', () => {
    expect(expectCaption(storyCaption(MEETING, startWalk(MEETING)))).toContain('Nothing is in the red');
    const text = expectCaption(storyCaption(MEETING, walkTo(['escalate'])));
    expect(text).toContain('Support 15, trust 2, 1 week so far, scope kept 100%, teams exposed 25%');
    expect(text).toContain('In the red: trust.');
  });
});

describe('the meeting story', () => {
  const paths = () => enumeratePaths(MEETING);
  const final = (ids: string[]) => walkTo(ids).meters;

  it('has the fixture graph, meters and effects exactly (the fixture carries the one-week concede retune)', () => {
    expect(MEETING.start).toBe(INFLUENCE.start);
    expect(MEETING.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad])).toEqual(INFLUENCE.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad]));
    const differences: string[] = [];
    for (const [i, node] of MEETING.nodes.entries()) {
      expect(node.choices.map((c) => [c.id, c.to])).toEqual(INFLUENCE.nodes[i].choices.map((c) => [c.id, c.to]));
      node.choices.forEach((c, j) => { if (JSON.stringify(c.effects) !== JSON.stringify(INFLUENCE.nodes[i].choices[j].effects)) differences.push(c.id); });
    }
    expect(differences).toEqual([]);
    expect(MEETING.nodes[1].choices[1].effects).toEqual({ support: 3, trust: 1, weeks: 1, scope: -20 });
    expect(MEETING.endings.map((e) => e.id)).toEqual(INFLUENCE.endings.map((e) => e.id));
  });

  it('passes every trade-off check with NO trap paths, under all three choice readings and the strict cross-ending reading, with 8 paths', () => {
    expect(validateScenario(MEETING, { tradeoffs: true })).toEqual([]);
    expect(validateScenario(MEETING, { tradeoffs: true, crossEndings: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(MEETING, { destinations }), destinations).toEqual([]);
    expect(paths()).toHaveLength(8);
  });

  it('push > concede > pilot is a real trade against ask > pilot: it saves a week and costs trust and scope (at two weeks it was beaten on every meter)', () => {
    const viaPush = final(['push', 'concede', 'pilot']);
    const viaAsk = final(['ask', 'pilot']);
    expect(viaPush[METER.weeks]).toBeLessThan(viaAsk[METER.weeks]);
    expect(viaPush[METER.trust]).toBeLessThan(viaAsk[METER.trust]);
    expect(viaPush[METER.scope]).toBeLessThan(viaAsk[METER.scope]);
    const atTwoWeeks = { ...MEETING, nodes: MEETING.nodes.map((n) => (n.id === 'm2' ? { ...n, choices: n.choices.map((c) => (c.id === 'concede' ? { ...c, effects: { ...c.effects, weeks: 2 } } : c)) } : n)) };
    expect(validateScenario(atTwoWeeks, { tradeoffs: true }).map((p) => p.kind)).toEqual(['dominated-path', 'dominated-path']);
    expect(validateScenario(INFLUENCE, { tradeoffs: true })).toEqual([]);
  });

  it('has the hand-worked ending ledgers (start 12 / 6 / 0 / 100 / 10)', () => {
    expect(final(['push', 'hold'])).toEqual({ support: 7, trust: 3, weeks: 1, scope: 100, risk: 10 }); // -2-3, -2-1, +1
    expect(final(['push', 'concede', 'pilot'])).toEqual({ support: 17, trust: 6, weeks: 2, scope: 55, risk: 10 }); // -2+3+4, -2+1+1, +1+1, -20-25
    expect(final(['push', 'concede', 'fullrollout'])).toEqual({ support: 18, trust: 3, weeks: 1, scope: 80, risk: 55 }); // -2+3+5, -2+1-2, +1, -20, +45
    expect(final(['ask', 'fullrollout'])).toEqual({ support: 18, trust: 5, weeks: 2, scope: 90, risk: 55 }); // +1+5, +1-2, +2, -10, +45
    expect(final(['defer', 'oneonone'])).toEqual({ support: 15, trust: 7, weeks: 4, scope: 85, risk: 20 });
    expect(final(['defer', 'wait'])).toEqual({ support: 10, trust: 6, weeks: 6, scope: 100, risk: 15 });
    expect(final(['escalate'])).toEqual({ support: 15, trust: 2, weeks: 1, scope: 100, risk: 25 });
  });

  it('has no path best on every meter, and every path worsens a meter or enters the red', () => {
    const all = paths().map((p) => p.meters);
    const higherIsBetter = [METER.support, METER.trust, METER.scope];
    const lowerIsBetter = [METER.weeks, METER.risk];
    const bestOnAll = all.filter((v) => all.every((u) => higherIsBetter.every((m) => v[m] >= u[m]) && lowerIsBetter.every((m) => v[m] <= u[m])));
    expect(bestOnAll).toEqual([]);
    for (const p of paths()) {
      const worsened = p.meters[METER.trust] < 6 || p.meters[METER.weeks] > 0 || p.meters[METER.scope] < 100 || p.meters[METER.risk] > 10 || p.meters[METER.support] < 12;
      expect(worsened, p.choices.join(' > ')).toBe(true);
    }
    expect(METERS).toHaveLength(5);
  });

  it('puts support, trust, scope and risk in the red where the spec says, and the two defensible endings carry a price', () => {
    const red = (ids: string[]) => redMeters(MEETING, final(ids)).map((m) => m.id);
    expect(red(['push', 'hold'])).toEqual([METER.support]);
    expect(red(['escalate'])).toEqual([METER.trust]);
    expect(red(['push', 'concede', 'pilot'])).toEqual([METER.scope]);
    expect(red(['ask', 'fullrollout'])).toEqual([METER.risk]);
    expect(red(['defer', 'wait'])).toEqual([]);
    expect(final(['defer', 'wait'])[METER.weeks]).toBe(6);
  });

  it('has no ending marked correct, states every reason as a condition, and the ending texts say only what the ledger shows', () => {
    for (const e of MEETING.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
    for (const c of MEETING.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
    expect(final(['push', 'hold'])[METER.support]).toBeLessThan(12);
    expect(final(['push', 'concede', 'fullrollout'])[METER.risk]).toBeGreaterThan(50);
    expect(final(['defer', 'oneonone'])[METER.trust]).toBeGreaterThan(6);
    expect(final(['defer', 'wait'])[METER.support]).toBeLessThan(12);
    expect(final(['escalate'])[METER.support]).toBeGreaterThan(12);
  });
});

describe('the text quotes what the model computes', () => {
  it('quotes the search and the opening statistics: 27,000 plans, 856 pass, best 15 by 3 plans; Gus opens 628 of them; Dana, Hana and Ivo open at most 13, 11, 13', () => {
    const r = searchPlans();
    expect([FACTS.total, r.passing, r.best, r.bestPlans.length]).toEqual(['27,000', 856, 15, 3]);
    const o = openingStats();
    expect([o.gus.passing, o.dana.best, o.hana.best, o.ivo.best]).toEqual([628, 13, 11, 13]);
    expect(FACTS.gusOpenShare).toBe(73);
    expect(r.bestPlans.every((p) => p.every((s) => s.angle === STAKEHOLDERS.find((x) => x.id === s.who)!.concern) && new Set(p.map((s) => s.who)).size === 3)).toBe(true);
    expect(r.bestPlans.map((p) => p.map((s) => s.who).sort().join())).toEqual(['dana,eli,gus', 'dana,eli,gus', 'dana,eli,gus']);
  });

  it('the natural plans read 5 (third is Fay) and 8 (third is Ivo, a bare pass), and Fay and Ivo tie at influence 3', () => {
    expect([FACTS.natural, FACTS.naturalIvo]).toEqual([5, 8]);
    expect(STAKEHOLDERS.filter((s) => s.influence === 3).map((s) => s.id)).toEqual(['fay', 'ivo']);
    expect(NATURAL_PLANS).toHaveLength(2);
  });

  it('has a question on what must come before Dana, and the numeric answer is 15', () => {
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('because Dana listens to him');
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('15, which is enough');
    expect(FACTS.six).toBe(28);
  });

  it('the leaves-out panel says what the numbers are, and nothing in it is a claim about real people', () => {
    expect(LEAVES_OUT.plain).toContain('arithmetic of ordering, not evidence about people');
    expect(LEAVES_OUT.missing).toHaveLength(4);
  });
});

describe('who you talk to versus the order (the headline claim, walked on the model)', () => {
  const GDE = ['gus', 'dana', 'eli'] as const;
  it('the six orderings of Gus, Dana and Eli score 15, 15, 13, 13, 15, 13 and all pass: order is worth 2 points, and Gus before Dana is what reaches 15', () => {
    const scores = Object.fromEntries(orderingScores([...GDE]).map((o) => [o.order.join('>'), [o.score, o.pass]]));
    expect(scores).toEqual({
      'gus>dana>eli': [15, true], 'gus>eli>dana': [15, true], 'dana>gus>eli': [13, true], 'dana>eli>gus': [13, true], 'eli>gus>dana': [15, true], 'eli>dana>gus': [13, true],
    });
    expect([FACTS.orderMin, FACTS.orderMax, FACTS.ordersPassing, FACTS.ordersAtBest, FACTS.gusBeforeDanaIsBest]).toEqual([13, 15, 6, 3, true]);
  });

  it('swapping Fay for Gus, a change of who, moves 5 to 15; 844 of the 856 passing plans contain Gus', () => {
    expect([FACTS.natural, FACTS.gusPlan]).toEqual([5, 15]);
    expect(FACTS.withGus).toBe(844);
    const text = [lesson.summary.tldr, ...lesson.keyIdeas].join(' ');
    expect(text).not.toMatch(/order of three conversations changes/);
    expect(lesson.keyIdeas[1]).toContain('844 of the 856');
    expect(lesson.keyIdeas[1]).toContain('Order is worth 2 points');
    expect(lesson.summary.tldr).toContain('swapping Fay for Gus takes a plan from 5 to 15');
  });

  it('the page row of the best plan names the whole tie, which includes an Eli-first plan, so "Gus first" is not claimed of the best', () => {
    expect(searchPlans().bestPlans.map(planNames).sort()).toEqual(['Eli, Gus, Dana', 'Gus, Dana, Eli', 'Gus, Eli, Dana']);
    expect(lesson.keyIdeas.join(' ')).not.toMatch(/open with Gus/);
  });
});

describe('a mismatched pitch (the claim, walked on the model)', () => {
  it('does not move that person, but any conversation spares them R3 (Dana on cost x3 is -17, not -22) and Gus on the wrong angle still lifts Dana and Eli', () => {
    const wrong = runPlan([dana('cost'), dana('cost'), dana('cost')]);
    expect(wrong.final.dana).toBe(-1);
    expect(wrong.score).toBe(-17);
    expect(runPlan(EMPTY_PLAN).final.dana).toBe(-2);
    const gus = runPlan([{ who: 'gus', angle: 'cost' }]);
    expect([gus.before.dana, gus.before.eli]).toEqual([0, 1]);
    expect(FACTS.gusDanaEliAllCost).toBe(2);
    const text = [lesson.summary.tldr, lesson.summary.why, ...lesson.summary.useCases, ...lesson.keyIdeas, ...lesson.tryThis].join(' ');
    expect(text).not.toMatch(/moves nobody\.|moves nobody:|spent for nothing|nothing moves for her|conversations are spent/);
    expect(lesson.keyIdeas[2]).toContain('anyone you spoke with escapes the surprise drop');
  });

  it('most passing plans include a mismatched slot, so a wrong-angle conversation is not a wasted one', () => {
    const options = STAKEHOLDERS.flatMap((s) => ANGLES.map((a) => ({ who: s.id, angle: a.id })));
    let mismatchedPassing = 0;
    for (const a of options) for (const b of options) for (const c of options) {
      const plan = [a, b, c];
      if (runPlan(plan).pass && plan.some((x) => x.angle !== STAKEHOLDERS.find((t) => t.id === x.who)!.concern)) mismatchedPassing += 1;
    }
    expect(mismatchedPassing).toBe(804);
  });
});

describe('the "Room leaders against" label', () => {
  it('names Hana and Ivo at -1 after the passing Gus, Dana, Eli run, when no room leader is against', () => {
    const out = runPlan(matchedPlan(['gus', 'dana', 'eli']));
    expect(out.vetoes).toEqual([]);
    expect(againstSub(out)).toBe('influence 4 or more at −1 or below; also at −1 or below: Hana and Ivo');
  });
});
