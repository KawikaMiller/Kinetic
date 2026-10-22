import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { experimentCaption, faultText, hypothesisAbortNote, initialExperiment, initialGame, initialMap, knifeEdgeNote, mapCaption, noAbortWarning, outcomeText, radiusRows, runnable, setsText } from './init';
import lesson from './index';
import { BROKEN_SEED, DEFAULT_FALLBACKS, SWEEP_SEEDS, defaultCard, downSet, evaluate, sweepGameDays, withFallbacks } from './model';

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: killing recs takes {recs, api, web}; with its fallback only recs', () => {
    const m = initialMap();
    expect(m.fallbacks).toEqual(DEFAULT_FALLBACKS);
    expect([...downSet(['recs'], m.fallbacks)].sort()).toEqual(['api', 'recs', 'web']);
    expect([...downSet(['recs'], { ...m.fallbacks, recs: true })]).toEqual(['recs']);
    expect(captionText(mapCaption({ ...m, killed: 'recs' }))).toContain('takes 3 of 7 services down');
    expect(lesson.tryThis[0]).toContain('recs, api and web');
  });

  it('try-this 2: killing cache takes nothing else down, and the table lists every service', () => {
    expect([...downSet(['cache'], DEFAULT_FALLBACKS)]).toEqual(['cache']);
    expect(radiusRows(DEFAULT_FALLBACKS).map((r) => r.radius)).toEqual([1, 2, 3, 3, 4, 1, 3]);
    expect(lesson.tryThis[1]).toContain('fallback');
  });

  it('try-this 3: the default card is refuted and not aborted at 5%, and holds at 1%', () => {
    const s = initialExperiment();
    expect([s.card.fault.target, s.card.fault.k, s.card.exposure, s.card.hypothesis, s.card.abort.belowShare, s.card.abort.w, s.card.seed]).toEqual(['db', 1, 0.05, 0.99, 0.95, 2, 1]);
    const e = evaluate(runnable(s));
    expect(e.outcome.kind).toBe('refuted');
    const low = evaluate({ ...runnable(s), exposure: 0.01 });
    expect(low.outcome.kind).toBe('held');
    expect(lesson.tryThis[2]).toContain(`${(e.meanSuccess * 100).toFixed(2)}% against 99%`);
    expect(lesson.tryThis[2]).toContain(`${(low.meanSuccess * 100).toFixed(2)}%, and it holds`);
    expect(captionText(experimentCaption(s, e))).toContain('hypothesis refuted');
  });

  it('try-this 4: killing all of api at 100% aborts at tick 21 with 400 failed requests; with no abort the cost reads 12,000 and the page warns', () => {
    const s = initialExperiment();
    const base = { ...runnable(s), fault: { target: 'api' as const, kind: 'kill' as const, k: 4, p: 1 }, exposure: 1 };
    const aborted = evaluate(base);
    expect(aborted.outcome).toEqual({ kind: 'aborted', tick: 21 });
    expect(aborted.failedTotal).toBe(400);
    const none = evaluate({ ...base, abort: null });
    expect(none.failedTotal).toBe(12_000);
    expect(noAbortWarning(none, s.card.abort)).toBe('No abort condition: this experiment runs to the end however bad it gets: 12,000 failed requests.');
    expect(noAbortWarning(evaluate({ ...defaultCard(), abort: null }), s.card.abort)).toBeNull();
    expect(lesson.tryThis[3]).toContain('aborts at tick 21 with 400 failed requests');
    expect(lesson.tryThis[3]).toContain('12,000');
  });

  it('try-this 5: the flaw breaks the rule on the swept seeds without an abort and on none with one; the recs fallback drops the count but not to zero', () => {
    const g = initialGame();
    expect(g.recsFallback).toBe(false);
    const flaw = sweepGameDays(DEFAULT_FALLBACKS);
    const fixed = sweepGameDays(withFallbacks(true, true));
    expect(lesson.tryThis[4]).toContain(`${flaw.withoutAbort.length} of ${SWEEP_SEEDS} seeds without an abort and on ${flaw.withAbort.length} with one`);
    expect(lesson.tryThis[4]).toContain(`${fixed.withoutAbort.length} without an abort`);
    expect(fixed.withoutAbort.length).toBeGreaterThan(0);
  });
});

