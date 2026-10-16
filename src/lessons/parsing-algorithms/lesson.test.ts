import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { bottomUpCaption, lockstepFrames, precedenceCaption, topDownCaption } from './captions';
import { FACTS } from './facts';
import { analyse, conflictCells, leftRecursive, predictiveTable, removeLeftRecursion } from './grammar';
import lesson from './index';
import { analyseLr, lrConflicts } from './lr';
import { OPENING } from './opening';
import { CONFLICTS, choiceId, playGame, usualChoices, type Choices } from './precedence';
import { PRESETS, presetGrammar } from './presets';
import { longestExpansionRun, runBottomUp, runTopDown } from './runs';

const words = (s: string) => s.split(' ').filter(Boolean);
const clean = (node: Parameters<typeof expectCaption>[0]) => expect(expectCaption(node)).not.toMatch(/NaN|undefined|\[object|null/);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    expect(sceneElements('parsing-algorithms')).toHaveLength(4);
    expect(sceneElements('parsing-algorithms').every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('parsing-algorithms')).toEqual([]);
  });

  it('each scene opens on fixed input that the model accepts', () => {
    expect(OPENING.scene).toBe('topdown');
    expect(PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining([OPENING.topdown.preset, OPENING.bottomup.preset, OPENING.lockstep.preset]));
    expect(OPENING.lockstep.policy).toBe('shift');
    expect(Object.values(OPENING.precedence).filter((v) => v === 'reduce')).toHaveLength(4);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the layered grammar has conflict cells and left recursion in E and T, stops at the budget of 50, and removing the recursion leaves 0 conflicts', () => {
    const g = presetGrammar(OPENING.topdown.preset);
    const a = analyse(g);
    const table = predictiveTable(g, a);
    expect(conflictCells(table)).toHaveLength(FACTS.layeredConflictCells);
    expect(leftRecursive(g, a)).toEqual(FACTS.layeredLeftRecursive);
    const run = runTopDown(g, table, words(OPENING.topdown.tokens));
    expect(run.status).toBe('budget');
    expect(longestExpansionRun(run.frames)).toBe(FACTS.budget);
    expect(FACTS.rewrittenConflictCells).toBe(0);
    expect(FACTS.rewrittenIsLlPreset).toBe(true);
    const r = removeLeftRecursion(g);
    expect(r.ok && r.changed).toBe(true);
  });

  it('try-this 2: the layered automaton has 12 states and no conflicts; the ambiguous grammar has 4 conflict cells', () => {
    expect([FACTS.layeredStates, FACTS.layeredLrConflicts]).toEqual([12, 0]);
    expect(lrConflicts(analyseLr(presetGrammar('ambiguous')).table)).toHaveLength(FACTS.ambiguousLrConflicts);
    expect(FACTS.ambiguousLrConflicts).toBe(4);
  });

  it('try-this 3: on the LL-friendly grammar both accept, and on the layered preset top-down hits the budget while bottom-up accepts', () => {
    expect([FACTS.lockTdStatus, FACTS.lockBuStatus]).toEqual(['accepted', 'accepted']);
    expect([FACTS.layeredLockTd, FACTS.layeredLockBu]).toEqual(['budget', 'accepted']);
    expect(FACTS.lockTdSteps).toBeGreaterThan(0);
    expect(lesson.tryThis[2]).toContain(`top-down accepts in ${FACTS.lockTdSteps} steps`);
  });

  it('try-this 4: reduce everywhere gives 20, shifting after E + E seeing * gives 14, and that single change is the usual precedence', () => {
    expect([FACTS.openingValue, FACTS.oneClickValue, FACTS.usualValue]).toEqual([20, 14, 14]);
    expect(FACTS.oneClickIsUsual).toBe(true);
    const opening: Choices = { '+*': 'reduce', '*+': 'reduce', '++': 'reduce', '**': 'reduce' };
    expect(playGame(words(OPENING.precedence.tokens), opening).value).toBe(20);
    expect(CONFLICTS.map(choiceId)).toEqual(['+*', '*+', '++', '**']);
  });
});

describe('the control cross product gives clean captions', () => {
  it('every preset with its sample, on the top-down, bottom-up and lockstep scenes, under both conflict policies', () => {
    for (const p of PRESETS) {
      const g = presetGrammar(p.id);
      const a = analyse(g);
      const ll = predictiveTable(g, a);
      const lr = analyseLr(g);
      const tokens = words(p.sample);
      const td = runTopDown(g, ll, tokens);
      clean(topDownCaption({ conflictCells: conflictCells(ll).length, leftRecursive: leftRecursive(g, a), run: td }));
      const conflicts = lrConflicts(lr.table);
      clean(bottomUpCaption({ states: lr.automaton.states.length, conflictCells: conflicts.length, unresolved: conflicts.length }));
      for (const policy of ['shift', 'reduce'] as const) {
        const bu = runBottomUp(lr.automaton, lr.table, tokens, (_c, acts) => acts.find((x) => x.kind === policy) ?? acts[0]);
        for (const f of lockstepFrames(td, bu)) clean(f.say);
      }
    }
  });

  it('every choice combination of the precedence game, on three strings', () => {
    for (let mask = 0; mask < 16; mask++) {
      const choices: Choices = Object.fromEntries(CONFLICTS.map((c, i) => [choiceId(c), (mask >> i) & 1 ? 'shift' : 'reduce'])) as Choices;
      for (const s of ['id + id * id', 'id * id + id', 'id + +']) {
        const game = playGame(words(s), choices);
        const usual = playGame(words(s), usualChoices());
        clean(precedenceCaption({ value: game.value, usual: usual.value, matchesUsual: false, status: game.run.status }));
      }
    }
  });

  it('a conflict with no choice yet stops the parse and says so', () => {
    const run = playGame(words('id + id * id'), {} as Choices).run;
    expect(run.status).toBe('conflict');
    expect(run.message).toContain('choose one in the table');
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  it('the lesson sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.map(([name]) => name)).toContain('./grammar.ts');
    for (const [name, text] of files) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});
