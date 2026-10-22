import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { delaySub, editedLabel, exhaustiveText, huntCaption, initialExhaustive, initialHunt, initialLeak, initialMove, leakIntro, moveCaption, seededText } from './init';
import lesson from './index';
import {
  BROKEN_SEED, REPLAYS, bisectBoundary, boundaryOf, defaultBooking, exploreBooking, hunt, replayAgreement, replicateDelay, replicateDropped, resetAmbient, runBooking, runGap, seededLeg,
  type BookingSetup,
} from './model';

const setup = (over: Partial<BookingSetup> = {}): BookingSetup => ({ ...defaultBooking(), ...over });

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the defaults hunt finds the first failing seed and the failure count the text names, next to the exact 32.6%', () => {
    const s = initialHunt();
    expect([s.windowMs, s.loss, s.n, s.start, s.ran]).toEqual([30, 0, 200, 1, false]);
    const h = hunt(setup({ windowMs: s.windowMs, loss: s.loss }), s.start, s.n);
    expect(lesson.tryThis[0]).toContain(`seed ${h.failures[0]} is the first to oversell after ${h.triesToFirst} seeds`);
    expect(lesson.tryThis[0]).toContain(`${h.failures.length} of 200 fail`);
    expect(lesson.tryThis[0]).toContain('32.6%');
    expect(captionText(huntCaption({ ...s, ran: true }, h))).toContain(`Seed ${h.failures[0]} is the first to oversell`);
    expect(captionText(huntCaption(s, null))).toContain('Press Hunt');
  });

  it('try-this 2: the selected failing seed replays to the identical hash twice', () => {
    const first = hunt(setup(), 1, 200).failures[0];
    const hashes = [0, 1, 2].map(() => runBooking(setup({ seed: first })).hash);
    expect(new Set(hashes).size).toBe(1);
    expect(lesson.tryThis[1]).toContain(`${hashes[0]} each`);
  });

  it('try-this 3: at gap 0 both are granted; +4 ms passes (past the traced delay) and returning under it fails again', () => {
    const m = initialMove();
    expect([m.seed, m.gap]).toEqual([BROKEN_SEED, 0]);
    const l = boundaryOf(BROKEN_SEED, 1);
    expect(runGap(BROKEN_SEED, 0).failed).toBe(true);
    expect(l).toBeLessThan(4);
    expect(runGap(BROKEN_SEED, 4).failed).toBe(false);
    expect(runGap(BROKEN_SEED, Math.floor(l)).failed).toBe(true);
    expect(lesson.tryThis[2]).toContain(`${l.toFixed(2)} ms`);
    expect(captionText(moveCaption(m, true, true, { delayMs: l, dropped: false }))).toContain('both clients are granted the seat');
    expect(lesson.tryThis[2]).toContain('Show the boundary');
    expect(lesson.tryThis[2]).toContain('the traced boundary is hidden');
  });

  it('try-this 4: with the leak on the hashes differ press to press, and 20 replays agree on the number the text names (against 20 with it off)', () => {
    const l = initialLeak();
    expect([l.leak, l.fix, l.seed]).toEqual([false, false, BROKEN_SEED]);
    resetAmbient();
    const hashes = Array.from({ length: 3 }, () => runBooking(setup({ seed: BROKEN_SEED, leak: true })).hash);
    expect(new Set(hashes).size).toBe(3);
    resetAmbient();
    const r = replayAgreement(setup({ seed: BROKEN_SEED, leak: true }));
    expect(lesson.tryThis[3]).toContain(`replay agreement reads ${r.agree} of ${REPLAYS}`);
    expect(r.agree).toBeLessThan(REPLAYS);
    expect(replayAgreement(setup({ seed: BROKEN_SEED })).agree).toBe(REPLAYS);
    resetAmbient();
  });

  it('try-this 5: the single writer fails on none of 200 seeds, and the explorer holds in the 8 states of its model', () => {
    const fixed = hunt(setup({ mode: 'single-writer' }), 1, 200);
    expect(fixed.failures.length).toBe(0);
    expect(lesson.tryThis[4]).toContain('0 failed');
    const ex = exploreBooking('single-writer');
    expect(lesson.tryThis[4]).toContain(`all ${ex.states} states`);
    expect(initialExhaustive().mode).toBe('async');
  });
});

describe('the fixed phrasings of a check', () => {
  it('exhaustive, found a counterexample, and sampled', () => {
    expect(exhaustiveText(exploreBooking('single-writer'))).toBe('Holds in all 8 reachable states of this model: two replicas, the two bookings, every delivery order, any message lost or delivered twice.');
    expect(exhaustiveText(exploreBooking('async'))).toContain('Shortest counterexample: 2 steps');
    expect(seededText(seededLeg('single-writer'))).toBe('200 schedules passed (seeds 1 to 200, with 10% loss and 15% duplication); sampled, not exhaustive.');
    expect(seededText(seededLeg('async'))).toContain('both A and B granted');
  });
});

