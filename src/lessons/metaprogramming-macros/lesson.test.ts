import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { macroCaption, phasesCaption, reflectionCaption } from './captions';
import { FACTS } from './facts';
import { parseCall, parseMacroDef } from './macroLang';
import { MACRO_PRESETS, OPENING } from './opening';
import { MISTAKES } from './phases';
import { PROBES, objectWith } from './reflection';
import { probe } from './reflection';
import { A_MAX, A_MIN, runMacro } from './run';
import type { Strategy } from './expand';

const clean = (node: Parameters<typeof expectCaption>[0]) => expect(expectCaption(node)).not.toMatch(/NaN|\[object|\bnull\b/);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    expect(sceneElements('metaprogramming-macros')).toHaveLength(3);
    expect(sceneElements('metaprogramming-macros').every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('metaprogramming-macros')).toEqual([]);
  });

  it('each scene opens on input the model accepts', () => {
    expect(OPENING.scene).toBe('macro');
    const p = MACRO_PRESETS.find((x) => x.id === OPENING.macro.preset)!;
    expect(parseMacroDef(p.definition).ok && parseCall(p.call).ok).toBe(true);
    expect(p.strategy).toBe('text');
    expect(OPENING.reflection.added).toEqual([]);
    expect(MISTAKES.map((m) => m.id)).toContain(OPENING.phases.mistake);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: SQUARE(a + 1) is a + 1 * a + 1 = 9 by text and (a + 1) * (a + 1) = 25 by tree', () => {
    expect([FACTS.textSource, FACTS.textValue, FACTS.treeSource, FACTS.treeValue]).toEqual(['a + 1 * a + 1', 9, '(a + 1) * (a + 1)', 25]);
  });

  it('try-this 2: SQUARE(next()) reads the counter twice for 2, and binding it once reads it once for 1', () => {
    expect([FACTS.counterSource, FACTS.counterValue, FACTS.counterCalls, FACTS.onceCalls, FACTS.onceValue]).toEqual(['next() * next()', 2, 2, 1, 1]);
  });

  it('try-this 3: the helper called tmp gives 20 with the caller\'s tmp captured, and 12 hygienically as tmp#1', () => {
    expect([FACTS.captureValue, FACTS.captureProblems, FACTS.hygienicValue, FACTS.hygienicSource]).toEqual([20, 1, 12, 'let tmp#1 = 10 in tmp + tmp#1']);
  });

  it('try-this 4: Object.keys fires ownKeys, and after adding email two serialisers are stale and the reflective one is not', () => {
    expect(FACTS.keysLog).toBe('ownKeys');
    expect(FACTS.staleAfterEmail).toBe(2);
  });

  it('try-this 5: a misspelled field is caught by 4 techniques and missed by 1; a field added later is caught by none and missed by 3', () => {
    expect([FACTS.misspelledCatches, FACTS.misspelledSilent, FACTS.laterCatches, FACTS.laterSilent]).toEqual([4, 1, 0, 3]);
    const a = OPENING.macro.a;
    expect(FACTS.textWorked).toBe(`${a} + (1 * ${a}) + 1`);
    expect(a + 1 * a + 1).toBe(FACTS.textValue);
    expect([FACTS.wrongTypeCatches, FACTS.wrongTypeSilent]).toEqual([3, 2]);
  });
});

describe('the control cross product gives clean captions', () => {
  it('every example, strategy and a from 1 to 9', () => {
    const strategies: Strategy[] = ['text', 'tree', 'hygienic'];
    for (const p of MACRO_PRESETS) {
      const d = parseMacroDef(p.definition);
      const c = parseCall(p.call);
      if (!d.ok || !c.ok) throw new Error(p.id);
      for (const s of strategies) {
        for (let a = A_MIN; a <= A_MAX; a++) clean(macroCaption({ strategy: s, call: p.call, run: runMacro(s, d.value, c.tokens, c.tree, a), a }));
      }
    }
  });

  it('every probe with every subset of added fields, and every mistake', () => {
    for (const added of [[], ['email'], ['email', 'admin'], ['email', 'admin', 'score']] as const) {
      for (const spec of PROBES) {
        clean(reflectionCaption({ probe: probe(spec, objectWith(added)), spec, stale: added.length, added }));
      }
      clean(reflectionCaption({ probe: null, spec: null, stale: 0, added }));
    }
    for (const m of MISTAKES) clean(phasesCaption(m.id));
  });

  it('the recursive macro stops at the limit in the caption', () => {
    expect(FACTS.recursiveError).toContain(`Stopped at the expansion limit of ${FACTS.limit}`);
  });
});
