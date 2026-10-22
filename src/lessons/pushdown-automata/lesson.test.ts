import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { buildCaption, duelCaption } from './captions';
import { MAX_K, MIN_K, MAX_N, boundedCounter, duel } from '../../core/automataDuel';
import { FACTS } from './facts';
import { playFrames } from './frames';
import lesson from './index';
import { checkTable, parseTable } from './learner';
import { PRESETS, build, checkSubject, presetById } from '../../core/pdaPresets';
import { ANBN_TABLE, BUG_TABLE, OPENING, SOLUTION_TABLE } from './opening';
import { stepRun } from '../../core/pdaStepper';

const clean = (node: Parameters<typeof expectCaption>[0]) => expect(expectCaption(node)).not.toMatch(/NaN|undefined|\[object|null/);
const table = (text: string) => {
  const r = parseTable(text);
  if (!r.ok) throw new Error(r.error);
  return r.pda;
};

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    expect(sceneElements('pushdown-automata')).toHaveLength(3);
    expect(sceneElements('pushdown-automata').every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('pushdown-automata')).toEqual([]);
  });

  it('each scene opens on fixed input the model accepts', () => {
    expect(OPENING.scene).toBe('stepper');
    expect(checkSubject(OPENING.stepper.subject).ok).toBe(true);
    expect(OPENING.duel.n).toBe(OPENING.duel.k + 1);
    expect(parseTable(OPENING.build.text).ok).toBe(true);
    expect(OPENING.build.text).toBe(ANBN_TABLE);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: aaabbb accepts in 7 moves with the stack 4 deep by final state and in 7 by empty stack; aab leaves one symbol', () => {
    expect([FACTS.moves, FACTS.peakStack, FACTS.emptyStackMoves]).toEqual([7, 4, 7]);
    const empty = build(presetById('anbn'), 'empty-stack');
    const run = stepRun(empty.pda, OPENING.stepper.subject, empty.accept);
    expect(run.frames[run.frames.length - 1].configs[0].stack).toBe('');
    expect(FACTS.leftoverText).toBe('rejected: input finished with 1 symbol still on the stack');
  });

  it('try-this 2: wwr on abba keeps several configurations live and one accepts', () => {
    expect(FACTS.wwrSample).toBe('abba');
    expect(FACTS.wwrPeak).toBeGreaterThan(1);
    const { pda, accept } = build(presetById('wwr'), 'final-state');
    expect(stepRun(pda, 'abba', accept).status).toBe('accepted');
  });

  it('try-this 3: the k = 3 DFA has 8 states, rejects a^4 b^4 where the PDA accepts, and both accept at n = 3', () => {
    expect([FACTS.dfaStates, FACTS.dfaAtN, FACTS.pdaAtN, FACTS.firstDisagreement]).toEqual([8, false, true, 4]);
    expect(duel(FACTS.k, FACTS.k)).toMatchObject({ dfaAccepts: true, pdaAccepts: true });
  });

  it('try-this 4: the as-built table fails on ab as an accepted non-member, the solution passes all 1023 strings', () => {
    expect([FACTS.asBuiltInput, FACTS.asBuiltReason]).toEqual(['ab', 'accepted a string that is not in the language']);
    expect([FACTS.solutionChecked, FACTS.solutionPasses]).toEqual([1023, true]);
    expect(lesson.tryThis[3]).toContain('The first disagreement is ab');
    expect(checkTable(table(SOLUTION_TABLE)).first).toBeNull();
    expect(checkTable(table(BUG_TABLE)).first?.input).toBe('abb');
  });
});

describe('the control cross product gives clean captions', () => {
  it('every machine, both modes, a sample of each kind, and the budget case', () => {
    for (const preset of PRESETS) {
      for (const accept of ['final-state', 'empty-stack'] as const) {
        const { pda } = build(preset, accept);
        for (const s of [...preset.samples, '', 'a'.repeat(14)]) for (const f of playFrames(pda, stepRun(pda, s, accept), s, accept)) clean(f.say);
      }
    }
    const loop = table('q0 - Z -> q0 ZZ');
    const frames = playFrames(loop, stepRun(loop, 'a', 'empty-stack'), 'a', 'empty-stack');
    expect(expectCaption(frames[frames.length - 1].say)).toContain('Did not finish within 5,000 configurations');
  });

  it('the duel captions for every k and n', () => {
    for (let k = MIN_K; k <= MAX_K; k++) {
      for (let n = 0; n <= MAX_N; n++) clean(duelCaption({ k, n, result: duel(k, n), states: boundedCounter(k).states.length }));
    }
  });

  it('the build captions before a check, after a pass and after each failure', () => {
    clean(buildCaption(null));
    for (const text of [ANBN_TABLE, BUG_TABLE, SOLUTION_TABLE]) clean(buildCaption(checkTable(table(text))));
  });

  it('a first-string disagreement says "1 string", and a budget stop is not called a disagreement', () => {
    const rejectsAll = checkTable(table('q0 a Z -> q0 AZ'));
    expect(rejectsAll.first?.input).toBe('');
    expect(expectCaption(buildCaption(rejectsAll))).toContain('after 1 string:');
    const loop = checkTable(table('q0 - Z -> q0 ZZ'));
    const text = expectCaption(buildCaption(loop));
    expect(text).toContain('not a disagreement');
    expect(text).not.toContain('First disagreement');
  });
});