describe('texts come from the model', () => {
  it('fault and outcome wording', () => {
    expect(faultText(defaultCard().fault, 0.05)).toBe('kill 1 of 4 instances of db with 5% of traffic exposed');
    expect(faultText({ target: 'api', kind: 'errors', k: 1, p: 0.5 }, 1)).toBe('inject errors on 50% of api with 100% of traffic exposed');
    const e = evaluate(defaultCard());
    expect(outcomeText(e, defaultCard())).toContain('for this fault, this exposure and these 100 ticks');
    expect(setsText(DEFAULT_FALLBACKS)).toBe('2 of 128');
    expect(setsText(withFallbacks(true, true))).toBe('4 of 128');
  });
});

describe('on-screen claims come from the model (review fixes)', () => {
  it('the pinned game-day seed is the first seed of the flaw sweep and the default of the game scene', () => {
    expect(BROKEN_SEED).toBe(2);
    expect(sweepGameDays(DEFAULT_FALLBACKS).withoutAbort[0]).toBe(initialGame().seed);
  });

  it('the "aborts before it can refute" note only says it aborted when the run aborted, and the old always-on wording is gone', () => {
    const base = { ...runnable(initialExperiment()), hypothesis: 0.9, abort: { belowShare: 0.95, w: 2 } };
    const held = evaluate({ ...base, fault: { target: 'api' as const, kind: 'kill' as const, k: 4, p: 1 }, exposure: 0.01 });
    expect(held.outcome.kind).toBe('held');
    const note = hypothesisAbortNote({ ...base, fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 0.01 }, held)!;
    expect(note).not.toContain('This experiment will abort');
    expect(note).not.toContain('aborted before');
    expect(note).toContain('It did not drop here');
    const apiAll = { ...base, fault: { target: 'api' as const, kind: 'kill' as const, k: 4, p: 1 }, exposure: 1 };
    const aborted = evaluate(apiAll);
    expect(aborted.outcome.kind).toBe('aborted');
    expect(hypothesisAbortNote(apiAll, aborted)).toContain('This experiment aborted before it could refute the hypothesis');
    expect(hypothesisAbortNote({ ...base, hypothesis: 0.99 }, held)).toBeNull();
  });

  it('an aborted outcome says what success averaged; a knife-edge abort line gets the coin-flip note and a clear one does not', () => {
    const apiAll = { ...runnable(initialExperiment()), fault: { target: 'api' as const, kind: 'kill' as const, k: 4, p: 1 }, exposure: 1 };
    const aborted = evaluate(apiAll);
    expect(outcomeText(aborted, apiAll)).toContain('aborted at tick 21 (success averaged');
    // db kill 4 at 1% exposure: expected success 99.00%; abort line 99%: the review's coin flip.
    const edge = { ...runnable(initialExperiment()), fault: { target: 'db' as const, kind: 'kill' as const, k: 4, p: 1 }, exposure: 0.01, abort: { belowShare: 0.99, w: 1 } };
    expect(knifeEdgeNote(edge)).toContain('coin flip');
    expect(knifeEdgeNote(runnable(initialExperiment()))).toBeNull();
    expect(knifeEdgeNote({ ...edge, abort: null })).toBeNull();
  });

  it('no try-this prints "null" or "undefined"', () => {
    for (const t of lesson.tryThis) expect(t).not.toMatch(/\bnull\b|undefined/);
  });
});

describe('quiz balance', () => {
  it('the correct option is strictly the longest in at most one question of five', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });
});
