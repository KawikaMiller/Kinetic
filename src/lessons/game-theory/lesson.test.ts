import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import {
  BATTLE_OF_THE_SEXES, CLASSIC_DILEMMA, MATCHING_PENNIES, MIX_STEPS, PRISONERS_DILEMMA, claimCell, dilemmaGame, enumerateGames, flips, fracText, frac, mixed2x2,
  noEquilibriumVerdict, pureEquilibria,
} from './model';

describe('scenes', () => {
  it('every scene component carries its own key, and no component is shared between scenes', () => {
    const els = sceneElements('game-theory');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('game-theory')).toEqual([]);
  });

  it('scene 1 opens on the prisoner\'s dilemma, and every preset equilibrium of scene 2 sits on a notch of the slider (steps of 1/24)', () => {
    expect(pureEquilibria(PRISONERS_DILEMMA)).toEqual([[1, 1]]);
    for (const g of [MATCHING_PENNIES, BATTLE_OF_THE_SEXES]) {
      const m = mixed2x2(g);
      expect(m.kind).toBe('mixed');
      if (m.kind === 'mixed') {
        for (const f of [m.p, m.q]) expect((f.n * MIX_STEPS) % f.d).toBe(0);
      }
    }
    expect(fracText(frac(16, 24))).toBe('2/3');
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: (Cooperate, Cooperate) is refused with Row gaining by switching to Defect (-1 becomes 0)', () => {
    expect(claimCell(PRISONERS_DILEMMA, 0, 0).message).toBe('(Cooperate, Cooperate) is not an equilibrium: Row gains by switching to Defect (-1 becomes 0).');
    expect(lesson.tryThis[0]).toContain('Row gains by switching to Defect (-1 becomes 0)');
  });

  it('try-this 2: (Defect, Defect) is accepted with -3 against -2 for each switch', () => {
    const r = claimCell(PRISONERS_DILEMMA, 1, 1);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Row would get -3 instead of -2, Column would get -3 instead of -2');
    expect(lesson.tryThis[1]).toContain('-3 against -2');
  });

  it('try-this 3: matching pennies, "no pure equilibrium" is refused with (1/2, 1/2)', () => {
    expect(noEquilibriumVerdict(MATCHING_PENNIES).message).toContain('a mixed equilibrium (1/2, 1/2) exists');
    expect(lesson.tryThis[2]).toContain('(1/2, 1/2)');
  });

  it('try-this 4: battle of the sexes lights up 2 cells, and scene 2 shows p = 2/3 and q = 1/3', () => {
    expect(pureEquilibria(BATTLE_OF_THE_SEXES)).toHaveLength(2);
    expect([FACTS.bosP, FACTS.bosQ]).toEqual(['2/3', '1/3']);
    expect(lesson.tryThis[3]).toContain('p = 2/3 and q = 1/3');
  });

  it('try-this 5: 2,592 of 65,536 games have no pure equilibrium and all 2,592 have a mixed one', () => {
    const e = enumerateGames();
    expect([e.total, e.noPure, e.mixedValid]).toEqual([65536, 2592, 2592]);
    expect(lesson.tryThis[4]).toContain('2,592 of the 65,536');
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model numbers', () => {
    expect(lesson.keyIdeas[1]).toContain('2/3');
    expect(lesson.keyIdeas[3]).toContain('49,632 of 65,536 games (75.7%)');
    expect(lesson.quiz[4].why).toContain('= 2/3');
    expect(FACTS.bosValue).toBe('2/3');
  });

  it('raising mutual cooperation to 1 flips exactly (Cooperate, Cooperate) and gives a second equilibrium', () => {
    expect(flips({ ...CLASSIC_DILEMMA, R: 1 })).toEqual([{ cell: [0, 0], becameEquilibrium: true }]);
    expect(pureEquilibria(dilemmaGame({ ...CLASSIC_DILEMMA, R: 1 }))).toHaveLength(2);
    expect(FACTS.pdSecondEquilibria).toBe(2);
  });
});
