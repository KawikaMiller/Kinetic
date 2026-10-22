import { describe, expect, it } from 'vitest';
import { parseBoundedInt } from '../../core/parse';
import { mulberry32 } from '../../core/random';
import {
  BATTLE_OF_THE_SEXES, CLASSIC_DILEMMA, MATCHING_PENNIES, PAYOFF_MAX, PAYOFF_MESSAGES, PAYOFF_MIN, PRISONERS_DILEMMA, STAG_HUNT, bestReplies, claimCell,
  colPayoff, cooperationCondition, dilemmaGame, dominanceText, enumerateGames, falseEquilibria, flips, fracText, fracValue, gameFromIndex, indifferent, mixed2x2,
  noEquilibriumVerdict, pureEquilibria, resizeGame, rowPayoff, setPayoff, strictlyDominated, type Game, type Matrix,
} from './model';

/** Oracle: brute force over every profile and every unilateral deviation, written with plain loops apart from the lesson's helpers. */
function bruteForce(A: Matrix, B: Matrix, onlyRow = false): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < A.length; r += 1) {
    for (let c = 0; c < A[0].length; c += 1) {
      let rowCanGain = false;
      for (let r2 = 0; r2 < A.length; r2 += 1) if (A[r2][c] > A[r][c]) rowCanGain = true;
      let colCanGain = false;
      for (let c2 = 0; c2 < A[0].length; c2 += 1) if (B[r][c2] > B[r][c]) colCanGain = true;
      if (!rowCanGain && (onlyRow || !colCanGain)) out.push([r, c]);
    }
  }
  return out;
}

const key = (cells: readonly (readonly [number, number])[]) => cells.map(([r, c]) => `${r}${c}`).join(',');

describe('hand-worked vectors', () => {
  it("prisoner's dilemma: (Defect, Defect) only, payoffs (-2, -2), worse for both than (-1, -1); Defect strictly dominates for both", () => {
    expect(pureEquilibria(PRISONERS_DILEMMA)).toEqual([[1, 1]]);
    expect([PRISONERS_DILEMMA.A[1][1], PRISONERS_DILEMMA.B[1][1]]).toEqual([-2, -2]);
    expect([PRISONERS_DILEMMA.A[0][0], PRISONERS_DILEMMA.B[0][0]]).toEqual([-1, -1]);
    const dom = strictlyDominated(PRISONERS_DILEMMA);
    expect(dom.map((d) => dominanceText(PRISONERS_DILEMMA, d))).toEqual([
      'Defect strictly dominates Cooperate for Row: 0 > -1 and -2 > -3.',
      'Defect strictly dominates Cooperate for Column: 0 > -1 and -2 > -3.',
    ]);
  });

  it('raising mutual cooperation to 1 for each player makes (Cooperate, Cooperate) a second equilibrium (a deviation gives 0 < 1) and Defect, Defect stays one', () => {
    const g = dilemmaGame({ ...CLASSIC_DILEMMA, R: 1 });
    expect(g.A[0][0]).toBe(1);
    expect(g.B[0][0]).toBe(1);
    expect(pureEquilibria(g)).toEqual([[0, 0], [1, 1]]);
    expect(g.A[1][0]).toBe(0);
    expect(flips({ ...CLASSIC_DILEMMA, R: 1 })).toEqual([{ cell: [0, 0], becameEquilibrium: true }]);
  });

  it('matching pennies: no pure equilibrium, p = q = 1/2, value 0', () => {
    expect(pureEquilibria(MATCHING_PENNIES)).toEqual([]);
    const m = mixed2x2(MATCHING_PENNIES);
    expect(m).toMatchObject({ kind: 'mixed' });
    if (m.kind === 'mixed') {
      expect([fracText(m.p), fracText(m.q), fracText(m.rowValue), fracText(m.colValue)]).toEqual(['1/2', '1/2', '0', '0']);
    }
  });

  it('battle of the sexes: two pure equilibria, q = 1/3, p = 2/3, each player earns 2/3 (4/9 + 2/9 = 6/9)', () => {
    expect(pureEquilibria(BATTLE_OF_THE_SEXES)).toEqual([[0, 0], [1, 1]]);
    const m = mixed2x2(BATTLE_OF_THE_SEXES);
    expect(m.kind).toBe('mixed');
    if (m.kind === 'mixed') {
      expect([fracText(m.p), fracText(m.q), fracText(m.rowValue), fracText(m.colValue)]).toEqual(['2/3', '1/3', '2/3', '2/3']);
    }
    // Row: (2/3)(1/3) x 2 + (1/3)(2/3) x 1 = 4/9 + 2/9 = 6/9, in plain floats.
    expect((2 / 3) * (1 / 3) * 2 + (1 / 3) * (2 / 3) * 1).toBeCloseTo(6 / 9, 12);
  });

  it('stag hunt: (Stag, Stag) and (Hare, Hare), mixed p = q = 3/4', () => {
    expect(pureEquilibria(STAG_HUNT)).toEqual([[0, 0], [1, 1]]);
    const m = mixed2x2(STAG_HUNT);
    expect(m.kind === 'mixed' && [fracText(m.p), fracText(m.q)]).toEqual(['3/4', '3/4']);
  });

  it('the prisoner\'s dilemma has a zero denominator for the mixed formula: no unique mixed equilibrium', () => {
    expect(mixed2x2(PRISONERS_DILEMMA)).toEqual({ kind: 'degenerate' });
  });

  it('best replies mark the equilibria where both marks meet', () => {
    const br = bestReplies(BATTLE_OF_THE_SEXES);
    expect(br.row).toEqual([[0], [1]]);
    expect(br.column).toEqual([[0], [1]]);
    const both: [number, number][] = [];
    br.row.forEach((rows, c) => rows.forEach((r) => br.column[r].includes(c) && both.push([r, c])));
    expect(both.sort()).toEqual(pureEquilibria(BATTLE_OF_THE_SEXES));
  });
});

