import { describe, expect, it } from 'vitest';
import {
  CONTAMINATION_RATE, CURVE_PARTICIPANTS, DEFAULT_PARTICIPANTS, ELEMENTS, GRID, HELPED_SECONDS, MAX_PARTICIPANTS, MEAN_HIT_RATE, NIELSEN_LANDAUER_L, NO_BIAS, PROBLEMS,
  expectedFound, foundAfter, heatmap, hitList, hitsOf, methodResults, nielsenLandauer, participantsFor, runSession, runSessions, sessionStats, summarize,
  type Bias, type ProblemId, type Session,
} from './model';

const BOTH: Bias = { leading: true, helping: true };
const LEADING: Bias = { leading: true, helping: false };
const HELPING: Bias = { leading: false, helping: true };
const SAMPLE = 10_000;
const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const problem = (id: ProblemId) => PROBLEMS.find((p) => p.id === id)!;
/** The first participant (from 1) matching a predicate: a hand-worked example to check the replay against. */
const firstWhere = (test: (s: Session) => boolean, bias: Bias = NO_BIAS) => {
  const found = ids(500).map((id) => runSession(id, bias)).find(test);
  if (!found) throw new Error('no such participant in the first 500');
  return found;
};
const only = (...wanted: ProblemId[]) => (s: Session) => (['icon', 'continue', 'coupon'] as const).every((p) => s.hits[p] === wanted.includes(p));

describe('the problems', () => {
  it('average to the 0.31 Nielsen and Landauer use', () => {
    expect(MEAN_HIT_RATE).toBeCloseTo(0.31, 10);
    expect(NIELSEN_LANDAUER_L).toBe(0.31);
  });
});

describe('the seeded participants', () => {
  it('are reproducible, and a bias toggle never changes who ran into what', () => {
    expect(runSession(3)).toEqual(runSession(3));
    for (const id of ids(200)) {
      for (const bias of [LEADING, HELPING, BOTH]) expect(runSession(id, bias).hits).toEqual(runSession(id).hits);
    }
  });

  it('run into each problem at the stated rate over 10,000 participants', () => {
    const hits = ids(SAMPLE).map(hitsOf);
    for (const p of PROBLEMS) {
      const rate = hits.filter((h) => h[p.id]).length / SAMPLE;
      expect(Math.abs(rate - p.p), p.id).toBeLessThan(0.02);
    }
  });

  it('actually reach each problem at the rate the problem table implies, since a participant who gave up never meets the later ones', () => {
    const sessions = ids(SAMPLE).map((id) => runSession(id));
    const reachedIcon = problem('icon').p;
    const stayAfterIcon = 1 - problem('icon').p * problem('icon').abandon;
    const stayAfterContinue = 1 - problem('continue').p * problem('continue').abandon;
    const expected: Record<ProblemId, number> = {
      icon: reachedIcon,
      continue: problem('continue').p * stayAfterIcon,
      coupon: problem('coupon').p * stayAfterIcon * stayAfterContinue,
    };
    for (const p of PROBLEMS) {
      const rate = sessions.filter((s) => hitList(s).includes(p.id)).length / SAMPLE;
      expect(Math.abs(rate - expected[p.id]), p.id).toBeLessThan(0.02);
    }
  });

  it('hand-worked: someone who meets no problem takes 19 s, makes no mistakes and buys the mug', () => {
    const s = firstWhere(only());
    expect(s.steps.map((x) => `${x.kind}:${x.element}`)).toEqual(['click:image', 'click:icon', 'click:continue', 'click:card', 'click:pay', 'done:pay']);
    expect(sessionStats(s)).toEqual({ success: true, seconds: 19, errors: 0, backtracks: 0, hesitations: 0 });
  });

  it('hand-worked: the icon costs 13 s, a wrong click and a backtrack', () => {
    const s = firstWhere((x) => only('icon')(x) && !x.wouldHaveGivenUp);
    expect(sessionStats(s)).toEqual({ success: true, seconds: 32, errors: 1, backtracks: 1, hesitations: 1 });
    expect(s.steps.find((x) => x.kind === 'hesitate')?.say).toBe(problem('icon').say);
  });

  it('hand-worked: the grey Continue costs 16 s, and the coupon box costs 8 s and two wrong clicks', () => {
    expect(sessionStats(firstWhere((x) => only('continue')(x) && !x.wouldHaveGivenUp))).toEqual({ success: true, seconds: 35, errors: 1, backtracks: 1, hesitations: 1 });
    expect(sessionStats(firstWhere((x) => only('coupon')(x) && !x.wouldHaveGivenUp))).toEqual({ success: true, seconds: 27, errors: 2, backtracks: 1, hesitations: 0 });
  });

  it('hand-worked: giving up at the icon ends the session at 4 + 9 + 8 = 21 s, unsuccessful', () => {
    const s = firstWhere((x) => only('icon')(x) && x.wouldHaveGivenUp);
    expect(sessionStats(s)).toEqual({ success: false, seconds: 21, errors: 0, backtracks: 0, hesitations: 1 });
    expect(s.steps[s.steps.length - 1].kind).toBe('giveup');
  });

  it('time, errors and backtracks add up from the problems each participant met (those who never gave up)', () => {
    const cost = { icon: 13, continue: 16, coupon: 8 } as const;
    const errors = { icon: 1, continue: 1, coupon: 2 } as const;
    const backtracks = { icon: 1, continue: 1, coupon: 1 } as const;
    for (const id of ids(300)) {
      const s = runSession(id);
      if (s.wouldHaveGivenUp) continue;
      const met = (['icon', 'continue', 'coupon'] as const).filter((p) => s.hits[p]);
      expect(sessionStats(s), `participant ${id}`).toMatchObject({
        success: true,
        seconds: 19 + met.reduce((sum, p) => sum + cost[p], 0),
        errors: met.reduce((sum, p) => sum + errors[p], 0),
        backtracks: met.reduce((sum, p) => sum + backtracks[p], 0),
      });
    }
  });

  it('click only inside the element they are clicking', () => {
    for (const s of runSessions(200)) {
      for (const step of s.steps) {
        const { rows, cols } = ELEMENTS[step.element];
        expect(step.at.r).toBeGreaterThanOrEqual(rows[0]);
        expect(step.at.r).toBeLessThanOrEqual(rows[1]);
        expect(step.at.c).toBeGreaterThanOrEqual(cols[0]);
        expect(step.at.c).toBeLessThanOrEqual(cols[1]);
      }
    }
  });

  it('keep time moving forward, and end with done or giving up', () => {
    for (const s of runSessions(200)) {
      s.steps.forEach((x, i) => {
        if (i > 0) expect(x.t).toBeGreaterThanOrEqual(s.steps[i - 1].t);
      });
      expect(['done', 'giveup']).toContain(s.steps[s.steps.length - 1].kind);
    }
  });
});

