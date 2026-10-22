import { describe, expect, it } from 'vitest';
import { forbiddenCalls, NO_CLOCK_OR_TIMER } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { ADVERSARY_ROUNDS, adversaryRun, casRun, firstAttempt, progressVerdict, suspendedRun } from './counter';
import { FACTS } from './facts';
import lesson from './index';
import { PRESETS, search } from './stack';

const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const lessonSources = Object.fromEntries(Object.entries(sources).filter(([file]) => !file.includes('.test.')));
const reuse = PRESETS[0].programs;

describe('source', () => {
  it('makes no network call, evaluates no text, reads no clock and starts no timer', () => {
    expect(forbiddenCalls(lessonSources, { also: NO_CLOCK_OR_TIMER, ignoreComments: true })).toEqual([]);
  });
});

describe('scenes', () => {
  it('every scene component carries its own key, and none is shared between scenes', () => {
    const els = sceneElements('lock-free-cas');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('lock-free-cas')).toEqual([]);
  });

  it('scene 2 opens on ABA via reuse in plain mode, scene 1 on 2 threads with no steps taken', () => {
    expect(PRESETS[0].id).toBe('reuse');
    expect(casRun(2, []).steps).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: T1 then T2 retries nothing; both loading first makes T2\'s CAS fail with the stated message; 4 of 6 retry', () => {
    expect(casRun(2, [0, 0, 1, 1]).state.failed).toBe(0);
    const r = casRun(2, [0, 1, 0, 1]);
    expect(r.steps[3].text).toContain('x is now 1, you expected 0');
    expect(r.steps[3].actor).toBe('T2');
    expect(r.state.failed).toBe(1);
    expect([firstAttempt(2).retrying, firstAttempt(2).interleavings]).toEqual([4, 6]);
    expect(lesson.tryThis[0]).toContain('4 of the 6');
  });

  it('try-this 2: plain CAS on "ABA via reuse" replays 15 steps and ends with "B is on the stack and on the free list"', () => {
    const r = search(reuse, { mode: 'plain' });
    expect(r.violation!.path).toHaveLength(15);
    expect(r.violation!.message).toBe('B is on the stack and on the free list');
    expect(lesson.tryThis[1]).toContain('15 steps');
    expect(lesson.tryThis[1]).toContain('B is on the stack and on the free list');
  });

  it('try-this 3: the same program is clean under tagged (116 states) and hazard pointers (305 states), exhaustively', () => {
    const tagged = search(reuse, { mode: 'tagged' });
    const hazard = search(reuse, { mode: 'hazard' });
    expect([tagged.violation, hazard.violation]).toEqual([null, null]);
    expect([tagged.truncated, hazard.truncated]).toEqual([false, false]);
    expect(lesson.tryThis[2]).toContain('116 states');
    expect(lesson.tryThis[2]).toContain('305 states');
  });

  it('try-this 4: the adversary run fails T1 12 times in 12 rounds while T2 completes 12; fetch_add finishes T1 in one step', () => {
    const a = adversaryRun('cas');
    expect([a.failed[0], a.completed[1], ADVERSARY_ROUNDS]).toEqual([12, 12, 12]);
    expect(adversaryRun('fetch_add').t1Steps).toBe(1);
    expect(lesson.tryThis[3]).toContain('failed 12 times in 12 rounds');
    expect(lesson.tryThis[3]).toContain('T2 completed 12');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model\'s numbers', () => {
    expect(lesson.keyIdeas[1]).toContain('15 steps');
    expect(lesson.keyIdeas[2]).toContain('after 18 steps');
    expect(lesson.keyIdeas[3]).toContain('failed 12 times in 12 rounds');
    expect(lesson.quiz[4].why).toContain('4 of the 6');
    expect(FACTS.lockT2).toBe(0);
  });
});

describe('fix pass: captions and text derive from the model', () => {
  it('scene 3 never says a fetch_add is suspended "in the middle of its increment"; a CAS loop is suspended between its load and its CAS', () => {
    expect(progressVerdict('fetch_add', 'suspend', suspendedRun('fetch_add'))).not.toContain('middle of its increment');
    expect(progressVerdict('fetch_add', 'suspend', suspendedRun('fetch_add'))).toContain('one atomic step');
    expect(progressVerdict('cas', 'suspend', suspendedRun('cas'))).toContain('between its load and its CAS');
    expect(sources['./ProgressScene.tsx']).toContain('from-memory');
  });

  it('the scripted adversary never lets T1 win a round (the removed branch was unreachable)', () => {
    const a = adversaryRun('cas');
    expect(a.completed[0]).toBe(0);
    expect(a.steps.filter((s) => s.thread === 1 && s.kind === 'ok')).toHaveLength(0);
  });

  it('watch names yellow for what happens now, quiz 5 does not say "in both", the CAS tables scroll on a phone, and the replay keeps the result line', () => {
    expect(lesson.summary.watch).toContain('ringed in yellow');
    expect(lesson.summary.watch).not.toContain('blue-green');
    expect(lesson.quiz[4].why).not.toContain('in both');
    expect((sources['./CasScene.tsx'].match(/<WideRegion minWidth=\{TABLE_MIN_WIDTH\} noun="table"><table/g) ?? [])).toHaveLength(2);
    expect(sources['./StackScene.tsx']).toContain('startText={resultLine ?? undefined}');
  });
});