describe('manipulation: wrong claims are refused with the computed reason', () => {
  it('manipulation 1: (Cooperate, Cooperate) is refused, naming Row switching to Defect (-1 becomes 0)', () => {
    expect(claimCell(PRISONERS_DILEMMA, 0, 0)).toEqual({
      ok: false,
      message: '(Cooperate, Cooperate) is not an equilibrium: Row gains by switching to Defect (-1 becomes 0).',
    });
  });

  it('manipulation 2: declaring "no equilibrium" on matching pennies is refused with the mixed (1/2, 1/2)', () => {
    expect(noEquilibriumVerdict(MATCHING_PENNIES)).toEqual({
      ok: false,
      message: 'Not quite: pure strategies have none, but a mixed equilibrium (1/2, 1/2) exists: against it each player earns 0 from heads and from tails.',
    });
  });

  it('manipulation 3: (Defect, Defect) is accepted with the numbers, Row\'s deviation is named before Column\'s, and "no equilibrium" is refused where a pure one exists', () => {
    expect(claimCell(PRISONERS_DILEMMA, 1, 1)).toEqual({
      ok: true,
      message: '(Defect, Defect) is an equilibrium: neither player gains by switching alone (Row would get -3 instead of -2, Column would get -3 instead of -2).',
    });
    expect(claimCell(PRISONERS_DILEMMA, 0, 1).message).toBe('(Cooperate, Defect) is not an equilibrium: Row gains by switching to Defect (-3 becomes -2).');
    expect(claimCell(PRISONERS_DILEMMA, 1, 0).message).toBe('(Defect, Cooperate) is not an equilibrium: Column gains by switching to Defect (-3 becomes -2).');
    expect(noEquilibriumVerdict(PRISONERS_DILEMMA).message).toBe('Not so: (Defect, Defect) is an equilibrium, since neither player gains by switching alone.');
  });

  it('every cell of every preset is refused or accepted exactly as the brute-force oracle says', () => {
    for (const g of [PRISONERS_DILEMMA, MATCHING_PENNIES, BATTLE_OF_THE_SEXES, STAG_HUNT]) {
      const truth = new Set(bruteForce(g.A, g.B).map(([r, c]) => `${r}${c}`));
      for (let r = 0; r < 2; r += 1) for (let c = 0; c < 2; c += 1) expect(claimCell(g, r, c).ok).toBe(truth.has(`${r}${c}`));
    }
  });
});

