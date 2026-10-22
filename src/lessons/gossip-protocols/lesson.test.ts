import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import {
  MATRIX_MAX_NODES, MEMBER_START_ROUND, falsePairsSub, gridShape, initialMember, initialSpread, initialTheory, matrixCapText, memberSafetyText, membershipCaption, offsetNote,
  spreadCaption, spreadSafetyText, sweepSub, undrawnSuspicions,
} from './init';
import lesson from './index';
import {
  ACCURACY_ROUNDS, BROKEN_MEMBER, BROKEN_MEMBER_SEED, BROKEN_SPREAD, BROKEN_SPREAD_SEED, MEMBER_SAFETY_CHECK, SPREAD_SAFETY_CHECK, SWEEP_SEEDS, defaultMember, meanRounds, defaultSpread, failingSeeds, leftOut, pushReference,
  readMembership, roundsBelow, runMembership, runSpread, sweepSpread,
} from './model';

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the defaults run to the end in the round the text names, near the expectation of 7', () => {
    const s = initialSpread();
    expect(s.setup).toMatchObject({ n: 16, f: 1, mode: 'push', loss: 0, seed: 1, die: false });
    expect(s.round).toBe(0);
    const run = runSpread(s.setup);
    expect(run.completeAt).not.toBeNull();
    expect(lesson.tryThis[0]).toContain(`after round ${run.completeAt}`);
    expect(roundsBelow(s.setup)).toBe(7);
    expect(lesson.tryThis[0]).toContain('round 7)');
  });

  it('try-this 2: the measured mean rounds fall from push to pull to push-pull as the text says, and one seed can differ', () => {
    const base = defaultSpread();
    const mean = (mode: 'push' | 'pull' | 'push-pull') => sweepSpread({ ...base, mode }).meanRounds!;
    expect(mean('pull')).toBeLessThan(mean('push'));
    expect(mean('push-pull')).toBeLessThan(mean('pull'));
    for (const m of ['push', 'pull', 'push-pull'] as const) expect(lesson.tryThis[1]).toContain(mean(m).toFixed(1));
    expect(lesson.tryThis[1]).toContain('says 7, 6 and 4');
    expect(lesson.tryThis[1]).not.toContain('seed 1 needs');
  });

  it('try-this 3: the 200-seed means (not single seeds) take about twice the rounds at n = 256 as at n = 16, and the text points at the scene that shows the reference', () => {
    const small = sweepSpread(defaultSpread()).meanRounds!;
    const big = sweepSpread({ ...defaultSpread(), n: 256 });
    expect(big.failed).toBe(0);
    expect(big.meanRounds! / small).toBeGreaterThan(1.7);
    expect(big.meanRounds! / small).toBeLessThan(2.1);
    expect(lesson.tryThis[2]).toContain(`${big.meanRounds!.toFixed(1)} rounds against ${small.toFixed(1)} at n = 16`);
    expect(lesson.tryThis[2]).toContain(`(${pushReference(256).toFixed(1)} at n = 256)`);
    expect(lesson.tryThis[2]).toContain('"Push, pull and log n"');
    expect(lesson.tryThis[2]).not.toContain('Run to the end');
    expect(big.meanRounds!).toBeGreaterThan(pushReference(256) - 0.5);
  });

  it('try-this 4: the broken seed leaves nodes out and the setting fails on the share of seeds the text names', () => {
    const run = runSpread({ ...BROKEN_SPREAD, seed: BROKEN_SPREAD_SEED });
    const out = leftOut(run).length;
    expect(out).toBeGreaterThan(0);
    const fails = failingSeeds(BROKEN_SPREAD).length;
    expect(fails).toBeLessThanOrEqual(0.9 * SWEEP_SEEDS);
    expect(lesson.tryThis[3]).toContain(`${out} node`);
    expect(lesson.tryThis[3]).toContain(`on ${fails} of ${SWEEP_SEEDS} seeds`);
    expect(sweepSpread(BROKEN_SPREAD).failed).toBe(fails);
  });

  it('try-this 5: at fanout 2 and T_fail 12 nobody live is suspected; fanout 1 suspects some; T_fail 20 stops it; the crash is found later at 20', () => {
    const d = initialMember().setup;
    expect([d.n, d.f, d.tFail, d.seed]).toEqual([16, 2, 12, 1]);
    expect(readMembership(runMembership(d)).falsePairs).toBe(0);
    const short = readMembership(runMembership({ ...d, f: 1 }));
    const long = readMembership(runMembership({ ...d, f: 1, tFail: 20 }));
    expect(short.falsePairs).toBeGreaterThan(0);
    expect(long.falsePairs).toBe(0);
    const dShort = readMembership(runMembership({ ...d, f: 1, crash: true })).detection;
    const dLong = readMembership(runMembership({ ...d, f: 1, tFail: 20, crash: true })).detection;
    expect(dLong!).toBeGreaterThan(dShort!);
    expect(short.falsePairs).toBe(1);
    expect(lesson.tryThis[4]).toContain('1 observer-node pair suspects a live node');
    expect(short.firstFalseRound).toBeGreaterThan(MEMBER_START_ROUND);
    expect(lesson.tryThis[4]).toContain(`the first at round ${short.firstFalseRound}; the matrix opens at round ${MEMBER_START_ROUND}`);
    const run = runMembership({ ...d, f: 1 });
    expect(run.suspectsByRound[short.firstFalseRound!].some((l) => l.length > 0)).toBe(true);
    expect(run.suspectsByRound[MEMBER_START_ROUND].every((l) => l.length === 0)).toBe(true);
    expect(lesson.tryThis[4]).toContain(`Raise T_fail to 20: ${long.falsePairs}.`);
    expect(lesson.tryThis[4]).toContain(`${dLong} rounds at T_fail 20 against ${dShort} at 12`);
    expect(BROKEN_MEMBER.tFail).toBe(12);
    expect(BROKEN_MEMBER_SEED).toBe(1);
  });
});

