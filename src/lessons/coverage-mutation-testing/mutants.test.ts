import { describe, expect, it } from 'vitest';
import { generateMutants, isEquivalent, killingInput, type MutantClass } from './mutants';
import { programText, printProgram } from './print';
import { BUGGY, COST, DOMAIN, runProgram } from './program';
import { analysisOf } from './suite';

// Fixed lesson text again, run for real as the independent oracle.
const realFromText = (text: string) => new Function(`${text}\nreturn cost;`)() as (w: number, e: boolean) => number;

describe('the mutants of cost', () => {
  const mutants = generateMutants(COST);

  it('has 23 mutants from five classes, in a stable order with ids M1 to M23', () => {
    expect(mutants).toHaveLength(23);
    expect(mutants.map((m) => m.id)).toEqual(Array.from({ length: 23 }, (_, i) => `M${i + 1}`));
    const count = (c: MutantClass) => mutants.filter((m) => m.cls === c).length;
    expect([count('relational'), count('arithmetic'), count('constant'), count('negation'), count('swap')]).toEqual([3, 6, 10, 2, 2]);
  });

  it('changes the program: no mutant prints as the original, and the original tree is never modified', () => {
    const before = JSON.stringify(COST);
    const original = programText(printProgram(COST));
    for (const m of mutants) expect(programText(printProgram(m.program)), m.id).not.toBe(original);
    expect(JSON.stringify(COST)).toBe(before);
  });

  it('is judged equivalent by running real JavaScript over the whole domain: exactly M9 and M13', () => {
    const real = realFromText(programText(printProgram(COST)));
    const equivalent = mutants.filter((m) => {
      const run = realFromText(programText(printProgram(m.program)));
      return DOMAIN.every((d) => run(d.weight, d.express) === real(d.weight, d.express));
    });
    expect(equivalent.map((m) => m.id)).toEqual(['M9', 'M13']);
    expect(equivalent.map((m) => `${m.before} -> ${m.after}`)).toEqual(['weight > 10 -> weight >= 10', 'weight > 10 -> weight > 9']);
  });

  it('agrees with the lesson analysis about which are equivalent, so the evaluator and real JavaScript tell the same story', () => {
    const a = analysisOf('cost');
    expect(a.equivalent.flatMap((e, i) => (e ? [a.mutants[i].id] : []))).toEqual(['M9', 'M13']);
  });

  it('returns a killing input that really kills, or none exactly when the mutant is equivalent, for every mutant of both versions', () => {
    for (const original of [COST, BUGGY]) {
      for (const m of generateMutants(original)) {
        const input = killingInput(original, m.program);
        const brute = DOMAIN.find((d) => runProgram(m.program, d) !== runProgram(original, d));
        if (input === null) {
          expect(brute, m.id).toBeUndefined();
          expect(isEquivalent(original, m.program)).toBe(true);
        } else {
          expect(runProgram(m.program, input), m.id).not.toBe(runProgram(original, input));
          expect(input).toEqual(brute);
          expect(isEquivalent(original, m.program)).toBe(false);
        }
      }
    }
  });

  it('finds no equivalent mutant in the off-by-one version: the threshold change matters when the extra term is 2 at weight 10', () => {
    const a = analysisOf('buggy');
    expect(a.equivalent.some(Boolean)).toBe(false);
  });
});
