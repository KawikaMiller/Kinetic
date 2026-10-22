import { describe, expect, it } from 'vitest';
import { PRESETS, build, presetById, type Preset } from './pdaPresets';
import { stepRun } from './pdaStepper';
import { stringsUpTo } from './testing/strings';

const alphabetOf = (p: Preset) => (p.id === 'brackets' ? ['(', ')'] : p.id === 'brackets2' ? ['(', ')', '[', ']'] : ['a', 'b']);
/** Exhaustive to length 10 where the alphabet is two letters, to length 8 for four letters (4^10 strings is too many to run). */
const maxLength = (p: Preset) => (alphabetOf(p).length === 2 ? 10 : 8);

describe('the preset machines', () => {
  for (const preset of PRESETS) {
    it(`${preset.id} accepts exactly its language on every string up to length ${maxLength(preset)}, in both acceptance modes`, () => {
      const final = build(preset, 'final-state');
      const empty = build(preset, 'empty-stack');
      for (const s of stringsUpTo(alphabetOf(preset), maxLength(preset))) {
        const f = stepRun(final.pda, s, final.accept).status === 'accepted';
        const e = stepRun(empty.pda, s, empty.accept).status === 'accepted';
        expect(f, `${preset.id} final-state on "${s}"`).toBe(preset.member(s));
        expect(e, `${preset.id} empty-stack on "${s}"`).toBe(preset.member(s));
      }
    });
  }

  it('the reference predicates are what they say (hand-worked members and non-members)', () => {
    const member = (id: Preset['id'], s: string) => presetById(id).member(s);
    expect([member('anbn', 'aabb'), member('anbn', 'abab'), member('anbn', ''), member('anbn', 'aab')]).toEqual([true, false, true, false]);
    expect([member('brackets', '(())()'), member('brackets', ')('), member('brackets2', '([])'), member('brackets2', '([)]')]).toEqual([true, false, true, false]);
    expect([member('wwr', 'abba'), member('wwr', 'aba'), member('wwr', 'abab'), member('wwr', '')]).toEqual([true, false, false, true]);
  });

  it('the wwr machine guesses: on abba more than one configuration is live at once, and exactly one path accepts', () => {
    const { pda, accept } = build(presetById('wwr'), 'final-state');
    const run = stepRun(pda, 'abba', accept);
    expect(run.status).toBe('accepted');
    expect(Math.max(...run.frames.map((f) => f.configs.length))).toBeGreaterThan(1);
    expect(run.frames[run.frames.length - 1].accepting).toBe(true);
  });
});
