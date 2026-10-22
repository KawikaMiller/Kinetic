import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { answers, cheaterGame, meter, policyCall, proverKind, verdict, verifierCall, type Side } from './cave';
import { FACTS } from './facts';
import lesson from './index';
import { DEFAULT_R, DEFAULT_X, GROUP_A, commit, compareTriples, extract, publicKey, realTriples, respond, simulatedTriples, verify } from './schnorr';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared between scenes', () => {
    const els = sceneElements('zero-knowledge-proofs');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('zero-knowledge-proofs')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: the default seed 7 prover knows the passphrase; five random calls all pass and the meter reads 0.96875', () => {
    expect(proverKind(7)).toBe('knows');
    const calls: Side[] = [0, 1, 2, 3, 4].map((i) => verifierCall(7, i));
    const rounds = answers('knows', 7, calls, 'manual');
    expect(meter(rounds).value).toBe(0.96875);
    expect(lesson.tryThis[0]).toContain('reads 0.96875');
    expect(verdict('knows', true).correct).toBe(true);
  });

  it('try-this 2: seed 3 is a cheater; "always left" ten times passes 10 of 10, the meter reads 0.9990234375 struck out, and Accept is wrong', () => {
    expect(proverKind(3)).toBe('cheater');
    const calls: Side[] = Array.from({ length: 10 }, (_, i) => policyCall('always-left', i, 3));
    const rounds = answers('cheater', 3, calls, 'always-left');
    const m = meter(rounds);
    expect([m.passed, m.value, m.struck]).toEqual([10, 0.9990234375, true]);
    expect(verdict('cheater', true).correct).toBe(false);
    expect(lesson.tryThis[1]).toContain('reads 0.9990234375 but is struck out');
  });

  it('try-this 3: five rounds as the cheater: surviving them has probability 2^-5 = 0.03125, about 3.1%', () => {
    expect(FACTS.survive5).toBe(0.03125);
    expect(FACTS.survive5Percent).toBe('3.1');
    expect(lesson.tryThis[2]).toContain('0.03125, about 3.1%');
    // entering the side the verifier will call survives; any other side is caught in that round
    const sides: Side[] = [0, 1, 2, 3, 4].map((i) => verifierCall(7, i));
    expect(cheaterGame(7, sides).caughtAt).toBeNull();
  });

  it('try-this 4: group A, x = 7, r = 5, c = 4 gives s = 0 and both sides 1; the same t with c = 3 is accepted', () => {
    const y = publicKey(GROUP_A, DEFAULT_X);
    const t = commit(GROUP_A, DEFAULT_R);
    expect(respond(GROUP_A, DEFAULT_R, 4n, DEFAULT_X)).toBe(0n);
    expect(verify(GROUP_A, y, t, 4n, 0n)).toMatchObject({ lhs: 1n, rhs: 1n, ok: true });
    expect(verify(GROUP_A, y, t, 3n, respond(GROUP_A, DEFAULT_R, 3n, DEFAULT_X)).ok).toBe(true);
    expect(lesson.tryThis[3]).toContain('s = 0 and both sides equal 1');
  });

  it('try-this 5: rewinding with c = 4 and c\' = 3 gives x = 7, and the 121 real and 121 simulated triples are the same set', () => {
    expect(extract(GROUP_A, 4n, 0n, 3n, 4n)).toBe(7n);
    const y = publicKey(GROUP_A, DEFAULT_X);
    expect(compareTriples(GROUP_A, y, realTriples(GROUP_A, DEFAULT_X), simulatedTriples(GROUP_A, y)).identical).toBe(true);
    expect(lesson.tryThis[4]).toContain('x = 7');
    expect(lesson.tryThis[4]).toContain('121 real and 121 simulated');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas quote the model numbers', () => {
    expect(lesson.keyIdeas[0]).toContain('0.96875');
    expect(lesson.keyIdeas[1]).toContain('1/11');
    expect(lesson.keyIdeas[3]).toContain(`c = ${FACTS.challengeFs}`);
    expect(FACTS.challengeFs).toBe('9');
    expect(FACTS.sFs).toBe('2');
  });
});
