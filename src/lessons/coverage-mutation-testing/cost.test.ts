import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { costCaption } from './captions';
import { SAMPLE_STEPS, countRuns, coveringTests, mutantsOnLines, sampleOf, scoreOf } from './cost';
import { printProgram } from './print';
import { COST, runProgram } from './program';
import { PRESETS, presetOf } from './presets';
import { analysisOf, report, type Suite } from './suite';

const a = analysisOf('cost');

/** Independent oracle: per mutant, count tests until the first mismatch with the expected value (all tests when none), straight from the evaluator. */
function bruteStopAtKill(suite: Suite): number {
  return a.mutants.reduce((total, m) => {
    const failAt = suite.cases.findIndex((tc) => runProgram(m.program, tc) !== tc.expected);
    return total + (failAt < 0 ? suite.cases.length : failAt + 1);
  }, 0);
}

describe('run counts', () => {
  it('counts every mutant against every test as mutants times tests', () => {
    for (const p of PRESETS.filter((x) => x.variant === 'cost' && x.suite.mode === 'exact')) {
      const counts = countRuns(a, p.suite);
      expect(counts.naive).toBe(23 * p.suite.cases.length);
      expect(counts.mutants).toBe(23);
      expect(counts.tests).toBe(p.suite.cases.length);
    }
  });

  it('counts runs with the stop at the first failing test the way a brute-force loop does', () => {
    const suite = presetOf('precise').suite;
    expect(countRuns(a, suite).stopAtKill).toBe(bruteStopAtKill(suite));
    expect(countRuns(a, suite).stopAtKill).toBeLessThan(countRuns(a, suite).naive);
  });

  it('runs every test against a mutant nothing kills, and stops early on a killed one', () => {
    const none = presetOf('weak').suite;
    const counts = countRuns(a, none);
    expect(counts.stopAtKill).toBe(counts.naive);
    expect(counts.coveringOnly).toBeLessThanOrEqual(counts.stopAtKill);
  });

  it('losslessly skips tests that never reach the mutated code: the same mutants die with and without the skip', () => {
    const suite = presetOf('precise').suite;
    const r = report(a, suite);
    a.mutants.forEach((m, i) => {
      const reach = coveringTests(a, suite, i);
      const killedAmongReaching = reach.some((t) => runProgram(m.program, suite.cases[t]) !== suite.cases[t].expected);
      expect(killedAmongReaching, m.id).toBe(r.verdicts[i].status === 'killed');
    });
    expect(countRuns(a, suite).coveringOnly).toBeLessThan(countRuns(a, suite).stopAtKill);
  });

  it('counts the tests that reach a mutated node by running the original and asking whether the node ran', () => {
    const suite = presetOf('precise').suite;
    const m9 = a.mutants.findIndex((m) => m.id === 'M9');
    // M9 changes the comparison in the result's test, which every call evaluates
    expect(coveringTests(a, suite, m9)).toEqual([0, 1, 2, 3]);
    // M18 changes (weight - 10), evaluated only when weight > 10: the cases at weight 11 and 25
    const m18 = a.mutants.findIndex((m) => m.id === 'M18');
    expect(coveringTests(a, suite, m18).map((i) => suite.cases[i].weight)).toEqual([11, 25]);
  });
});

describe('sampling and changed lines', () => {
  it('picks ceil(percent of the mutants) of them, and a bigger sample contains every mutant of a smaller one', () => {
    let previous: number[] = [];
    for (const percent of SAMPLE_STEPS) {
      const sample = sampleOf(23, percent);
      expect(sample).toHaveLength(Math.ceil((23 * percent) / 100));
      expect(new Set(sample).size).toBe(sample.length);
      for (const i of previous) expect(sample).toContain(i);
      previous = sample;
    }
    expect(sampleOf(23, 100).slice().sort((x, y) => x - y)).toEqual(Array.from({ length: 23 }, (_, i) => i));
  });

  it('scores the full set exactly as the report does, and a sample as killed over the sample\'s own non-equivalent mutants', () => {
    const suite = presetOf('precise').suite;
    const all = a.mutants.map((_, i) => i);
    expect(scoreOf(a, suite, all)).toBe(report(a, suite).score);
    const sample = sampleOf(23, 25);
    const counted = sample.filter((i) => !a.equivalent[i]);
    const killed = counted.filter((i) => a.mutants[i] && report(a, suite).verdicts[i].status === 'killed');
    expect(scoreOf(a, suite, sample)).toBe(counted.length ? killed.length / counted.length : null);
  });

  it('picks the mutants on the lines you mark: the first line of the base statement touches the negated test and the branch swap, nothing else', () => {
    const lines = printProgram(COST);
    const baseLine = lines.findIndex((l) => l.anchor === 'b.0');
    const onBaseTest = mutantsOnLines(a, [baseLine]);
    expect(onBaseTest.map((i) => a.mutants[i].id)).toEqual(['M1', 'M2']);
    expect(mutantsOnLines(a, [])).toEqual([]);
    const thenLine = lines.findIndex((l) => l.anchor === 'r.1');
    for (const i of mutantsOnLines(a, [thenLine])) expect(a.mutants[i].path.startsWith('r.1') || 'r.1'.startsWith(a.mutants[i].path)).toBe(true);
  });

  it('never marks the header or the brace', () => {
    expect(mutantsOnLines(a, [0, 7])).toEqual([]);
  });
});

describe('the cost caption', () => {
  it('quotes the same counts the stats show', () => {
    const suite = presetOf('precise').suite;
    const all = countRuns(a, suite);
    const sampled = countRuns(a, suite, sampleOf(23, 50));
    const text = expectCaption(costCaption(all, sampled, 'A 50% sample'));
    expect(text).toContain(`${all.naive} runs`);
    expect(text).toContain(String(all.stopAtKill));
    expect(text).toContain(String(all.coveringOnly));
    expect(text).toContain(`${sampled.mutants} mutants`);
  });
});