describe('scenes open from pure states', () => {
  it('each opening state is its own value and the node grid always holds every node', () => {
    expect(initialSpread()).not.toBe(initialSpread());
    expect(initialTheory().measured).toBeNull();
    expect(initialMember().setup).toEqual(defaultMember());
    for (const n of [8, 16, 32, 64, 128, 256]) {
      const { rows, cols } = gridShape(n);
      expect(rows * cols).toBeGreaterThanOrEqual(n);
      expect(cols).toBeLessThanOrEqual(16);
    }
  });

  it('captions come from the run: the start, a mid round, the covered round and a horizon miss', () => {
    const run = runSpread(defaultSpread());
    expect(captionText(spreadCaption(run, 0))).toContain('One node of 16');
    expect(captionText(spreadCaption(run, 2))).toContain(`After round 2: ${run.counts[2]} of 16`);
    expect(captionText(spreadCaption(run, 99))).toContain(`After round ${run.completeAt} all 16`);
    const broken = runSpread({ ...BROKEN_SPREAD, seed: BROKEN_SPREAD_SEED });
    expect(captionText(spreadCaption(broken, 99))).toContain('never heard it by the horizon of 30 rounds');
    const m = defaultMember();
    expect(captionText(membershipCaption(m, readMembership(runMembership(m))))).toContain('No up node suspects an up node');
  });
});

describe('on-screen claims come from the model (review fixes)', () => {
  it('the measured-mean sub says the mean is over the seeds that covered everyone, from the sweep counts', () => {
    const sweep = sweepSpread(BROKEN_SPREAD);
    expect(sweep.failed).toBeGreaterThan(0);
    const [first, second] = sweepSub(sweep);
    expect(first).toContain(`over the ${sweep.completed} seeds that covered everyone`);
    expect(second).toContain(`on ${sweep.failed} of ${SWEEP_SEEDS} seeds`);
    expect(sweep.completed + sweep.failed).toBe(SWEEP_SEEDS);
  });

  it('membership caption and stat sub follow the false pairs: a cut that causes none says so, and a crash run still reports false suspicions', () => {
    const d = { ...defaultMember(), ...BROKEN_MEMBER, seed: BROKEN_MEMBER_SEED };
    const cutOnly = { ...d, f: 2, cut: true, cutRounds: 5 };
    const calm = readMembership(runMembership(cutOnly));
    expect(calm.falsePairs).toBe(0);
    expect(falsePairsSub(cutOnly, calm.falsePairs)).toContain('the cut caused none');
    expect(captionText(membershipCaption(cutOnly, calm))).not.toContain('cut may account');
    const crashBroken = { ...d, crash: true };
    const r = readMembership(runMembership(crashBroken));
    expect(r.falsePairs).toBeGreaterThan(0);
    expect(captionText(membershipCaption(crashBroken, r))).toContain('suspected a node that is up');
    const one = readMembership(runMembership(d));
    expect(one.falsePairs).toBe(1);
    expect(captionText(membershipCaption(d, one))).toContain('1 (observer, node) pair suspected');
  });

  it('the matrix is capped at 32 nodes a side and counts what it does not draw, checked against a direct count', () => {
    const setup = { ...defaultMember(), n: 64, f: 1, tFail: 4, seed: 3 };
    const run = runMembership(setup, 80);
    let hidden = 0;
    let drawn = 0;
    run.suspectsByRound[80].forEach((list, i) => list.forEach((j) => { if (i < MATRIX_MAX_NODES && j < MATRIX_MAX_NODES) drawn += 1; else hidden += 1; }));
    expect(hidden).toBeGreaterThan(0);
    expect(drawn).toBeGreaterThan(0);
    expect(undrawnSuspicions(run, 80)).toBe(hidden);
    expect(matrixCapText(64, hidden)).toContain('first 32 of 64 nodes');
  });

  it('the offset note gives the measured range, says another 200 seeds move it, and does not call the offset a constant', () => {
    const measured = [8, 16, 64, 256].map((n) => ({ n, mean: meanRounds({ ...defaultSpread(), n }) }));
    const note = offsetNote(measured, pushReference);
    expect(note).not.toContain('is a constant');
    expect(note).toContain('bounded, not exactly constant');
    expect(note).toContain('seeds 1 to 200');
    const offsets = measured.map((m) => m.mean - pushReference(m.n));
    expect(Math.max(...offsets)).toBeLessThan(1.3);
    expect(Math.min(...offsets)).toBeGreaterThan(0.2);
  });

  it('safety lines state the sampled check and match the constants the tests use', () => {
    expect(memberSafetyText()).toContain(`${MEMBER_SAFETY_CHECK.runs} seeded runs of ${MEMBER_SAFETY_CHECK.n} nodes`);
    expect(memberSafetyText()).toContain('not exhaustive');
    expect(spreadSafetyText()).toContain(`${SPREAD_SAFETY_CHECK.runs} seeded runs`);
    expect(spreadSafetyText()).toContain('not exhaustive');
    expect(ACCURACY_ROUNDS).toBe(100);
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
