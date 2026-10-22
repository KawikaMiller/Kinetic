import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER, NO_REGEXP_OR_FUNCTION } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { addStep, moveStep, removeStep, setEffect, setStep } from './edit';
import { FACTS } from './facts';
import lesson from './index';
import { ATOMIC, MAX_STEPS, NAIVE, PETERSON, atomicLockStates, check, randomTest, type Spec } from './spec';
import { checkText, randomText } from './text';

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const lessonSources = Object.fromEntries(Object.entries(sources).filter(([file]) => !file.includes('.test.')));
const wait = (spec: Spec, guard: string): Spec => setStep(spec, 2, { guard });

describe('source', () => {
  it('makes no network call, evaluates no text (no eval, no new Function, no bare Function call), reads no clock and starts no timer', () => {
    expect(forbiddenCalls(lessonSources, { also: [...NO_CLOCK_OR_TIMER, 'functionCall'], ignoreComments: true })).toEqual([]);
    expect(NO_REGEXP_OR_FUNCTION).toContain('functionCall');
  });
});

describe('scenes', () => {
  it('every scene component carries its own key, and none is shared between scenes', () => {
    const els = sceneElements('formal-methods');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('formal-methods')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: Check on Peterson says "holds in all 20 reachable states of this model"', () => {
    const r = check(PETERSON);
    expect(r.kind).toBe('holds');
    expect(checkText(r, PETERSON)).toContain('holds in all 20 reachable states of this model');
    expect(checkText(r, PETERSON)).toContain('a model of the lock, not your code');
    expect(lesson.tryThis[0]).toContain('holds in all 20 reachable states');
  });

  it('try-this 2: the wait guard set to true gives a violation with a shortest path of 6 steps that plays to two critical processes', () => {
    const r = check(wait(PETERSON, 'true'));
    expect(r.kind === 'violation' && r.steps).toBe(6);
    expect(r.kind === 'violation' && r.path[5].state.pcs).toEqual([3, 3]);
    expect(lesson.tryThis[1]).toContain('6 steps');
  });

  it('try-this 3: after restoring the guard, flagOther == 0 gives a deadlock after 4 steps from the default (deadlock check on)', () => {
    expect(PETERSON.deadlock).toBe(true);
    const restored = wait(wait(PETERSON, 'true'), 'flagOther == 0 || turn == me');
    expect(check(restored)).toEqual({ kind: 'holds', states: 20 });
    const r = check(wait(restored, 'flagOther == 0'));
    expect(r.kind).toBe('deadlock');
    expect(r.kind === 'deadlock' && r.steps).toBe(4);
    expect(lesson.tryThis[2]).toContain('deadlock after 4 steps');
  });

  it('try-this 4: the naive flag lock preset is violated in 4 steps', () => {
    const r = check(NAIVE);
    expect(r.kind === 'violation' && r.steps).toBe(4);
    expect(lesson.tryThis[3]).toContain('violated in 4 steps');
  });

  it('try-this 5: N from 2 to 6 gives 8, 20, 48, 112, 256 states', () => {
    expect([2, 3, 4, 5, 6].map((n) => atomicLockStates(n).states)).toEqual([8, 20, 48, 112, 256]);
    expect(lesson.tryThis[4]).toContain('8, 20, 48, 112, 256');
    expect(lesson.tryThis[4]).toContain('2² + 2 x 2¹ = 8');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model\'s numbers', () => {
    expect(lesson.keyIdeas[0]).toContain('20 states');
    expect(lesson.keyIdeas[2]).toContain('4 steps');
    expect(lesson.keyIdeas[2]).toContain('in 6');
    expect(lesson.quiz[3].why).toContain('8, 20, 48, 112, 256');
  });

  it('the random leg reports sampled results and a lowest failing seed that is not 0', () => {
    expect(FACTS.naiveRandomLowest).toBeGreaterThan(0);
    expect(FACTS.naiveRandomFailing).toBeGreaterThan(0);
    expect(randomText(randomTest(PETERSON))).toBe('Random testing: held on 200 of 200 seeded schedules (seeds 1 to 200); sampled, not exhaustive. That says those schedules passed, nothing more.');
    expect(randomText({ error: 'x' })).toBe('Random testing did not run: x');
  });
});

describe('editing the program', () => {
  it('add, remove and move respect the limits: at most 6 steps, at least 1, and the ends do not move', () => {
    let spec: Spec = ATOMIC;
    while (spec.steps.length < MAX_STEPS) {
      const r = addStep(spec);
      if (!r.ok) throw new Error(r.message);
      spec = r.spec;
    }
    const beyond = addStep(spec);
    expect(beyond).toEqual({ ok: false, message: 'At most 6 steps: remove one first.' });
    let small: Spec = spec;
    while (small.steps.length > 1) {
      const r = removeStep(small, 0);
      if (!r.ok) throw new Error(r.message);
      small = r.spec;
    }
    expect(removeStep(small, 0)).toEqual({ ok: false, message: 'The program needs at least 1 step.' });
    expect(small.critical).toBe(0);
    expect(moveStep(ATOMIC, 0, -1)).toEqual({ ok: false, message: 'Step 0 is already first.' });
    expect(moveStep(ATOMIC, 2, 1)).toEqual({ ok: false, message: 'Step 2 is already last.' });
  });

  it('moving the first two steps of Peterson down breaks it, with the 6-step trace of the spec', () => {
    const moved = moveStep(PETERSON, 0, 1);
    if (!moved.ok) throw new Error(moved.message);
    const r = check(moved.spec);
    expect(r.kind === 'violation' && r.steps).toBe(6);
    expect(check(setEffect(PETERSON, 0, 'none')).kind).not.toBe('refused');
  });

  it('removing a step before the critical one keeps the critical pc on the same step', () => {
    const r = removeStep(PETERSON, 0);
    if (!r.ok) throw new Error(r.message);
    expect(r.spec.critical).toBe(2);
    expect(r.spec.steps[r.spec.critical].effect).toBe('flagMe = 0');
  });
});