describe('bias', () => {
  it('contaminates about 60% of sessions per toggle, and none with both off', () => {
    const rate = (bias: Bias, kind: 'leading' | 'helping') => ids(SAMPLE).filter((id) => runSession(id, bias).contaminated.includes(kind)).length / SAMPLE;
    expect(Math.abs(rate(LEADING, 'leading') - CONTAMINATION_RATE)).toBeLessThan(0.02);
    expect(Math.abs(rate(HELPING, 'helping') - CONTAMINATION_RATE)).toBeLessThan(0.02);
    expect(ids(500).every((id) => runSession(id).contaminated.length === 0)).toBe(true);
  });

  it('never changes a clean session, and never turns a success into a failure', () => {
    for (const id of ids(500)) {
      const base = runSession(id);
      for (const bias of [LEADING, HELPING, BOTH]) {
        const biased = runSession(id, bias);
        if (!biased.contaminated.length) expect(biased.steps).toEqual(base.steps);
        expect(sessionStats(biased).success || !sessionStats(base).success).toBe(true);
      }
    }
  });

  it('turns exactly the would-be give-ups of contaminated sessions into successes', () => {
    for (const id of ids(500)) {
      for (const bias of [LEADING, HELPING, BOTH]) {
        const biased = runSession(id, bias);
        const base = runSession(id);
        expect(biased.wouldHaveGivenUp).toBe(base.wouldHaveGivenUp);
        const rescued = base.wouldHaveGivenUp && biased.contaminated.length > 0;
        expect(sessionStats(biased).success).toBe(sessionStats(base).success || rescued);
      }
    }
  });

  it('inflates the success rate, and the clean sessions alone tell the truth', () => {
    const honest = summarize(runSessions(2000)).successRate;
    for (const bias of [LEADING, HELPING, BOTH]) {
      const s = summarize(runSessions(2000, bias));
      expect(s.successRate, JSON.stringify(bias)).toBeGreaterThan(honest);
      expect(Math.abs((s.cleanSuccessRate ?? 0) - honest)).toBeLessThan(0.05);
    }
  });

  it('helping shortens the hesitation to 4 s, and the facilitator is the one speaking', () => {
    const s = firstWhere((x) => x.contaminated.includes('helping') && x.hits.continue && !x.hits.icon && !x.hits.coupon, HELPING);
    const hesitation = s.steps.find((x) => x.kind === 'hesitate')!;
    expect(hesitation.speaker).toBe('facilitator');
    expect(s.steps[s.steps.indexOf(hesitation)].t - s.steps[s.steps.indexOf(hesitation) - 1].t).toBe(HELPED_SECONDS);
    expect(sessionStats(s).errors).toBe(0);
  });

  it('a leading question gets polite words instead of the real ones', () => {
    const s = firstWhere((x) => x.contaminated.includes('leading') && x.hits.icon, LEADING);
    expect(s.steps.find((x) => x.kind === 'hesitate')?.say).toBe('Yeah, that was easy.');
  });
});

