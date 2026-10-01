import { describe, expect, it } from 'vitest';
import { changedVars, move, stepsToLineByStepInto, type Breakpoint } from './debugger';
import { evaluate, preview } from './expr';
import { FUNCTIONS, L, TRACE } from './program';

const bp = (line: number, kind: Breakpoint['kind'] = 'break', text = ''): Breakpoint => ({ line, kind, text });
const lineOf = (k: number | null) => (k === null ? null : TRACE.pauses[k].line);
const indexAt = (line: number, nth = 0) => TRACE.pauses.map((p, k) => (p.line === line ? k : -1)).filter((k) => k >= 0)[nth];
const inside = (line: number, fn: keyof typeof FUNCTIONS) => line >= FUNCTIONS[fn].from && line <= FUNCTIONS[fn].to;

describe('stepping', () => {
  it('step into walks every pause in order, entering calls', () => {
    const lines: number[] = [];
    for (let k = -1; ; ) {
      const m = move(TRACE, k, 'into', []);
      if (m.to === null) break;
      expect(m.to).toBe(k + 1);
      lines.push(lineOf(m.to)!);
      k = m.to;
    }
    expect(lines).toEqual(TRACE.pauses.map((p) => p.line));
    expect(lines).toContain(L.loopBody);
  });

  it('step into at a call pauses on the first line of the callee', () => {
    const m = move(TRACE, indexAt(L.callSubtotal), 'into', []);
    expect(lineOf(m.to)).toBe(L.subtotalInit);
    expect(TRACE.pauses[m.to!].stack[0].fn).toBe('subtotal');
  });

  it('step over at a call never pauses inside the callee, but the call still runs', () => {
    for (const [line, fn, next] of [
      [L.callSubtotal, 'subtotal', L.firstDiscount],
      [L.firstDiscount, 'applyDiscount', L.bug],
      [L.bug, 'applyDiscount', L.checkoutReturn],
    ] as const) {
      const from = indexAt(line);
      const m = move(TRACE, from, 'over', []);
      expect(lineOf(m.to)).toBe(next);
      // Every pause it ran through was inside the callee, and it ran them all.
      const skipped = TRACE.pauses.slice(from + 1, m.to!);
      expect(skipped.length).toBe(m.ranThrough);
      expect(skipped.length).toBeGreaterThan(0);
      for (const p of skipped) expect(inside(p.line, fn)).toBe(true);
    }
    // The callee's work is visible afterwards: total changed even though we never paused in subtotal.
    const after = TRACE.pauses[move(TRACE, indexAt(L.callSubtotal), 'over', []).to!];
    expect(after.stack[0].locals.total).toBe(90);
  });

  it('step over on a plain line goes to the next line in the same function', () => {
    expect(lineOf(move(TRACE, indexAt(L.loopBody), 'over', []).to)).toBe(L.loop);
    expect(lineOf(move(TRACE, indexAt(L.loop, 5), 'over', []).to)).toBe(L.subtotalReturn);
  });

  it('step out lands on the line after the call site', () => {
    expect(lineOf(move(TRACE, indexAt(L.loopBody, 2), 'out', []).to)).toBe(L.firstDiscount);
    expect(lineOf(move(TRACE, indexAt(L.rate, 0), 'out', []).to)).toBe(L.bug);
    expect(lineOf(move(TRACE, indexAt(L.rate, 1), 'out', []).to)).toBe(L.checkoutReturn);
    expect(lineOf(move(TRACE, indexAt(L.checkoutReturn), 'out', []).to)).toBe(L.log);
  });

  it('step out of the top level, or resume with no breakpoints, runs to the end and prints', () => {
    const end = move(TRACE, indexAt(L.result), 'out', []);
    expect(end.to).toBeNull();
    expect(end.printed).toEqual([{ text: '72.9', kind: 'out' }]);
    expect(move(TRACE, -1, 'resume', []).printed.map((e) => e.text)).toEqual(['72.9']);
  });
});