describe('on-screen claims come from the run (review fixes)', () => {
  const moveRun = (m: ReturnType<typeof initialMove>) =>
    runBooking({ ...defaultBooking(m.seed), t1: 100, t2: Math.max(0, 100 + m.gap), requestA: m.requestA, requestB: m.requestB, dropReplicate: m.dropReplicate });
  const baseRun = (m: ReturnType<typeof initialMove>) => runBooking({ ...defaultBooking(m.seed), t1: 100, t2: Math.max(0, 100 + m.gap) });
  const caption = (m: ReturnType<typeof initialMove>) => {
    const run = moveRun(m);
    return captionText(moveCaption(m, run.failed, baseRun(m).failed, { delayMs: replicateDelay(run), dropped: replicateDropped(run) }));
  };

  it('the boundary is hidden until asked, then printed in the FAILING state too, and equals the independently bisected boundary', () => {
    const m = initialMove();
    const boundary = bisectBoundary(BROKEN_SEED, 1).toFixed(2);
    expect(moveRun(m).failed).toBe(true);
    expect(caption(m)).not.toContain(boundary);
    expect(caption(m)).toContain('hidden until you press Show the boundary');
    expect(delaySub(m)).toContain('hidden');
    expect(delaySub(m)).not.toContain(boundary);
    const shown = { ...m, reveal: true };
    expect(caption(shown)).toContain(`${boundary} ms`);
    expect(caption(shown)).not.toContain('No replicate message was delivered');
    expect(delaySub(shown)).toContain('when A is first');
    for (const gap of [-3, 0, 2]) {
      const at = { ...shown, gap };
      const run = moveRun(at);
      expect(run.failed, `gap ${gap}`).toBe(true);
      expect(Math.abs(replicateDelay(run)! - boundaryOf(BROKEN_SEED, gap >= 0 ? 1 : -1))).toBeLessThan(1e-9);
      expect(caption(at)).toContain(`${replicateDelay(run)!.toFixed(2)} ms`);
    }
  });

  it('the edited-list label follows the unedited and the edited verdicts, including the review repro (+50 ms, add the drop: the edit CAUSES the failure)', () => {
    expect(editedLabel(true, true)).toBe('still fails');
    expect(editedLabel(true, false)).toBe('now passes');
    expect(editedLabel(false, true)).toBe('now fails');
    expect(editedLabel(false, false)).toBe('still passes');
    const plus50 = { ...initialMove(), gap: 50 };
    expect(baseRun(plus50).failed).toBe(false);
    const withDrop = { ...plus50, dropReplicate: true };
    expect(moveRun(withDrop).failed).toBe(true);
    expect(caption(withDrop)).toContain('the edit caused the failure');
    const removeA = { ...initialMove(), requestA: false };
    expect(moveRun(removeA).failed).toBe(false);
    expect(caption(removeA)).toContain('no race');
    expect(caption(removeA)).not.toContain('oversells when the later request');
    expect(editedLabel(baseRun(removeA).failed, moveRun(removeA).failed)).toBe('now passes');
  });

  it('the leak scene intro follows the run: a passing seed, the single writer and the leak are each described correctly', () => {
    const failing = runBooking({ ...defaultBooking(BROKEN_SEED), leak: false });
    expect(leakIntro(BROKEN_SEED, failing.failed, false, false)).toContain(`Seed ${BROKEN_SEED} oversells`);
    const passingSeed = [1, 2, 3, 4, 5, 6, 7].find((s) => !runBooking({ ...defaultBooking(s) }).failed)!;
    expect(leakIntro(passingSeed, false, false, false)).toContain(`Seed ${passingSeed} passes with independent grants`);
    expect(leakIntro(BROKEN_SEED, false, false, true)).toContain('passes, because all bookings go through r1');
    expect(leakIntro(BROKEN_SEED, true, true, false)).toContain('almost every replay');
    for (const [f, l, x] of [[true, false, false], [false, true, true], [false, false, false]] as const) expect(leakIntro(1, f, l, x)).not.toContain('is a failing schedule');
  });

  it('the exhaustive scene says why its seed differs from the hunt scene, and names the loss and duplication it ran with', () => {
    expect(seededText(seededLeg('async'))).toContain('10% loss and 15% duplication');
    expect(seededText(seededLeg('async'))).toContain("Hunt scene's lowest seed");
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
