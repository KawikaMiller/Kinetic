import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { SESSIONS_INTRO, curveCaption, methodCaption, stepCaption } from './captions';
import { CURVE_PARTICIPANTS, MAX_PARTICIPANTS, runSessions, methodResults, type Bias, type Session, type Step } from './model';

const BOTH: Bias = { leading: true, helping: true };

describe('replay captions', () => {
  it('read cleanly for every step of every participant, with and without bias', () => {
    expectCaption(SESSIONS_INTRO);
    for (const bias of [{ leading: false, helping: false }, { leading: true, helping: false }, { leading: false, helping: true }, BOTH]) {
      for (const s of runSessions(60, bias)) for (const step of s.steps) expectCaption(stepCaption(step, s));
    }
  });

  it('quotes what the participant said, and says when the facilitator or a leading question changed it', () => {
    const [p1] = runSessions(MAX_PARTICIPANTS);
    const hesitation = p1.steps.find((s) => s.kind === 'hesitate')!;
    expect(captionText(stepCaption(hesitation, p1))).toContain('thinking aloud: “It looks greyed out. Is it broken?”');

    const helped = runSessions(60, { leading: false, helping: true }).find((s) => s.contaminated.includes('helping') && s.hits.icon)!;
    expect(captionText(stepCaption(helped.steps.find((x) => x.kind === 'hesitate')!, helped))).toContain('a helped session');

    const led = runSessions(60, { leading: true, helping: false }).find((s) => s.contaminated.includes('leading') && s.hits.icon)!;
    expect(captionText(stepCaption(led.steps.find((x) => x.kind === 'hesitate')!, led))).toContain('the real problem goes unspoken');
  });

  it('calls a rescued session an inflated success, and a failure a failure', () => {
    const rescued = runSessions(60, BOTH).find((s) => s.contaminated.length && s.wouldHaveGivenUp)!;
    expect(captionText(stepCaption(rescued.steps[rescued.steps.length - 1], rescued))).toContain('an inflated success');
    const failed = runSessions(60).find((s) => s.steps[s.steps.length - 1].kind === 'giveup')!;
    expect(captionText(stepCaption(failed.steps[failed.steps.length - 1], failed))).toContain('task failed');
  });
});

describe('curve and method captions', () => {
  it('states the model and the test result', () => {
    const text = captionText(expectCaption(curveCaption(0.31, 5, 2, 3)));
    expect(text).toContain('5 participants find about 84%');
    expect(text).toContain('This test found 2 of 3');
    expect(captionText(curveCaption(0.31, 1, 1, 3))).toContain('1 participant finds about 31%');
  });

  it('each method says what it can and cannot, from the same participants', () => {
    const r = methodResults(runSessions(CURVE_PARTICIPANTS));
    expect(captionText(expectCaption(methodCaption('survey', r)))).toContain(`${r.surveyYes} of 15 said`);
    expect(captionText(expectCaption(methodCaption('analytics', r)))).toContain('not why');
    expect(captionText(expectCaption(methodCaption('test', r)))).toContain('Is this where I put my card?');
  });

  it('a test run that never met the coupon box says it learned nothing', () => {
    const none = methodResults(runSessions(5));
    expect(captionText(methodCaption('test', none))).toContain('Nobody in this run met the coupon box');
  });
});

describe('a leading-contaminated participant who hits a problem', () => {
  it('does not read as a clear think-aloud', () => {
    const session = { contaminated: ['leading'] } as unknown as Session;
    const step = { kind: 'error', element: 'coupon', t: 10, say: 'Yeah, that was easy.', speaker: 'participant' } as unknown as Step;
    expect(captionText(stepCaption(step, session))).toContain('the real problem goes unspoken');
  });
});

describe('the try-this at the default state', () => {
  it('P1 hesitates over the grey Continue button and takes 35 s against 19 s for a participant with no problem', () => {
    const [p1] = runSessions(MAX_PARTICIPANTS);
    const hesitation = p1.steps.find((s) => s.kind === 'hesitate')!;
    expect(hesitation.element).toBe('continue');
    expect(p1.steps[p1.steps.length - 1].t).toBe(35);
  });
});