describe('breakpoints', () => {
  it('resume stops at each breakpoint in turn', () => {
    const bps = [bp(L.callSubtotal), bp(L.rate)];
    const a = move(TRACE, -1, 'resume', bps);
    const b = move(TRACE, a.to!, 'resume', bps);
    const c = move(TRACE, b.to!, 'resume', bps);
    expect([a, b, c].map((m) => lineOf(m.to))).toEqual([L.callSubtotal, L.rate, L.rate]);
    expect(move(TRACE, c.to!, 'resume', bps).to).toBeNull();
  });

  it('a breakpoint inside a call still pauses a step over, as in real debuggers', () => {
    const m = move(TRACE, indexAt(L.callSubtotal), 'over', [bp(L.loopBody)]);
    expect(lineOf(m.to)).toBe(L.loopBody);
    expect(m.hit?.line).toBe(L.loopBody);
  });

  it('a conditional breakpoint pauses exactly on the iterations where it holds', () => {
    const iterationsWhere = (cond: string) => {
      const seen: unknown[] = [];
      for (let k = -1; ; ) {
        const m = move(TRACE, k, 'resume', [bp(L.loopBody, 'cond', cond)]);
        if (m.to === null) break;
        seen.push(TRACE.pauses[m.to].stack[0].block?.i);
        k = m.to;
      }
      return seen;
    };
    expect(iterationsWhere('i === 3')).toEqual([3]);
    expect(iterationsWhere('i % 2 === 0')).toEqual([0, 2, 4]);
    expect(iterationsWhere('total > 40')).toEqual([2, 3, 4]);
    expect(iterationsWhere('i > 99')).toEqual([]);
  });

  it('a condition that throws or is unsupported never pauses', () => {
    const m = move(TRACE, -1, 'resume', [bp(L.loopBody, 'cond', 'nope === 1'), bp(L.rate, 'cond', 'alert(1)')]);
    expect(m.to).toBeNull();
    expect(m.conditionErrors[0]).toBe('ReferenceError: nope is not defined');
    expect(m.conditionErrors.at(-1)).toMatch(/not supported here/);
  });

  it('a logpoint prints every time it is reached and never pauses', () => {
    const m = move(TRACE, -1, 'resume', [bp(L.loopBody, 'log', "'i =', i, 'total =', total")]);
    expect(m.to).toBeNull();
    expect(m.printed).toEqual([
      ...[[0, 0], [1, 24], [2, 44], [3, 56], [4, 86]].map(([i, t]) => ({ text: `i = ${i} total = ${t}`, kind: 'log' })),
      { text: '72.9', kind: 'out' },
    ]);
  });

  it('program output is printed at the right moment relative to pauses', () => {
    const atLog = move(TRACE, -1, 'resume', [bp(L.log)]);
    expect(atLog.printed).toEqual([]); // console.log hasn't run yet
    expect(move(TRACE, atLog.to!, 'over', []).printed).toEqual([{ text: '72.9', kind: 'out' }]);
  });
});

describe('helpers', () => {
  it('changedVars flags only what changed in the same frame', () => {
    const k = indexAt(L.loopBody, 1);
    expect(changedVars(TRACE.pauses[k].stack[0], TRACE.pauses[k + 1].stack[0])).toEqual(new Set(['total', 'i']));
    expect(changedVars(TRACE.pauses[k + 1].stack[0], TRACE.pauses[k + 2].stack[0])).toEqual(new Set());
    expect(changedVars(TRACE.pauses[indexAt(L.callSubtotal)].stack[0], TRACE.pauses[indexAt(L.subtotalInit)].stack[0]).size).toBe(0);
  });

  it('brute force: Step into from the start takes this many presses to reach the bug', () => {
    expect(stepsToLineByStepInto(TRACE, L.bug)).toBe(indexAt(L.bug) + 1);
    expect(stepsToLineByStepInto(TRACE, L.bug)).toBeGreaterThan(20);
  });
});

describe('the safe expression evaluator', () => {
  const scope = [{ i: 3 }, { total: 81, items: TRACE.pauses[indexAt(L.loopBody)].stack[0].locals.items, code: 'SAVE10' }, { DISCOUNTS: { SAVE10: 0.1 } }];
  const value = (src: string) => {
    const r = evaluate(src, scope);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('agrees with JavaScript on the supported subset', () => {
    const cases: [string, unknown][] = [
      ['total * 0.9', 81 * 0.9],
      ['total - total * DISCOUNTS[code]', 81 - 81 * 0.1],
      ['items.length', 5],
      ['items[i].price * items[i].qty', 30],
      ['i === 3 && total > 80', true],
      ['!(i < 2) || false', true],
      ['DISCOUNTS.NOPE ?? 0', 0],
      ['code + "!"', 'SAVE10!'],
      ['-i + 10 % 4', -1],
      ['1 + 2 * 3 - 4 / 2', 5],
      ['code.length', 6],
      ['null == undefined', true],
    ];
    for (const [src, expected] of cases) expect(value(src)).toBe(expected);
  });

  it('reports real JavaScript errors', () => {
    expect(evaluate('nope', scope)).toMatchObject({ ok: false, error: 'ReferenceError: nope is not defined', unsupported: false });
    expect(evaluate('items[9].price', scope)).toMatchObject({ error: "TypeError: Cannot read properties of undefined (reading 'price')" });
  });

  it('refuses everything outside the subset instead of running it', () => {
    for (const src of [
      'alert(1)', 'items.map(x => x)', 'total = 0', 'i++', 'total += 1', 'new Date()', 'Math.round(total)', 'typeof total',
      '`hi`', 'items?.length', 'a, b', 'i ** 2', 'window', 'items.constructor', 'this', '{}', 'x ? 1 : 2', '',
    ]) {
      const r = evaluate(src, scope);
      expect(r.ok, src).toBe(src === 'items.constructor'); // an own-property miss is just undefined
      if (!r.ok) expect(r.unsupported || r.error.startsWith('ReferenceError'), src).toBe(true);
    }
    expect(value('items.constructor')).toBeUndefined();
    expect(evaluate('alert(1)', scope)).toMatchObject({ error: 'not supported here: function calls' });
  });

  it('previews values the way the DevTools console does', () => {
    expect(preview(72.89999999999999)).toBe('72.89999999999999');
    expect(preview('SAVE10')).toBe("'SAVE10'");
    expect(preview({ price: 12, qty: 2 })).toBe('{price: 12, qty: 2}');
    expect(preview([{ a: 1 }, [1]])).toBe('(2) [{…}, Array(1)]');
  });
});
