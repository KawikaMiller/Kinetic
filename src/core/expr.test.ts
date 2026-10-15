import { describe, expect, it } from 'vitest';
import { EvalError, Unsupported, evaluate, parseExpr, preview, runTree, type ExprNode, type Scope, type Value } from './expr';

const scope: Scope = [{ weight: 12, express: true, base: 5 }, { items: [{ price: 3, qty: 2 }], name: 'cart' }];
const run = (src: string, options = {}): Value => {
  const r = evaluate(src, scope, options);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const TERNARY = { ternary: true };

describe('the base subset (what debugger-tools relies on)', () => {
  it('agrees with JavaScript on arithmetic, comparison, logic and members', () => {
    const cases: [string, unknown][] = [
      ['1 + 2 * 3 - 4 / 2', 5],
      ['-weight + 10 % 4', -10],
      ['weight > 10 && express', true],
      ['!express || false', false],
      ['items[0].price * items[0].qty', 6],
      ['name.length', 4],
      ['name + "!"', 'cart!'],
      ['items[1] ?? 0', 0],
      ['null == undefined', true],
    ];
    for (const [src, expected] of cases) expect(run(src), src).toBe(expected);
  });

  it('refuses a ternary unless asked, so the debugger boxes keep their documented subset', () => {
    expect(evaluate('express ? 1 : 2', scope)).toMatchObject({ ok: false, unsupported: true });
    expect(evaluate('express ? 1 : 2', scope, TERNARY)).toMatchObject({ ok: true, value: 1 });
  });

  it('refuses calls, assignment, templates and the rest instead of running them', () => {
    for (const src of ['alert(1)', 'weight = 0', 'weight++', '`x`', 'weight ** 2', 'a, b', 'new Date()', '']) {
      expect(evaluate(src, scope).ok, src).toBe(false);
    }
    expect(evaluate('alert(1)', scope)).toMatchObject({ error: 'not supported here: function calls' });
  });

  it('reports the errors real JavaScript would, and calls real globals unsupported', () => {
    expect(evaluate('nope', scope)).toMatchObject({ ok: false, error: 'ReferenceError: nope is not defined', unsupported: false });
    expect(evaluate('items[3].price', scope)).toMatchObject({ unsupported: false, error: "TypeError: Cannot read properties of undefined (reading 'price')" });
    expect(evaluate('Math', scope)).toMatchObject({ unsupported: true });
  });

  it('never hands back anything inherited', () => {
    for (const src of ['constructor', 'items.map', 'name.toUpperCase', '__proto__']) expect(evaluate(src, scope).ok, src).toBe(false);
  });
});

describe('the ternary', () => {
  it('picks a branch and runs only that one (a branch that would throw is never reached)', () => {
    expect(run('express ? base : nope', TERNARY)).toBe(5);
    expect(run('!express ? nope : weight', TERNARY)).toBe(12);
  });

  it('is right-associative and binds looser than every binary operator', () => {
    expect(run('weight > 20 ? 1 : weight > 10 ? 2 : 3', TERNARY)).toBe(2);
    expect(run('1 + 1 == 2 ? "yes" : "no"', TERNARY)).toBe('yes');
    expect(run('express ? 1 : 0 + 10', TERNARY)).toBe(1);
    expect(run('!express ? 1 : 0 + 10', TERNARY)).toBe(10);
  });

  it('works inside brackets and parentheses, and the cost function from the mutation lesson matches a hand-written one', () => {
    expect(run('items[express ? 0 : 1].price', TERNARY)).toBe(3);
    const cost = '(weight > 10 ? base + (weight - 10) * 2 : base)';
    const expected = (w: number, express: boolean) => (w > 10 ? (express ? 12 : 5) + (w - 10) * 2 : express ? 12 : 5);
    for (const w of [0, 5, 10, 11, 25, 40]) {
      for (const ex of [true, false]) {
        const s: Scope = [{ weight: w, express: ex, base: ex ? 12 : 5 }];
        expect(evaluate(cost, s, TERNARY), `${w} ${ex}`).toMatchObject({ ok: true, value: expected(w, ex) });
      }
    }
  });

  it('refuses a half-written ternary', () => {
    for (const src of ['express ?', 'express ? 1', 'express ? 1 :', ': 1', 'express ? : 2']) {
      expect(evaluate(src, scope, TERNARY).ok, src).toBe(false);
    }
  });
});

describe('the exposed parse tree', () => {
  it('has a node per construct, so a tool can walk it', () => {
    const t = parseExpr('weight > 10 ? base + 1 : -base', TERNARY);
    expect(t).toMatchObject({
      k: 'ternary',
      test: { k: 'binary', op: '>', l: { k: 'name', v: 'weight' }, r: { k: 'lit', v: 10 } },
      then: { k: 'binary', op: '+' },
      else: { k: 'unary', op: '-' },
    });
  });

  it('runs a mutant: the same tree with one node changed gives a different answer, and the original is untouched', () => {
    const original = parseExpr('weight > 10 ? base + (weight - 10) * 2 : base', TERNARY) as Extract<ExprNode, { k: 'ternary' }>;
    const boundary: ExprNode = { ...original, test: { k: 'binary', op: '>=', l: { k: 'name', v: 'weight' }, r: { k: 'lit', v: 10 } } };
    const swapped: ExprNode = { ...original, then: original.else, else: original.then };
    const at = (w: number): Scope => [{ weight: w, base: 5 }];
    // weight >= 10 is equivalent on the whole integer domain (at 10 the extra term is 0), a swapped branch is not
    for (let w = 0; w <= 40; w++) expect(runTree(boundary, at(w)), `w=${w}`).toBe(runTree(original, at(w)));
    expect([0, 5, 11, 40].some((w) => runTree(swapped, at(w)) !== runTree(original, at(w)))).toBe(true);
    expect(runTree(original, at(11))).toBe(7);
  });

  it('throws the same errors as evaluate does', () => {
    expect(() => runTree(parseExpr('nope'), scope)).toThrow(EvalError);
    expect(() => parseExpr('f(1)')).toThrow(Unsupported);
  });
});

describe('preview', () => {
  it('writes values the way the DevTools console does', () => {
    expect(preview(72.89999999999999)).toBe('72.89999999999999');
    expect(preview('SAVE10')).toBe("'SAVE10'");
    expect(preview('SAVE10', true)).toBe('SAVE10');
    expect(preview({ price: 12, qty: 2 })).toBe('{price: 12, qty: 2}');
    expect(preview([{ a: 1 }, [1]])).toBe('(2) [{…}, Array(1)]');
    expect(preview(undefined)).toBe('undefined');
    expect(preview(null)).toBe('null');
  });
});
