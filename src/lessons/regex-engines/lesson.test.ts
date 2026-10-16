import { describe, expect, it } from 'vitest';
import { nfaRun } from '../../core/automata';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { matchAt } from './backtrack';
import { whichCaption } from './captions';
import { STEP_BUDGET, runNfa, whichAnswer, type RunMode } from './engines';
import { FACTS } from './facts';
import { TRACE_LIMIT, buildFrames, runFrames, traceFrames } from './frames';
import lesson from './index';
import { BACKTRACK_PRESETS, OPENING, PRESETS } from './opening';
import { parsePattern, parseSubject } from './regexParse';
import { WHICH_EXAMPLES } from './realExamples';
import { buildNfa, constructionOf } from './thompson';

const parsed = (p: string) => {
  const r = parsePattern(p);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('regex-engines');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('regex-engines')).toEqual([]);
  });

  it('each scene opens on fixed input that parses, and the automaton scenes can build it', () => {
    expect(OPENING.scene).toBe('build');
    for (const o of [OPENING.build, OPENING.run, OPENING.which, OPENING.backtrack]) {
      expect(parsePattern(o.pattern).ok, o.pattern).toBe(true);
      expect(parseSubject(o.subject).ok, o.subject).toBe(true);
    }
    for (const o of [OPENING.build, OPENING.run, OPENING.which]) expect(buildNfa(parsed(o.pattern)).ok, o.pattern).toBe(true);
    expect(OPENING.run.mode).toBe('full');
    expect(OPENING.which.rule).toBe('first');
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the construction ends at 12 states and 10 epsilon arrows within the bound 16, and a** is refused at position 3', () => {
    expect([FACTS.buildStates, FACTS.buildEpsilons, FACTS.buildBound]).toEqual([12, 10, 16]);
    const frames = buildFrames(parsed(OPENING.build.pattern), constructionOf(parsed(OPENING.build.pattern)));
    const last = frames[frames.length - 1];
    expect([last.states, last.epsilons]).toEqual([12, 10]);
    expect(expectCaption(last.say)).toContain('12 states and 10 ε arrows');
    expect(parsePattern('a**')).toEqual({ ok: false, error: 'Position 3: nothing to repeat.' });
    expect(lesson.tryThis[0]).toContain('"Position 3: nothing to repeat."');
  });

  it('try-this 2: the default run state-reads equal an independent core count and stay within 5 x 12 = 60; the growth preset is 12 vs 17', () => {
    const c = constructionOf(parsed(OPENING.run.pattern));
    const core = nfaRun(c.nfa, OPENING.run.subject);
    expect(core.steps.slice(0, -1).reduce((sum, s) => sum + s.length, 0)).toBe(FACTS.runWork);
    expect(FACTS.runWork).toBeLessThanOrEqual(FACTS.runBound);
    expect(FACTS.runBound).toBe(60);
    expect(runNfa(c, [...OPENING.run.subject], 'full').accepted).toBe(true);
    expect([FACTS.growthNfa, FACTS.growthDfa]).toEqual([12, 17]);
    expect(PRESETS.map((p) => p.pattern)).toContain(FACTS.growthPattern);
  });

  it('try-this 3: a|ab on ab returns "a" leftmost-first, "ab" longest, and real RegExp says "a"', () => {
    expect([FACTS.whichFirst, FACTS.whichLongest, FACTS.whichReal]).toEqual(['a', 'ab', 'a']);
    expect(/a|ab/.exec('ab')?.[0]).toBe('a');
  });

  it('try-this 4: (a*)*b on 12 a\'s takes 20481 steps against 72 state-reads, and 15 a\'s is cut off at the budget', () => {
    expect([FACTS.nestedSteps, FACTS.nestedNfaWork]).toEqual([20481, 72]);
    expect(FACTS.nestedBudgetLength - FACTS.nestedLength).toBe(3);
    const p = parsed(OPENING.backtrack.pattern);
    const longer = matchAt(p.root, [...'a'.repeat(FACTS.nestedBudgetLength)], 0, { budget: STEP_BUDGET, mustEnd: true });
    expect(longer.status).toBe('budget');
    const shorter = matchAt(p.root, [...'a'.repeat(FACTS.nestedBudgetLength - 1)], 0, { budget: STEP_BUDGET, mustEnd: true });
    expect(shorter.status).toBe('fail');
  });
});

describe('the control cross product gives clean captions', () => {
  const modes: RunMode[] = ['full', 'search'];
  it('every preset, mode and frame of the construction and the run', () => {
    for (const { pattern, subject } of PRESETS) {
      const p = parsed(pattern);
      const c = constructionOf(p);
      for (const f of buildFrames(p, c)) expect(expectCaption(f.say)).not.toMatch(/NaN|undefined|\[object/);
      for (const mode of modes) {
        const run = runNfa(c, [...subject], mode);
        for (const f of runFrames(c, [...subject], run, mode)) expect(expectCaption(f.say)).not.toMatch(/NaN|undefined|\[object/);
      }
    }
  });

  it('every backtracking preset gives clean trace captions, and the trace is capped', () => {
    for (const { pattern, subject } of BACKTRACK_PRESETS) {
      const p = parsed(pattern);
      const r = matchAt(p.root, [...subject], 0, { budget: STEP_BUDGET, mustEnd: true, traceLimit: TRACE_LIMIT });
      expect(r.trace.length).toBeLessThanOrEqual(TRACE_LIMIT);
      for (const f of traceFrames(p, r, [...subject])) expect(expectCaption(f.say)).not.toMatch(/NaN|undefined|\[object/);
    }
    const nested = parsed(OPENING.backtrack.pattern);
    const r = matchAt(nested.root, [...OPENING.backtrack.subject], 0, { budget: STEP_BUDGET, mustEnd: true, traceLimit: TRACE_LIMIT });
    expect(r.traceTruncated).toBe(true);
    expect(expectCaption(traceFrames(nested, r, [...OPENING.backtrack.subject]).at(-1)!.say)).toContain('first 200 of 20,481 steps');
  });

  it('the budget message names the budget, never "runs forever"', () => {
    const p = parsed('(a*)*b');
    const subject = [...'a'.repeat(16)];
    const r = matchAt(p.root, subject, 0, { budget: STEP_BUDGET, mustEnd: true, traceLimit: TRACE_LIMIT });
    const text = expectCaption(traceFrames(p, r, subject).at(-1)!.say);
    expect(text).toContain('Did not finish within 100,000 steps');
    expect(text).not.toMatch(/forever|never halt|infinite/i);
  });

  it('the which-match captions for every example and rule', () => {
    for (const e of WHICH_EXAMPLES) {
      const p = parsed(e.pattern);
      const answer = whichAnswer(constructionOf(p), p, [...e.subject]);
      for (const rule of ['first', 'longest'] as const) expect(expectCaption(whichCaption(e.pattern, e.subject, answer, rule))).not.toMatch(/NaN|undefined|\[object/);
    }
  });

  it('the fixed real-RegExp examples agree with the lesson leftmost-first matcher', () => {
    for (const e of WHICH_EXAMPLES) {
      const p = parsed(e.pattern);
      const answer = whichAnswer(constructionOf(p), p, [...e.subject]);
      expect(answer.first).toEqual(e.real ? { start: e.real.index, end: e.real.index + e.real.text.length } : null);
    }
  });
});
