// The lesson's fixed program, and a tracer that re-runs it statement by statement, recording
// every place a debugger could pause: the line, the whole call stack and every variable.
// program.test.ts runs SOURCE as real JavaScript and checks the trace against it.

import type { Value, Vars } from '../../core/expr';

export const SOURCE: readonly string[] = [
  'const DISCOUNTS = { SAVE10: 0.1, HALF: 0.5 };',
  "const CART = { code: 'SAVE10', items: [",
  '  { price: 12, qty: 2 }, { price: 20, qty: 1 }, { price: 3, qty: 4 },',
  '  { price: 15, qty: 2 }, { price: 4, qty: 1 }] };',
  '',
  'function subtotal(items) {',
  '  let total = 0;',
  '  for (let i = 0; i < items.length; i++) {',
  '    total += items[i].price * items[i].qty;',
  '  }',
  '  return total;',
  '}',
  '',
  'function applyDiscount(total, code) {',
  '  const rate = DISCOUNTS[code] ?? 0;',
  '  return total - total * rate;',
  '}',
  '',
  'function checkout(cart) {',
  '  let total = subtotal(cart.items);',
  '  total = applyDiscount(total, cart.code);',
  '  if (cart.code) total = applyDiscount(total, cart.code);',
  '  return Math.round(total * 100) / 100;',
  '}',
  '',
  'const result = checkout(CART);',
  'console.log(result); // expected 81',
];

/** 0-based line numbers the tracer and the lesson refer to. */
export const L = {
  discounts: 0, cart: 1,
  subtotalFn: 5, subtotalInit: 6, loop: 7, loopBody: 8, subtotalReturn: 10,
  discountFn: 13, rate: 14, discountReturn: 15,
  checkoutFn: 18, callSubtotal: 19, firstDiscount: 20, bug: 21, checkoutReturn: 22,
  result: 25, log: 26,
} as const;

/** Which lines belong to which function (header through closing brace). */
export const FUNCTIONS = {
  subtotal: { from: 5, to: 11, params: 'items' },
  applyDiscount: { from: 13, to: 16, params: 'total, code' },
  checkout: { from: 18, to: 23, params: 'cart' },
} as const;

export type FnName = keyof typeof FUNCTIONS | '(anonymous)';

/** The same data SOURCE declares, for the tracer. */
const DISCOUNTS: Vars = { SAVE10: 0.1, HALF: 0.5 };
const CART = {
  code: 'SAVE10',
  items: [{ price: 12, qty: 2 }, { price: 20, qty: 1 }, { price: 3, qty: 4 }, { price: 15, qty: 2 }, { price: 4, qty: 1 }],
};

export interface FrameSnap {
  /** Unique per call, so the stack panel animates the right row. */
  id: number;
  fn: FnName;
  /** The line this frame is on: where it's paused, or the call it's waiting on. */
  line: number;
  locals: Vars;
  /** The for-loop's block scope (just `i`), while inside the loop. */
  block: Vars | null;
}

export interface Pause {
  line: number;
  /** Top first, like a debugger's call-stack pane. */
  stack: readonly FrameSnap[];
  /** Top-level consts declared so far (DevTools lists them under "Script"). */
  script: Vars;
  /** How many lines the program itself had printed before this pause. */
  printed: number;
}

export interface Trace {
  pauses: readonly Pause[];
  /** console.log output of the whole run. */
  output: readonly string[];
  result: number;
}

interface LiveFrame {
  id: number;
  fn: FnName;
  line: number;
  locals: Record<string, Value>;
  block: Record<string, Value> | null;
}

class Tracer {
  readonly pauses: Pause[] = [];
  readonly output: string[] = [];
  readonly script: Record<string, Value> = {};
  private readonly stack: LiveFrame[] = [];
  private nextId = 1;

  call(fn: FnName, locals: Record<string, Value>): LiveFrame {
    const f: LiveFrame = { id: this.nextId++, fn, line: -1, locals, block: null };
    this.stack.push(f);
    return f;
  }

  ret<T>(value: T): T {
    this.stack.pop();
    return value;
  }

  /** About to run `line` in the top frame: a place the debugger can pause. */
  at(line: number) {
    this.stack[this.stack.length - 1].line = line;
    this.pauses.push({
      line,
      stack: this.stack.map((f) => ({ ...f, locals: { ...f.locals }, block: f.block && { ...f.block } })).reverse(),
      script: { ...this.script },
      printed: this.output.length,
    });
  }
}

/** subtotal(items), statement by statement. */
function subtotal(t: Tracer, items: readonly { price: number; qty: number }[]): number {
  const f = t.call('subtotal', { items });
  t.at(L.subtotalInit);
  f.locals.total = 0;
  f.block = { i: 0 };
  for (;;) {
    t.at(L.loop); // the test i < items.length (and, after the first time, i++ just ran)
    const i = f.block.i as number;
    if (!(i < items.length)) break;
    t.at(L.loopBody);
    f.locals.total = (f.locals.total as number) + items[i].price * items[i].qty;
    f.block = { i: i + 1 };
  }
  f.block = null;
  t.at(L.subtotalReturn);
  return t.ret(f.locals.total as number);
}

function applyDiscount(t: Tracer, total: number, code: string): number {
  const f = t.call('applyDiscount', { total, code });
  t.at(L.rate);
  f.locals.rate = (DISCOUNTS[code] as number | undefined) ?? 0;
  t.at(L.discountReturn);
  return t.ret(total - total * (f.locals.rate as number));
}

function checkout(t: Tracer, cart: typeof CART): number {
  const f = t.call('checkout', { cart });
  t.at(L.callSubtotal);
  f.locals.total = subtotal(t, cart.items);
  t.at(L.firstDiscount);
  f.locals.total = applyDiscount(t, f.locals.total as number, cart.code);
  t.at(L.bug);
  if (cart.code) f.locals.total = applyDiscount(t, f.locals.total as number, cart.code);
  t.at(L.checkoutReturn);
  return t.ret(Math.round((f.locals.total as number) * 100) / 100);
}

export function traceProgram(): Trace {
  const t = new Tracer();
  t.call('(anonymous)', {});
  t.at(L.discounts);
  t.script.DISCOUNTS = DISCOUNTS;
  t.at(L.cart);
  t.script.CART = CART;
  t.at(L.result);
  const result = checkout(t, CART);
  t.script.result = result;
  t.at(L.log);
  t.output.push(String(result));
  t.ret(undefined);
  return { pauses: t.pauses, output: t.output, result };
}

export const TRACE = traceProgram();

/** Lines a breakpoint can sit on: the ones execution can pause at. */
export const PAUSABLE: ReadonlySet<number> = new Set(TRACE.pauses.map((p) => p.line));

/** Variables worth showing inline at the end of each line, DevTools style. */
export const INLINE_VARS: Readonly<Record<number, readonly string[]>> = {
  [L.subtotalFn]: ['items'],
  [L.subtotalInit]: ['total'],
  [L.loop]: ['i'],
  [L.loopBody]: ['total'],
  [L.discountFn]: ['total', 'code'],
  [L.rate]: ['rate'],
  [L.checkoutFn]: ['cart'],
  [L.callSubtotal]: ['total'],
  [L.firstDiscount]: ['total'],
  [L.bug]: ['total'],
  [L.result]: ['result'],
};

/** The function a line belongs to, if any. */
export function fnOfLine(line: number): FnName {
  for (const [name, r] of Object.entries(FUNCTIONS)) if (line >= r.from && line <= r.to) return name as FnName;
  return '(anonymous)';
}
