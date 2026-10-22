import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { gridShape, initialMember, initialSpread, initialTheory, membershipCaption, spreadCaption } from './init';
import lesson from './index';
import {
  BROKEN_MEMBER, BROKEN_MEMBER_SEED, BROKEN_SPREAD, BROKEN_SPREAD_SEED, SWEEP_SEEDS, defaultMember, defaultSpread, failingSeeds, leftOut, pushReference,
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
    const seed1 = (['push', 'pull', 'push-pull'] as const).map((mode) => runSpread({ ...base, mode }).completeAt);
    expect(lesson.tryThis[1]).toContain(`seed 1 needs ${seed1[0]}, ${seed1[1]} and ${seed1[2]} rounds`);
  });

  it('try-this 3: n = 256 takes about twice the rounds of n = 16, and the measured mean beats the reference by a constant', () => {
    const small = runSpread(defaultSpread()).completeAt!;
    const big = runSpread({ ...defaultSpread(), n: 256 }).completeAt!;
    expect(big).toBeLessThan(3 * small);
    expect(lesson.tryThis[2]).toContain(`after round ${big}, against ${small} at n = 16`);
    expect(lesson.tryThis[2]).toContain(`${pushReference(256).toFixed(1)}`);
    const sweep = sweepSpread({ ...defaultSpread(), n: 256 });
    expect(sweep.failed).toBe(0);
    expect(sweep.meanRounds!).toBeGreaterThan(pushReference(256) - 0.5);
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
    expect(lesson.tryThis[4]).toContain(`${short.falsePairs} observer-node pairs`);
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

describe('quiz balance', () => {
  it('the correct option is strictly the longest in at most one question of five', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });
});
