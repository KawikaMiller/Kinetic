import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { minimiseCaption, pumpingCaption, ringsCaption } from './captions';
import { evidenceFor } from './evidence';
import { FACTS } from './facts';
import lesson from './index';
import { CARDS, RINGS, cardById, decide, inputError } from './languages';
import { EXAMPLES, distinguishing, refine } from '../../core/automataMinimize';
import { OPENING } from './opening';
import { PUMP_LANGUAGES, MAX_P, MIN_P, chooseString, playGame, type PumpMode } from './pumping';

const clean = (node: Parameters<typeof expectCaption>[0]) => expect(expectCaption(node)).not.toMatch(/NaN|undefined|\[object|null/);

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    expect(sceneElements('chomsky-hierarchy')).toHaveLength(3);
    expect(sceneElements('chomsky-hierarchy').every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('chomsky-hierarchy')).toEqual([]);
  });

  it('each scene opens on fixed input the model accepts', () => {
    expect(OPENING.scene).toBe('rings');
    expect(decide(cardById(OPENING.rings.tester.card), OPENING.rings.tester.input)).not.toBeNull();
    const l = PUMP_LANGUAGES.find((x) => x.id === OPENING.pumping.language)!;
    expect(chooseString(l, OPENING.pumping.shape, OPENING.pumping.n, OPENING.pumping.p).ok).toBe(true);
    expect(EXAMPLES.map((e) => e.id)).toContain(OPENING.minimise.example);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: aⁿbⁿ placed in Regular gets the counter experiment, an 8-state DFA failing at n = 4', () => {
    expect(FACTS.counterEvidence).toContain('has 8 states');
    expect(FACTS.counterEvidence).toContain('at n = 4');
    expect(lesson.tryThis[0]).toContain(FACTS.counterEvidence);
    expect(evidenceFor(cardById('anbn'), 'regular').relation).toBe('too-small');
  });

  it('try-this 2: the PDA accepts aaabbb and the TM accepts abab, each with a cost from the run', () => {
    expect(decide(cardById('anbn'), 'aaabbb')!.verdict).toBe('accepted');
    expect(decide(cardById('ww'), 'abab')!.verdict).toBe('accepted');
    expect(FACTS.testerDetail).toMatch(/^PDA, \d+ configurations$/);
    expect(FACTS.wwDetail).toMatch(/^Turing machine, \d+ steps$/);
  });

  it('try-this 3: aⁿbⁿ at p = 4 has 10 splits and is won; (ab)* at (ab)^4 has survivors; equal numbers with (ab)^4 survives with y = ab', () => {
    expect([FACTS.openSplits, FACTS.openWon]).toEqual([10, true]);
    expect(FACTS.abstarSurviving).toBeGreaterThan(0);
    expect([FACTS.poorWon, FACTS.poorSurvivingY]).toEqual([false, expect.arrayContaining(['ab'])]);
  });

  it('try-this 4: the mod-3 counter has 6 states, refines in 2 rounds to 3 classes, s0 and s3 merge and s1 and s2 are separated by a', () => {
    expect([FACTS.mod3States, FACTS.mod3Classes, FACTS.mod3Rounds]).toEqual([6, 3, 1]);
    expect(FACTS.mod3Equivalent).toBe(true);
    expect(FACTS.mod3Separator).toBe('a');
  });
});

describe('quiz numbers come from the model', () => {
  it('the counter, the context-free wins and the mod-3 classes match hand counts', () => {
    expect([FACTS.counterK, FACTS.counterStates, FACTS.counterFails]).toEqual([3, 8, 4]);
    expect(FACTS.csWonPs).toEqual([2, 3, 4, 5, 6]);
    expect(FACTS.csCount).toBe(18 + 40 + 63);
    expect(FACTS.mod3Groups).toEqual(['{s0,s3}', '{s1,s4}', '{s2,s5}']);
  });
});

describe('the tester takes only the own alphabet of the machine', () => {
  it('a marker symbol, the blank or a letter of another language is refused, whatever the card', () => {
    for (const card of CARDS.filter((c) => c.machine !== null)) {
      for (const bad of ['Y', 'YYZZ', 'AB', 'aa_aaa', 'abc_c', 'X', '_', ' ']) {
        const alienToThisCard = [...bad].some((ch) => !card.alphabet.includes(ch));
        if (alienToThisCard) expect(inputError(card, bad), `${card.id} ${bad}`).toMatch(/^Position \d+: /);
      }
      for (const s of card.samples) expect(inputError(card, s), `${card.id} ${s}`).toBeNull();
    }
    expect(inputError(cardById('anbncn'), 'abc_c')).toContain('Position 4');
    expect(inputError(cardById('anbn'), '')).toBeNull();
  });
});

describe('the control cross product gives clean captions', () => {
  it('the rings caption for unchecked and checked boards', () => {
    clean(ringsCaption({ sorted: 0, checked: false, correct: 0, total: 10 }));
    clean(ringsCaption({ sorted: 10, checked: true, correct: 10, total: 10 }));
  });

  it('every language, mode, p and shape gives a clean pumping caption', () => {
    const modes: PumpMode[] = ['regular', 'cf'];
    for (const lang of PUMP_LANGUAGES) {
      for (const mode of modes) {
        for (let p = MIN_P; p <= MAX_P; p++) {
          for (const shape of lang.shapes) {
            for (const n of [0, 3, 12]) {
              const setup = chooseString(lang, shape.id, n, p);
              const game = setup.ok && setup.s.length <= 14 ? playGame(lang, setup.s, p, mode) : null;
              clean(pumpingCaption({ lang, mode, p, game, s: setup.ok ? setup.s : null, error: setup.ok ? null : setup.error }));
            }
          }
        }
      }
    }
  });

  it('every example and round gives a clean minimisation caption', () => {
    for (const e of EXAMPLES) {
      const rounds = refine(e.dfa);
      clean(minimiseCaption({ states: e.dfa.states.length, round: null, classes: null, stable: false }));
      rounds.forEach((r, i) => clean(minimiseCaption({ states: e.dfa.states.length, round: i, classes: r.count, stable: i === rounds.length - 1 })));
      expect(distinguishing(e.dfa, e.dfa.start, e.dfa.start)).toBeNull();
    }
  });

  it('the halting card is labelled only and every ring has a card or says why not', () => {
    expect(CARDS.filter((c) => c.machine === null).map((c) => c.id)).toEqual(['halts']);
    expect(RINGS.filter((r) => !CARDS.some((c) => c.ring === r.id)).map((r) => r.id)).toEqual(['decidable']);
  });
});
