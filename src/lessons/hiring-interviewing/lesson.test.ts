import { describe, expect, it } from 'vitest';
import { choose, dominatedChoices, enumeratePaths, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { HIRING } from '../../core/testing/leadScenarios';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { calibrateCaption, loopCaption, panelCaption, storyCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  DEFAULT_STAGES, PANEL_BOUNDS, SIGMA_B, SIGMA_B_ANCHORED, correlationFormula, interviewerRows, makeFunnelDraws, makeInterviewerDraws, makePool, recallFormula, runFunnel, runPanel, spreadOf,
  type Panel, type StageSpec,
} from './model';
import { DEFAULT_SEED, OPENING } from './opening';
import { DEBRIEF, METER, METERS } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const walkTo = (ids: string[]) => ids.reduce((w, id) => choose(DEBRIEF, w, id), startWalk(DEBRIEF));
const panel = (k: number, rho = 0, sigma = OPENING.panel.sigma): Panel => ({ k, sigma, rho });
const hire = OPENING.panel.hire / 100;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('hiring-interviewing');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('hiring-interviewing')).toEqual([]);
  });

  it('opens on the panel scene with seed 1, three interviewers at an error of 1.2, hire 10% and no agreement, all inside their sliders', () => {
    expect(OPENING.scene).toBe('panel');
    expect(OPENING.seed).toBe(DEFAULT_SEED);
    expect(OPENING.panel).toEqual({ k: 3, sigma: 1.2, hire: 10, rho: 0 });
    const { k, sigma, hire: h, rho } = OPENING.panel;
    expect(k).toBeGreaterThanOrEqual(PANEL_BOUNDS.k.min);
    expect(k).toBeLessThanOrEqual(PANEL_BOUNDS.k.max);
    expect(sigma).toBeGreaterThanOrEqual(PANEL_BOUNDS.sigma.min);
    expect(h % PANEL_BOUNDS.hire.step).toBe(0);
    expect(rho).toBe(PANEL_BOUNDS.rho.min);
    expect(PANEL_BOUNDS.rho.max).toBeLessThan(1);
    expect(Math.abs(Math.round(0.5 / PANEL_BOUNDS.rho.step) * PANEL_BOUNDS.rho.step - 0.5)).toBeLessThan(1e-9);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: r 0.82; recall 59% by the formula and a pool value near it; three interviewers miss 41%', () => {
    expect([FACTS.rDefault, FACTS.recallDefault, FACTS.missDefault]).toEqual(['0.82', 59, 41]);
    const res = runPanel(makePool(DEFAULT_SEED), panel(3), hire);
    expect(Math.abs(res.recallPool - res.recallFormula)).toBeLessThan(0.1);
    expect(FACTS.recallDefaultPool).toBe(Math.round(res.recallPool * 100));
    expect(lesson.tryThis[0]).toContain('r is 0.82 and the formula puts recall at 59%');
  });

  it('try-this 2: k = 1 gives r 0.64 and recall 42%; k = 9 gives 0.93 and 74% (exact recall 0.7362)', () => {
    expect([FACTS.rK1, FACTS.recallK1, FACTS.rK9, FACTS.recallK9]).toEqual(['0.64', 42, '0.93', 74]);
    expect(recallFormula(correlationFormula(panel(9)), hire)).toBeCloseTo(0.7362, 3);
    expect(lesson.tryThis[1]).toContain('r falls to 0.64 and recall to 42%');
  });

  it('try-this 3: k back at 3 and rho 0.5 gives r 0.71, recall 48% and 1.5 independent interviewers', () => {
    expect([FACTS.rRho, FACTS.recallRho, FACTS.effectiveRho]).toEqual(['0.71', 48, '1.5']);
    expect(lesson.tryThis[2]).toContain('r falls to 0.71, recall to 48%, and the independent interviewers read 1.5');
  });

  it('try-this 4: no signal at the phone screen takes the final recall from about 0.39 to 0.27 and the mean skill from about 1.75 to 1.37, on seed 1', () => {
    const base = runFunnel(makeFunnelDraws(DEFAULT_SEED), DEFAULT_STAGES);
    const noPhone: StageSpec[] = DEFAULT_STAGES.map((s, i) => (i === 1 ? { ...s, noSignal: true } : s));
    const worse = runFunnel(makeFunnelDraws(DEFAULT_SEED), noPhone);
    expect(base[2].recall).toBeGreaterThan(0.36);
    expect(base[2].recall).toBeLessThan(0.42);
    expect(worse[2].recall).toBeGreaterThan(0.24);
    expect(worse[2].recall).toBeLessThan(0.3);
    expect(base[2].meanSkill - worse[2].meanSkill).toBeGreaterThan(0.25);
    expect(lesson.tryThis[3]).toContain(`falls from ${FACTS.funnelRecall} to ${FACTS.funnelNoPhoneRecall}`);
    expect(Number(FACTS.funnelNoPhoneRecall)).toBeLessThan(Number(FACTS.funnelRecall));
  });

  it('try-this 5: the anchored rubric shrinks the spread of the eight means on seed 1; the same candidate clears the bar 66.6% against 3.2%', () => {
    const draws = makeInterviewerDraws(DEFAULT_SEED);
    expect(spreadOf(interviewerRows(draws, SIGMA_B_ANCHORED))).toBeLessThan(spreadOf(interviewerRows(draws, SIGMA_B)));
    expect(Number(FACTS.spreadTight)).toBeLessThan(Number(FACTS.spreadLoose));
    expect([FACTS.lenientChance, FACTS.neutralChance, FACTS.strictChance]).toEqual(['66.6', '23.8', '3.2']);
    expect(lesson.tryThis[4]).toContain('66.6% with a lenient interviewer against 3.2% with a strict one');
  });
});