describe('the results of a test', () => {
  const sessions = runSessions(MAX_PARTICIPANTS);

  it('heatmap counts every click and every wrong click, nothing else', () => {
    const counted = heatmap(sessions).flat().reduce((a, b) => a + b, 0);
    const steps = sessions.flatMap((s) => s.steps).filter((x) => x.kind === 'click' || x.kind === 'error').length;
    expect(counted).toBe(steps);
    expect(heatmap(sessions)).toHaveLength(GRID.rows);
  });

  it('found problems only ever grow, and a rare one needs more participants', () => {
    const all = runSessions(CURVE_PARTICIPANTS);
    let prev: ProblemId[] = [];
    for (let k = 0; k <= CURVE_PARTICIPANTS; k++) {
      const now = foundAfter(all, k);
      expect(now).toEqual(expect.arrayContaining(prev));
      expect(now.length).toBeLessThanOrEqual(PROBLEMS.length);
      prev = now;
    }
    expect(foundAfter(all, 0)).toEqual([]);
  });

  it('with the default 5 participants the rare problem is still unfound, and 15 find it', () => {
    const all = runSessions(CURVE_PARTICIPANTS);
    expect(foundAfter(all, DEFAULT_PARTICIPANTS)).toEqual(['icon', 'continue']);
    expect(foundAfter(all, CURVE_PARTICIPANTS)).toEqual(['icon', 'continue', 'coupon']);
  });

  it('the default five: 3 of 5 buy the mug; with leading questions or help, 4 of 5 appear to', () => {
    const rate = (bias: Bias) => summarize(runSessions(DEFAULT_PARTICIPANTS, bias)).successRate;
    expect(rate(NO_BIAS)).toBe(0.6);
    expect(rate(LEADING)).toBe(0.8);
    expect(rate(HELPING)).toBe(0.8);
  });
});

describe('Nielsen and Landauer', () => {
  it('five participants find about 84% at L = 0.31', () => {
    expect(nielsenLandauer(0.31, 5)).toBeCloseTo(0.8436, 4);
    expect(Math.round(nielsenLandauer(0.31, 5) * 100)).toBe(84);
  });

  it('is 0 with nobody, rises with every participant, and flattens', () => {
    expect(nielsenLandauer(0.31, 0)).toBe(0);
    let gain = Infinity;
    let prev = 0;
    for (let n = 1; n <= 15; n++) {
      const v = nielsenLandauer(0.31, n);
      expect(v).toBeGreaterThan(prev);
      expect(v - prev).toBeLessThan(gain);
      gain = v - prev;
      prev = v;
    }
  });

  it('a problem that 1 participant in 10 meets takes 15 participants to be found 80% of the time', () => {
    expect(nielsenLandauer(0.1, 15)).toBeGreaterThan(0.79);
    expect(nielsenLandauer(0.1, 14)).toBeLessThan(0.79);
  });

  it('needs 6 participants for 85% at L = 0.31, and more for a lower L', () => {
    expect(participantsFor(0.31, 0.85)).toBe(6);
    expect(nielsenLandauer(0.31, 6)).toBeGreaterThanOrEqual(0.85);
    expect(nielsenLandauer(0.31, 5)).toBeLessThan(0.85);
    expect(participantsFor(0.1, 0.85)).toBe(19);
    expect(nielsenLandauer(0.1, 18)).toBeLessThan(0.85);
    expect(nielsenLandauer(0.1, 19)).toBeGreaterThanOrEqual(0.85);
  });

  it('the three-problem expectation is below the single-average curve at five, because the rare problem lags', () => {
    expect(expectedFound(5)).toBeLessThan(nielsenLandauer(0.31, 5));
    expect(expectedFound(0)).toBe(0);
    expect(expectedFound(40)).toBeGreaterThan(0.97);
  });
});

describe('what each method reports', () => {
  const sessions = runSessions(CURVE_PARTICIPANTS);

  it('counts survey answers, coupon clicks and purchases from the sessions, and quotes only those who met the coupon box', () => {
    const r = methodResults(sessions);
    expect(r.n).toBe(15);
    expect(r.surveyYes).toBe(sessions.filter((s) => s.surveyYes).length);
    expect(r.paid).toBe(sessions.filter((s) => s.steps[s.steps.length - 1].kind === 'done').length);
    expect(r.couponClicks).toBe(sessions.filter((s) => s.hits.coupon && s.steps.some((x) => x.element === 'coupon')).length);
    expect(r.quotes.length).toBeGreaterThan(0);
    expect(r.quotes.every((q) => q.say === problem('coupon').say)).toBe(true);
  });

  it('the survey answer does not depend on what the participant did', () => {
    const yes = (s: Session) => s.surveyYes;
    expect(runSessions(2000).filter(yes).length / 2000).toBeGreaterThan(0.8);
    const stuck = runSessions(2000).filter((s) => !sessionStats(s).success);
    expect(stuck.filter(yes).length / stuck.length).toBeGreaterThan(0.8);
  });
});
