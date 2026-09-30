import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { truthRows } from '../../core/truth';
import {
  PRESETS, VARIABLES, evaluate, mismatchRows, parseFormula, toJs, toText, traceJs, variablesOf, type Formula, type Variable,
} from './model';

const parse = (s: string): Formula => {
  const r = parseFormula(s);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.formula;
};
const ALL_ROWS = truthRows(VARIABLES);

/** Random well-formed formula text over p, q, r, up to `depth` operators deep. */
function randomFormula(rnd: () => number, depth: number): string {
  if (depth === 0 || rnd() < 0.25) return VARIABLES[Math.floor(rnd() * 3)];
  const k = rnd();
  if (k < 0.2) return `¬${randomFormula(rnd, depth - 1)}`;
  const op = ['∧', '∨', '→', '↔'][Math.floor(rnd() * 4)];
  const side = () => (rnd() < 0.5 ? `(${randomFormula(rnd, depth - 1)})` : randomFormula(rnd, depth - 1));
  return `${side()} ${op} ${side()}`;
}

describe('parsing and precedence', () => {
  it('reads ¬ tighter than ∧, ∧ than ∨, ∨ than →, → than ↔', () => {
    const f = parse('¬p ∧ q ∨ r → p ↔ q');
    expect(toText(f)).toBe('¬p ∧ q ∨ r → p ↔ q');
    // same as the fully bracketed form on every row
    const g = parse('((((¬p) ∧ q) ∨ r) → p) ↔ q');
    expect(mismatchRows(f, g, VARIABLES)).toEqual([]);
  });
  it('groups → to the right: p → q → r is p → (q → r)', () => {
    expect(mismatchRows(parse('p → q → r'), parse('p → (q → r)'), VARIABLES)).toEqual([]);
    expect(mismatchRows(parse('p → q → r'), parse('(p → q) → r'), VARIABLES)).not.toEqual([]);
  });
  it('accepts the ASCII spellings people type', () => {
    expect(toText(parse('!(p && q) || r'))).toBe('¬(p ∧ q) ∨ r');
    expect(toText(parse('p -> q <-> ~q => ~p'))).toBe('p → q ↔ ¬q → ¬p');
  });
  it('explains what is wrong instead of guessing', () => {
    for (const bad of ['', 'p ∧', '(p ∨ q', 'p q', 'p ∧ x', 'p)']) expect(parseFormula(bad).ok).toBe(false);
  });
  it('toText round-trips: printing and re-parsing gives the same function (500 random formulas)', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const f = parse(randomFormula(rnd, 4));
      expect(mismatchRows(f, parse(toText(f)), VARIABLES)).toEqual([]);
    }
  });
});

describe('truth tables', () => {
  it('each connective has its textbook table', () => {
    const table = (s: string) => truthRows(['p', 'q']).map((row) => evaluate(parse(s), row));
    expect(table('p ∧ q')).toEqual([false, false, false, true]);
    expect(table('p ∨ q')).toEqual([false, true, true, true]);
    expect(table('p → q')).toEqual([true, true, false, true]); // only T → F is false
    expect(table('p ↔ q')).toEqual([true, false, false, true]);
    expect(table('¬p')).toEqual([true, true, false, false]);
  });
  it('vacuous truth: p → q is true on every row where p is false', () => {
    for (const row of ALL_ROWS) if (!row.p) expect(evaluate(parse('p → q'), row)).toBe(true);
  });
  it('variablesOf lists what a formula mentions, in p, q, r order', () => {
    expect(variablesOf(parse('r ∧ p'))).toEqual(['p', 'r']);
    expect(variablesOf(parse('q'), parse('¬r'))).toEqual(['q', 'r']);
  });
});

describe('equivalence checks (every row)', () => {
  const vars: Variable[] = ['p', 'q'];
  it('the contrapositive is equivalent to p → q', () => {
    expect(mismatchRows(parse('p → q'), parse('¬q → ¬p'), vars)).toEqual([]);
  });
  it('the converse is not: it disagrees exactly on p=F,q=T and p=T,q=F', () => {
    expect(mismatchRows(parse('p → q'), parse('q → p'), vars)).toEqual([1, 2]);
  });
  it('!(a && b) is the same as !a || !b (De Morgan), not !a && !b', () => {
    expect(mismatchRows(parse('¬(p ∧ q)'), parse('¬p ∨ ¬q'), vars)).toEqual([]);
    expect(mismatchRows(parse('¬(p ∧ q)'), parse('¬p ∧ ¬q'), vars)).toEqual([1, 2]);
  });
  it('p → q is the same as ¬p ∨ q', () => {
    expect(mismatchRows(parse('p → q'), parse('¬p ∨ q'), vars)).toEqual([]);
  });
});

describe('the JavaScript rendering', () => {
  it('evaluates exactly like the formula, as real JavaScript (500 random formulas × 8 rows)', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 500; i++) {
      const f = parse(randomFormula(rnd, 4));
      const js = new Function('p', 'q', 'r', `return ${toJs(f)};`) as (p: boolean, q: boolean, r: boolean) => boolean;
      for (const row of ALL_ROWS) expect(js(row.p, row.q, row.r)).toBe(evaluate(f, row));
    }
  });
  it('writes → as !p || q and ↔ as ===, with the brackets JS needs', () => {
    expect(toJs(parse('p → q'))).toBe('!p || q');
    expect(toJs(parse('p ∧ q ↔ r'))).toBe('(p && q) === r');
    expect(toJs(parse('¬(p ∧ q)'), { p: 'a', q: 'b' })).toBe('!(a && b)');
  });
});

describe('short-circuit trace', () => {
  it('matches what JavaScript really reads (500 random formulas × 8 rows)', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const f = parse(randomFormula(rnd, 4));
      for (const row of ALL_ROWS) {
        const read = new Set<string>();
        const v = new Proxy(row, {
          get(target, key: string) {
            read.add(key);
            return target[key];
          },
        });
        const js = new Function('v', `return ${toJs(f, { p: 'v.p', q: 'v.q', r: 'v.r' })};`) as (v: object) => boolean;
        const value = js(v);
        const trace = traceJs(f, row);
        expect(trace.value).toBe(value);
        // a variable is read iff at least one of its occurrences wasn't skipped
        const reachable = new Set<string>();
        const walk = (x: Formula) => {
          if (trace.skipped.has(x.id)) return;
          if (x.kind === 'var') reachable.add(x.name);
          else if (x.kind === 'not') walk(x.x);
          else {
            walk(x.l);
            walk(x.r);
          }
        };
        walk(f);
        expect([...read].sort()).toEqual([...reachable].sort());
      }
    }
  });
  it('user && user.name never evaluates the right side when user is falsy', () => {
    const f = parse('p ∧ q');
    const t = traceJs(f, { p: false, q: false });
    expect(t.value).toBe(false);
    expect(f.kind === 'bin' && t.skipped.has(f.r.id)).toBe(true);
    expect(traceJs(f, { p: true, q: false }).skipped.size).toBe(0);
  });
});

describe('presets', () => {
  it('every preset formula parses and its opening row exists', () => {
    for (const p of PRESETS) {
      const fs = p.formulas.filter(Boolean).map(parse);
      expect(p.row).toBeLessThan(2 ** variablesOf(...fs).length);
    }
  });
});