describe('captions across the controls', () => {
  it('the panel caption is clean at every slider extreme, and for both seed extremes', () => {
    for (const seed of [0, 2 ** 31 - 1]) {
      const pool = makePool(seed);
      for (const k of [PANEL_BOUNDS.k.min, PANEL_BOUNDS.k.max]) for (const sigma of [PANEL_BOUNDS.sigma.min, PANEL_BOUNDS.sigma.max]) {
        for (const h of [PANEL_BOUNDS.hire.min, PANEL_BOUNDS.hire.max]) for (const rho of [PANEL_BOUNDS.rho.min, PANEL_BOUNDS.rho.max]) {
          const text = expectCaption(panelCaption(k, sigma, h, runPanel(pool, { k, sigma, rho }, h / 100)));
          expect(text).not.toMatch(NO_JUNK);
        }
      }
    }
    expect(expectCaption(panelCaption(1, 1.2, 10, runPanel(makePool(1), panel(1), 0.1)))).toContain('1 interviewer at an error of 1.2');
  });

  it('the loop caption names the biggest loss and says when a stage ranks by noise', () => {
    const draws = makeFunnelDraws(1);
    const noPhone: StageSpec[] = DEFAULT_STAGES.map((s, i) => (i === 1 ? { ...s, noSignal: true } : s));
    const text = expectCaption(loopCaption(noPhone, runFunnel(draws, noPhone)));
    expect(text).toContain('A stage with no signal ranks by noise alone');
    expect(text).toMatch(/biggest loss of the true top group is at the (resume screen|phone screen|onsite)/);
    expect(expectCaption(loopCaption(DEFAULT_STAGES, runFunnel(draws, DEFAULT_STAGES)))).not.toContain('no signal');
    for (const keep of [0.05, 1]) for (const k of [1, 9]) {
      const stages = DEFAULT_STAGES.map((s) => ({ ...s, keep, k }));
      expect(expectCaption(loopCaption(stages, runFunnel(draws, stages)))).not.toMatch(NO_JUNK);
    }
  });

  it('the calibrate caption names the most lenient and the strictest interviewer, with and without the rubric', () => {
    const draws = makeInterviewerDraws(1);
    for (const anchored of [false, true]) {
      const rows = interviewerRows(draws, anchored ? SIGMA_B_ANCHORED : SIGMA_B);
      const text = expectCaption(calibrateCaption(rows, spreadOf(rows), anchored));
      expect(text).not.toMatch(NO_JUNK);
      expect(text.startsWith(anchored ? 'With an anchored rubric' : 'Without a rubric')).toBe(true);
    }
  });

  it('the story caption reads the meters and the red ones', () => {
    expect(expectCaption(storyCaption(DEBRIEF, startWalk(DEBRIEF)))).toContain('Nothing is in the red');
    expect(expectCaption(storyCaption(DEBRIEF, walkTo(['avg'])))).toContain('Regret 25, 0 days to a decision, panel goodwill 7');
  });
});