describe('exhaustive over all 65,536 games with payoffs 0 to 3', () => {
  const e = enumerateGames();

  it('has the stated histogram of pure equilibria, summing to 65,536', () => {
    expect(e.total).toBe(65536);
    expect(e.histogram).toEqual([2592, 29376, 27936, 5376, 256]);
    expect(e.histogram.reduce((a, b) => a + b, 0)).toBe(65536);
  });

  it('every game with no pure equilibrium has a valid mixed one: probabilities strictly inside (0, 1) and both players exactly indifferent', () => {
    expect(e.noPure).toBe(2592);
    expect(e.mixedValid).toBe(2592);
  });

  it('agrees with the plain-loop brute force on every game, and the Row-only finder differs on 49,632 of them (75.7%)', () => {
    let differs = 0;
    const histogram = [0, 0, 0, 0, 0];
    for (let index = 0; index < 65536; index += 1) {
      const g = gameFromIndex(index);
      const truth = bruteForce(g.A, g.B);
      expect(key(pureEquilibria(g))).toBe(key(truth));
      histogram[truth.length] += 1;
      if (key(bruteForce(g.A, g.B, true)) !== key(truth)) differs += 1;
    }
    expect(histogram).toEqual(e.histogram);
    expect(differs).toBe(e.brokenDiffers);
    expect(e.brokenDiffers).toBe(49632);
    expect((e.brokenDiffers / e.total) * 100).toBeCloseTo(75.7, 1);
    expect(e.brokenHistogram.reduce((a, b) => a + b, 0)).toBe(65536);
  });
});

describe('mixed solutions checked by floats as well as exactly', () => {
  it('for each preset, the expected payoff of each pure reply equals the equilibrium payoff to 1e-9', () => {
    for (const g of [MATCHING_PENNIES, BATTLE_OF_THE_SEXES, STAG_HUNT]) {
      const m = mixed2x2(g);
      expect(m.kind).toBe('mixed');
      if (m.kind !== 'mixed') continue;
      const p = fracValue(m.p);
      const q = fracValue(m.q);
      const rowFrom = (i: number) => q * g.A[i][0] + (1 - q) * g.A[i][1];
      const colFrom = (j: number) => p * g.B[0][j] + (1 - p) * g.B[1][j];
      expect(Math.abs(rowFrom(0) - rowFrom(1))).toBeLessThan(1e-9);
      expect(Math.abs(colFrom(0) - colFrom(1))).toBeLessThan(1e-9);
      expect(indifferent(g, m.p, m.q)).toBe(true);
      expect(fracValue(rowPayoff(g.A, 0, m.q))).toBeCloseTo(rowFrom(0), 9);
      expect(fracValue(colPayoff(g.B, 0, m.p))).toBeCloseTo(colFrom(0), 9);
    }
  });

  it('2,000 seeded 3 x 3 games match the brute-force pure equilibria', () => {
    const rnd = mulberry32(5);
    const value = () => Math.floor(rnd() * 19) - 9;
    for (let t = 0; t < 2000; t += 1) {
      const A = Array.from({ length: 3 }, () => Array.from({ length: 3 }, value));
      const B = Array.from({ length: 3 }, () => Array.from({ length: 3 }, value));
      const g: Game = { A, B, rowNames: ['1', '2', '3'], colNames: ['1', '2', '3'] };
      expect(key(pureEquilibria(g))).toBe(key(bruteForce(A, B)));
    }
  });
});

