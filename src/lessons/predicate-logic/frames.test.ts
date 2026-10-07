import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { evalFrames } from './frames';
import { allWorlds, evaluate, FORMULA_IDS, FORMULAS } from './model';
import { PRESETS } from './presets';

const SMALL = [0, 1, 2, 3].flatMap((p) => [0, 1, 2, 3].flatMap((d) => allWorlds(p, d)));

describe('evalFrames', () => {
  it('ends on the true verdict, in words, for every formula on every relation up to 3 × 3', () => {
    for (const w of SMALL) {
      for (const id of FORMULA_IDS) {
        const frames = evalFrames(id, w);
        const last = frames.at(-1)!;
        const value = evaluate(FORMULAS[id], w);
        expect(last.verdict).toBe(value);
        expect(text(last.say)).toContain(value ? 'is true' : 'is false');
        // Only the closing frame carries a verdict: earlier steps are still searching.
        expect(frames.slice(0, -1).every((f) => f.verdict === null)).toBe(true);
        // Every frame has its own caption, so none can go stale.
        expect(frames.every((f) => f.say != null)).toBe(true);
      }
    }
  });

  it('only marks real witnesses and real counterexamples', () => {
    for (const w of SMALL) {
      for (const id of FORMULA_IDS) {
        for (const f of evalFrames(id, w)) {
          for (const [x, y] of f.ok) expect(w.likes[x][y]).toBe(true);
          for (const [x, y] of f.bad) expect(w.likes[x][y]).toBe(false);
          if (f.badRow !== null) expect(w.likes[f.badRow].includes(true)).toBe(false);
          if (f.okCol !== null) expect(w.likes.every((r) => r[f.okCol!])).toBe(true);
        }
      }
    }
  });

  it('says the quantifier order changed the answer exactly when ∀x∃y is true and ∃y∀x is false', () => {
    for (const w of allWorlds(3, 3)) {
      const said = text(evalFrames('EA', w).at(-1)!.say).includes('swapping the quantifiers changed the answer');
      expect(said).toBe(evaluate(FORMULAS.AE, w) && !evaluate(FORMULAS.EA, w));
    }
  });

  it('captions the presets as the lesson describes them', () => {
    const at = (id: string) => PRESETS.find((p) => p.id === id)!.world;
    expect(text(evalFrames('AE', at('own')).at(-1)!.say)).toBe(
      '∀x ∃y likes(x, y) is true: every person has a witness (Ana → pizza, Ben → sushi, Cy → tacos). The dish may differ per person.',
    );
    expect(text(evalFrames('AE', at('picky')).at(-1)!.say)).toContain('Ben likes nothing');
    expect(text(evalFrames('AE', at('nobody')).at(-1)!.say)).toContain('vacuously');
    expect(text(evalFrames('EA', at('nobody')).at(-1)!.say)).toContain('liked by all 0 people');
    expect(text(evalFrames('EE', at('nobody')).at(-1)!.say)).toContain('a domain is empty');
  });
});