describe('the debrief story', () => {
  const paths = () => enumeratePaths(DEBRIEF);
  const final = (ids: string[]) => walkTo(ids).meters;

  it('has the fixture graph and meters; two effects are retuned from it (veto regret 8, not 12; still_followup regret -2, not -1) and the rest are the fixture\'s', () => {
    expect(DEBRIEF.start).toBe(HIRING.start);
    expect(DEBRIEF.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad])).toEqual(HIRING.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad]));
    const differences: string[] = [];
    for (const [i, node] of DEBRIEF.nodes.entries()) {
      expect(node.choices.map((c) => [c.id, c.to])).toEqual(HIRING.nodes[i].choices.map((c) => [c.id, c.to]));
      node.choices.forEach((c, j) => { if (JSON.stringify(c.effects) !== JSON.stringify(HIRING.nodes[i].choices[j].effects)) differences.push(c.id); });
    }
    expect(differences).toEqual(['veto', 'still_followup']);
    expect(DEBRIEF.endings.map((e) => e.id)).toEqual(HIRING.endings.map((e) => e.id));
  });

  it('passes every trade-off check with NO trap paths, under all three choice readings and the strict cross-ending reading, with 6 paths', () => {
    expect(validateScenario(DEBRIEF, { tradeoffs: true })).toEqual([]);
    expect(validateScenario(DEBRIEF, { tradeoffs: true, crossEndings: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(DEBRIEF, { destinations }), destinations).toEqual([]);
    expect(paths()).toHaveLength(6);
    expect(validateScenario(HIRING, { tradeoffs: true }).map((p) => p.kind)).toEqual(['dominated-path']);
  });

  it('has the hand-worked ending ledgers (start regret 15, days 0, goodwill 7)', () => {
    expect(final(['avg'])).toEqual({ regret: 25, days: 0, goodwill: 7 }); // +10
    expect(final(['veto'])).toEqual({ regret: 23, days: 1, goodwill: 5 }); // +8, +1, -2
    expect(final(['evidence', 'decide_evidence'])).toEqual({ regret: 12, days: 1, goodwill: 3 }); // -2-1, +1, -3-1
    expect(final(['evidence', 'still_followup', 'hire_after'])).toEqual({ regret: 8, days: 8, goodwill: 4 }); // -2-2-3, +1+5+2, -3
    expect(final(['followup', 'hire_after'])).toEqual({ regret: 9, days: 8, goodwill: 7 }); // -3-3, +6+2
    expect(final(['senior'])).toEqual({ regret: 21, days: 0, goodwill: 4 }); // +6, -3
  });

  it('keeps the evidence-then-follow-up path against the follow-up path as a real trade-off: it has lower regret, and costs goodwill', () => {
    const viaEvidence = final(['evidence', 'still_followup', 'hire_after']);
    const direct = final(['followup', 'hire_after']);
    expect(viaEvidence[METER.regret]).toBeLessThan(direct[METER.regret]);
    expect(viaEvidence[METER.goodwill]).toBeLessThan(direct[METER.goodwill]);
    expect(viaEvidence[METER.days]).toBe(direct[METER.days]);
  });

  it('has no path best on every meter, and the veto is better than the average on regret and worse on days and goodwill', () => {
    const all = paths().map((p) => p.meters);
    const bestOnAll = all.filter((v) => all.every((u) => v[METER.regret] <= u[METER.regret] && v[METER.days] <= u[METER.days] && v[METER.goodwill] >= u[METER.goodwill]));
    expect(bestOnAll).toEqual([]);
    expect(final(['veto'])[METER.regret]).toBeLessThan(final(['avg'])[METER.regret]);
    expect(final(['veto'])[METER.days]).toBeGreaterThan(final(['avg'])[METER.days]);
    expect(final(['veto'])[METER.goodwill]).toBeLessThan(final(['avg'])[METER.goodwill]);
    expect(METERS).toHaveLength(3);
  });

  it('has no ending in the red, with goodwill at the edge on the evidence ending, and every path worsens a meter', () => {
    for (const p of paths()) {
      expect(redMeters(DEBRIEF, p.meters), p.choices.join(' > ')).toEqual([]);
      expect(p.meters[METER.regret] > 15 || p.meters[METER.days] > 0 || p.meters[METER.goodwill] < 7, p.choices.join(' > ')).toBe(true);
    }
    expect(final(['evidence', 'decide_evidence'])[METER.goodwill]).toBe(3);
  });

  it('has no ending marked correct, states every reason as a condition, and the fast ending is defensible with its cost visible', () => {
    for (const e of DEBRIEF.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
    for (const c of DEBRIEF.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
    expect(final(['avg'])[METER.regret]).toBe(25);
    expect(final(['avg'])[METER.days]).toBe(0);
    expect(final(['evidence', 'decide_evidence'])[METER.days]).toBe(1);
    expect(final(['followup', 'hire_after'])[METER.days]).toBeGreaterThan(5);
  });
});

describe('the text quotes what the model computes', () => {
  it('one interview at an error of 1 finds 47% (fewer than half), and the tldr claim that one interview at 1.2 finds fewer than half holds', () => {
    expect(FACTS.oneRecall).toBe(47);
    expect(recallFormula(correlationFormula(panel(1)), hire)).toBeLessThan(0.5);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toContain('About 47%');
    expect(lesson.quiz[0].options[3]).toContain('About 71%');
  });

  it('has an "it depends" question that names its X, and the agreeing-panel numbers 0.89, 0.78 and 1.6', () => {
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('It depends on whether their errors are independent');
    expect([FACTS.fourR, FACTS.fourAgreeingR, FACTS.fourAgreeingEffective, FACTS.oneR]).toEqual(['0.89', '0.78', '1.6', '0.71']);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('1.6, which is 4 divided by the factor (1 + 3 x 0.5)');
  });

  it('says the rubric is an input in the page text, in those words, and attributes no research to a named person or company', () => {
    const source = [lesson.summary.tldr, lesson.summary.what, ...lesson.keyIdeas, ...lesson.quiz.map((q) => q.why)].join(' ');
    expect(lesson.keyIdeas[3]).toContain('a rubric is an input in this model');
    expect(source).not.toMatch(/\b(Google|Amazon|Microsoft|Meta|Schmidt|Hunter|Kahneman)\b/);
  });
});
