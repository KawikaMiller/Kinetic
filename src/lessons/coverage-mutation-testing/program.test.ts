import { describe, expect, it } from 'vitest';
import { parseExpr } from '../../core/expr';
import { generateMutants } from './mutants';
import { exprText, lineText, printProgram, programText } from './print';
import { BUGGY, BUGGY_SOURCE, COST, COST_SOURCE, DOMAIN, WEIGHT_MAX, nodesOf, replaceAt, runProgram, type Program, type ProgramSource } from './program';

// The sources are fixed lesson text, never learner input, so running them with new Function is safe here (tests only).
const realJs = (src: ProgramSource) => new Function('weight', 'express', `const base = ${src.base};\nreturn ${src.result};`) as (w: number, e: boolean) => number;
const realFromText = (text: string) => new Function(`${text}\nreturn cost;`)() as (w: number, e: boolean) => number;

describe('the evaluator against real JavaScript', () => {
  it('has a domain of weight 0 to 40 with both values of express: 82 inputs', () => {
    expect(DOMAIN).toHaveLength((WEIGHT_MAX + 1) * 2);
    expect(new Set(DOMAIN.map((d) => `${d.weight}/${d.express}`)).size).toBe(DOMAIN.length);
  });

  it('returns exactly what real JavaScript returns for cost, over the whole domain', () => {
    const real = realJs(COST_SOURCE);
    for (const input of DOMAIN) expect(runProgram(COST, input), JSON.stringify(input)).toBe(real(input.weight, input.express));
  });

  it('does the same for the off-by-one version, and the two really differ above weight 10', () => {
    const real = realJs(BUGGY_SOURCE);
    for (const input of DOMAIN) expect(runProgram(BUGGY, input)).toBe(real(input.weight, input.express));
    expect(DOMAIN.filter((d) => runProgram(BUGGY, d) !== runProgram(COST, d)).every((d) => d.weight > 10)).toBe(true);
    expect(DOMAIN.some((d) => runProgram(BUGGY, d) !== runProgram(COST, d))).toBe(true);
  });

  it('hand-worked values: cost(11, false) = 7, cost(10, true) = 12, cost(25, true) = 42', () => {
    expect(runProgram(COST, { weight: 11, express: false })).toBe(7);
    expect(runProgram(COST, { weight: 10, express: true })).toBe(12);
    expect(runProgram(COST, { weight: 25, express: true })).toBe(42);
  });
});

describe('the printer', () => {
  it('prints cost as the function it stands for, one ternary branch per line', () => {
    expect(programText(printProgram(COST))).toBe(
      [
        'function cost(weight, express) {',
        '  const base = express',
        '    ? 12',
        '    : 5;',
        '  return weight > 10',
        '    ? base + (weight - 10) * 2',
        '    : base;',
        '}',
      ].join('\n'),
    );
  });

  it('prints every mutant as valid JavaScript that behaves like the evaluator on the whole domain', () => {
    for (const original of [COST, BUGGY]) {
      for (const m of generateMutants(original)) {
        const real = realFromText(programText(printProgram(m.program, m.marks)));
        for (const input of DOMAIN) {
          expect(runProgram(m.program, input), `${m.id} ${m.before} -> ${m.after} at ${JSON.stringify(input)}`).toBe(real(input.weight, input.express));
        }
      }
    }
  });

  it('prints text that parses back to the same tree, for the program and for every mutant', () => {
    for (const original of [COST, BUGGY]) {
      for (const p of [original, ...generateMutants(original).map((m) => m.program)]) {
        expect(parseExpr(exprText(p.base), { ternary: true })).toEqual(p.base);
        expect(parseExpr(exprText(p.result), { ternary: true })).toEqual(p.result);
      }
    }
  });

  it('marks exactly the tokens a mutation changed, and nothing for the original', () => {
    const marked = (p: Program, marks: ReadonlySet<string>) =>
      printProgram(p, marks).flatMap((l) => l.segments.filter((s) => s.mutated).map((s) => s.text.trim()));
    expect(marked(COST, new Set())).toEqual([]);
    for (const m of generateMutants(COST)) {
      const tokens = marked(m.program, m.marks);
      expect(tokens.length, m.id).toBeGreaterThan(0);
      if (m.cls === 'relational') expect(tokens).toEqual([m.after.match(/[<>]=?/)![0]]);
      if (m.cls === 'constant') {
        const original = nodesOf(COST).find((n) => n.path === m.path)!.node as { v: number };
        expect(tokens).toHaveLength(1);
        expect(Math.abs(Number(tokens[0]) - original.v)).toBe(1);
      }
      if (m.cls === 'negation') expect(tokens).toEqual(['!']);
    }
  });

  it('keeps one line per ternary branch with the node that runs it, and no anchor for the header and brace', () => {
    const lines = printProgram(COST);
    expect(lines.map((l) => l.anchor)).toEqual([null, 'b.0', 'b.1', 'b.2', 'r.0', 'r.1', 'r.2', null]);
    expect(lineText(lines[2])).toBe('    ? 12');
  });
});

describe('paths and replacement', () => {
  it('addresses every node once, parents before children', () => {
    const paths = nodesOf(COST).map((n) => n.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths[0]).toBe('b');
    expect(paths).toContain('r.1.1.0.1');
  });

  it('replaces one node in a copy and leaves the original untouched', () => {
    const before = JSON.stringify(COST);
    const changed = replaceAt(COST, 'r.0.1', { k: 'lit', v: 11 });
    expect(JSON.stringify(COST)).toBe(before);
    expect(exprText(changed.result)).toBe('weight > 11 ? base + (weight - 10) * 2 : base');
    expect(exprText(replaceAt(COST, 'b', { k: 'lit', v: 1 }).base)).toBe('1');
  });
});
