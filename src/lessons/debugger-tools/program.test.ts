import { describe, expect, it } from 'vitest';
import { L, PAUSABLE, SOURCE, TRACE } from './program';

interface Real {
  result: number;
  printed: unknown[];
  subtotal: (items: unknown) => number;
  applyDiscount: (total: number, code: string) => number;
  CART: { code: string; items: { price: number; qty: number }[] };
  DISCOUNTS: Record<string, number>;
}

/** Run the lesson's source as real JavaScript, with a console that records instead of printing. */
function runReal(): Real {
  const printed: unknown[] = [];
  const fakeConsole = { log: (...args: unknown[]) => printed.push(...args) };
  // Test-only: the lesson itself never evaluates code.
  const body = `${SOURCE.join('\n')}\nreturn { result, subtotal, applyDiscount, CART, DISCOUNTS };`;
  const out = new Function('console', body)(fakeConsole) as Omit<Real, 'printed'>;
  return { ...out, printed };
}

/** The items array behind a proxy that records which indices and how often .length were read. */
function counted<T>(items: T[]) {
  const indices: number[] = [];
  let lengthReads = 0;
  const proxy = new Proxy(items, {
    get(target, key, recv) {
      if (key === 'length') lengthReads++;
      else if (typeof key === 'string' && /^\d+$/.test(key)) indices.push(Number(key));
      return Reflect.get(target, key, recv);
    },
  });
  return { proxy, indices, lengthReads: () => lengthReads };
}

const pausesAt = (line: number) => TRACE.pauses.filter((p) => p.line === line);
const localsAt = (line: number, name: string) => pausesAt(line).map((p) => p.stack[0].locals[name]);

describe('the trace matches the real JavaScript program', () => {
  const real = runReal();

  it('prints the same (wrong) result', () => {
    expect(real.printed).toEqual([72.9]);
    expect(TRACE.result).toBe(real.result);
    expect(TRACE.output).toEqual(real.printed.map(String));
  });

  it('runs the loop the same number of times over the same items', () => {
    const c = counted(real.CART.items);
    const sum = real.subtotal(c.proxy);
    expect(new Set(c.indices)).toEqual(new Set([0, 1, 2, 3, 4]));
    // The real loop tests i < items.length once per iteration plus the final failing test.
    expect(pausesAt(L.loop)).toHaveLength(c.lengthReads());
    expect(pausesAt(L.loopBody)).toHaveLength(new Set(c.indices).size);
    expect(pausesAt(L.subtotalReturn)[0].stack[0].locals.total).toBe(sum);
  });

  it('has the same running totals and discounted values', () => {
    let running = 0;
    const expected = [0, ...real.CART.items.map((it) => (running += it.price * it.qty))];
    // At each loop test, total is the sum so far.
    expect(localsAt(L.loop, 'total')).toEqual(expected);
    const sub = real.subtotal(real.CART.items);
    const once = real.applyDiscount(sub, 'SAVE10');
    const twice = real.applyDiscount(once, 'SAVE10');
    expect(localsAt(L.firstDiscount, 'total')).toEqual([sub]);
    expect(localsAt(L.bug, 'total')).toEqual([once]);
    expect(localsAt(L.checkoutReturn, 'total')).toEqual([twice]);
    expect(Math.round(twice * 100) / 100).toBe(real.result);
    expect(pausesAt(L.rate).map((p) => p.stack[0].locals.total)).toEqual([sub, once]);
  });

  it('records a consistent call stack', () => {
    for (const p of TRACE.pauses) {
      expect(p.stack[0].line).toBe(p.line);
      expect(p.stack.at(-1)!.fn).toBe('(anonymous)');
    }
    const inner = pausesAt(L.loopBody)[0];
    expect(inner.stack.map((f) => [f.fn, f.line])).toEqual([['subtotal', L.loopBody], ['checkout', L.callSubtotal], ['(anonymous)', L.result]]);
    expect(pausesAt(L.rate)[1].stack[1].line).toBe(L.bug);
  });

  it('only pauses on lines with a statement', () => {
    for (const line of PAUSABLE) expect(SOURCE[line].trim()).not.toMatch(/^(\}|$)/);
    expect(PAUSABLE.has(L.subtotalFn)).toBe(false);
    expect(PAUSABLE.has(L.loop + 2)).toBe(false); // the loop's closing brace
  });
});