describe('broken mode: the finder that checks only Row', () => {
  it('reports (Defect, Cooperate) in the prisoner\'s dilemma, which Column can leave (-3 becomes -2)', () => {
    expect(pureEquilibria(PRISONERS_DILEMMA, 'rowOnly')).toEqual([[1, 0], [1, 1]]);
    expect(falseEquilibria(PRISONERS_DILEMMA)).toEqual([
      { cell: [1, 0], message: '(Defect, Cooperate) is not an equilibrium: Column gains by switching to Defect (-3 becomes -2).' },
    ]);
    expect(claimCell(PRISONERS_DILEMMA, 1, 0, 'rowOnly').ok).toBe(true);
    expect(claimCell(PRISONERS_DILEMMA, 1, 0).ok).toBe(false);
  });
});

describe('controls at their extremes and one beyond', () => {
  const parse = (text: string) => parseBoundedInt(text, { min: PAYOFF_MIN, max: PAYOFF_MAX, messages: PAYOFF_MESSAGES });

  it('payoffs take whole numbers from -9 to 9; decimals and anything beyond are refused with a message', () => {
    expect(parse('-9')).toEqual({ ok: true, value: -9 });
    expect(parse('9')).toEqual({ ok: true, value: 9 });
    expect(parse('10').ok).toBe(false);
    expect(parse('-10').ok).toBe(false);
    expect(parse('1.5')).toEqual({ ok: false, error: 'Payoffs are whole numbers here.' });
    expect(parse('')).toEqual({ ok: false, error: 'Type a whole number from -9 to 9.' });
    expect(parse('abc').ok).toBe(false);
  });

  it('resizing keeps payoffs, fills new cells with 0, names new strategies, and stays between 2 x 2 and 3 x 3', () => {
    const big = resizeGame(PRISONERS_DILEMMA, 3, 3);
    expect(big.A).toEqual([[-1, -3, 0], [0, -2, 0], [0, 0, 0]]);
    expect(big.rowNames).toEqual(['Cooperate', 'Defect', 'Row 3']);
    const back = resizeGame(big, 2, 2);
    expect(back.A).toEqual(PRISONERS_DILEMMA.A);
    expect(pureEquilibria(big).length).toBeGreaterThan(0);
  });

  it('setPayoff changes one cell and nothing else, and the equilibria follow the edit', () => {
    const edited = setPayoff(PRISONERS_DILEMMA, 'A', 0, 0, 1);
    expect(edited.A[0][0]).toBe(1);
    expect(edited.B).toBe(PRISONERS_DILEMMA.B);
    expect(pureEquilibria(edited)).toEqual([[1, 1]]);
    const both = setPayoff(edited, 'B', 0, 0, 1);
    expect(pureEquilibria(both)).toEqual([[0, 0], [1, 1]]);
  });

  it('the cooperation condition is R >= T, at the slider extremes too', () => {
    expect(cooperationCondition(CLASSIC_DILEMMA).holds).toBe(false);
    expect(cooperationCondition({ ...CLASSIC_DILEMMA, R: 0 }).holds).toBe(true);
    expect(cooperationCondition({ ...CLASSIC_DILEMMA, R: PAYOFF_MAX }).holds).toBe(true);
    expect(cooperationCondition({ ...CLASSIC_DILEMMA, R: PAYOFF_MIN }).holds).toBe(false);
    for (const R of [PAYOFF_MIN, 0, PAYOFF_MAX]) {
      const g = dilemmaGame({ ...CLASSIC_DILEMMA, R });
      expect(pureEquilibria(g).some(([r, c]) => r === 0 && c === 0)).toBe(R >= CLASSIC_DILEMMA.T);
    }
  });
});
