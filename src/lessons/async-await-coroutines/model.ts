/**
 * The lesson's models. Requests are timers with illustrative durations; what the promises do
 * with them is JavaScript's real behaviour, which the tests check by running the on-screen code
 * (with fake timers, or in a child Node process for unhandled rejections).
 */

export type ReqId = 'a' | 'b' | 'c';
export const REQS: ReqId[] = ['a', 'b', 'c'];
/** Illustrative durations, ms. */
export const DURATION: Record<ReqId, number> = { a: 300, b: 500, c: 200 };

/* ---------- sequential vs parallel ---------- */

export type Shape = 'sequential' | 'all' | 'startFirst';

export const SHAPE_CODE: Record<Shape, string[]> = {
  sequential: [
    'async function load() {',
    '  const x = await a();',
    '  const y = await b();',
    '  const z = await c();',
    '  return [x, y, z];',
    '}',
  ],
  all: [
    'async function load() {',
    '  const [x, y, z] = await Promise.all([a(), b(), c()]);',
    '  return [x, y, z];',
    '}',
  ],
  startFirst: [
    'async function load() {',
    '  const pa = a(), pb = b(), pc = c(); // all three start now',
    '  const x = await pa;',
    '  const y = await pb;',
    '  const z = await pc;',
    '  return [x, y, z];',
    '}',
  ],
};

export interface Span {
  id: ReqId;
  start: number;
  end: number;
}

export interface ShapeRun {
  requests: Span[];
  /** When load() is suspended at an await: [start, end, line of the await]. */
  waits: { start: number; end: number; line: number; on: string }[];
  total: number;
}

/**
 * When each request runs and when load() is suspended. Sequential: each await starts the next
 * request only after the last one settles. Otherwise all three start at once.
 */
export function shapeRun(shape: Shape): ShapeRun {
  if (shape === 'sequential') {
    let t = 0;
    const requests = REQS.map((id) => {
      const span = { id, start: t, end: t + DURATION[id] };
      t = span.end;
      return span;
    });
    return { requests, waits: requests.map((r, i) => ({ start: r.start, end: r.end, line: i + 1, on: `${r.id}()` })), total: t };
  }
  const requests = REQS.map((id) => ({ id, start: 0, end: DURATION[id] }));
  const total = Math.max(...requests.map((r) => r.end));
  if (shape === 'all') return { requests, waits: [{ start: 0, end: total, line: 1, on: 'Promise.all' }], total };
  // Await each in order: suspended on pa until a ends, then pb until b ends (c is already done by then).
  let t = 0;
  const waits = REQS.map((id, i) => {
    const end = Math.max(t, DURATION[id]);
    const w = { start: t, end, line: i + 2, on: `p${id}` };
    t = end;
    return w;
  });
  return { requests, waits, total };
}

/* ---------- combinators ---------- */

export type Outcome = 'resolve' | 'reject';
export type Combinator = 'all' | 'allSettled' | 'race' | 'any';
export const COMBINATORS: Combinator[] = ['all', 'allSettled', 'race', 'any'];

export interface ReqSetting {
  outcome: Outcome;
  at: number;
}

export type Settled =
  | { status: 'fulfilled'; at: number; value: string }
  | { status: 'rejected'; at: number; reason: string };

/** What each request settles with: fulfilled "A", or rejected Error('b failed'). */
export const valueOf = (id: ReqId) => id.toUpperCase();
export const reasonOf = (id: ReqId) => `${id} failed`;

/** Settle order: by time; at the same time, in the order the timers were set (a, b, c). */
const order = (s: Record<ReqId, ReqSetting>) => [...REQS].sort((x, y) => s[x].at - s[y].at || REQS.indexOf(x) - REQS.indexOf(y));

/** The model's prediction of what each combinator does with these three requests. */
export function predict(c: Combinator, s: Record<ReqId, ReqSetting>): Settled {
  const seq = order(s);
  const last = Math.max(...REQS.map((id) => s[id].at));
  const fulfilled = seq.filter((id) => s[id].outcome === 'resolve');
  const rejected = seq.filter((id) => s[id].outcome === 'reject');
  switch (c) {
    case 'all':
      return rejected.length
        ? { status: 'rejected', at: s[rejected[0]].at, reason: reasonOf(rejected[0]) }
        : { status: 'fulfilled', at: last, value: `[${REQS.map((id) => `"${valueOf(id)}"`).join(', ')}]` };
    case 'allSettled':
      return {
        status: 'fulfilled',
        at: last,
        value: `[${REQS.map((id) => (s[id].outcome === 'resolve' ? `fulfilled "${valueOf(id)}"` : `rejected ${reasonOf(id)}`)).join(', ')}]`,
      };
    case 'race': {
      const first = seq[0];
      return s[first].outcome === 'resolve' ? { status: 'fulfilled', at: s[first].at, value: `"${valueOf(first)}"` } : { status: 'rejected', at: s[first].at, reason: reasonOf(first) };
    }
    case 'any':
      return fulfilled.length
        ? { status: 'fulfilled', at: s[fulfilled[0]].at, value: `"${valueOf(fulfilled[0])}"` }
        : { status: 'rejected', at: last, reason: `AggregateError: ${REQS.map(reasonOf).join(', ')}` };
  }
}

/* ---------- the coroutine as a state machine ---------- */

export const HELPERS = [
  'const loadCart = () => Promise.resolve({ items: 3 });',
  'const price = (cart) => Promise.resolve(cart.items * 10);',
];

export const ASYNC_SRC = [
  'async function checkout() {',
  "  console.log('checkout: start');",
  '  const cart = await loadCart();',
  "  console.log('cart has ' + cart.items + ' items');",
  '  const total = await price(cart);',
  "  console.log('total ' + total);",
  '  return total;',
  '}',
];

/** Roughly what a compiler turns checkout() into (error handling left out): a switch over saved states. */
export const DESUGARED_SRC = [
  'function checkout() {',
  '  const frame = { state: 0, cart: undefined, total: undefined };',
  '  return new Promise((resolve, reject) => {',
  '    function step(value) {',
  '      switch (frame.state) {',
  '        case 0:',
  "          console.log('checkout: start');",
  '          frame.state = 1;',
  '          return loadCart().then(step, reject);',
  '        case 1:',
  '          frame.cart = value;',
  "          console.log('cart has ' + frame.cart.items + ' items');",
  '          frame.state = 2;',
  '          return price(frame.cart).then(step, reject);',
  '        case 2:',
  '          frame.total = value;',
  "          console.log('total ' + frame.total);",
  '          resolve(frame.total);',
  '      }',
  '    }',
  '    step();',
  '  });',
  '}',
];

export const CALLER_SRC = [
  "console.log('main: calling checkout');",
  "checkout().then((t) => console.log('main: checkout done, ' + t));",
  "console.log('main: carries on');",
];

export type Runner = 'main' | 'checkout' | 'microtask';

export interface MachineStep {
  /** Lines lit in each listing (-1: none). */
  asyncLine: number;
  sugarLine: number;
  callerLine: number;
  /** Who is on the call stack now, top first. */
  stack: string[];
  /** The parked locals object: null while checkout() isn't suspended or running. */
  frame: { state: number; cart: string; total: string } | null;
  suspended: boolean;
  printed: string | null;
  say: string;
}

/**
 * checkout() run by hand through its desugared form, one step per thing that happens. The
 * console lines it prints are checked against the real async function in the tests.
 */
export const MACHINE: MachineStep[] = [
  { asyncLine: -1, sugarLine: -1, callerLine: 0, stack: ['main'], frame: null, suspended: false, printed: 'main: calling checkout', say: 'The caller logs, then calls checkout().' },
  { asyncLine: 0, sugarLine: 1, callerLine: 1, stack: ['checkout()', 'main'], frame: { state: 0, cart: 'undefined', total: 'undefined' }, suspended: false, printed: null, say: 'Calling checkout() creates its frame object on the heap, with state 0, and a promise for its result.' },
  { asyncLine: 1, sugarLine: 6, callerLine: 1, stack: ['step()', 'checkout()', 'main'], frame: { state: 0, cart: 'undefined', total: 'undefined' }, suspended: false, printed: 'checkout: start', say: 'step() runs case 0: everything up to the first await runs synchronously, on the caller\'s stack.' },
  { asyncLine: 2, sugarLine: 8, callerLine: 1, stack: ['step()', 'checkout()', 'main'], frame: { state: 1, cart: 'undefined', total: 'undefined' }, suspended: false, printed: null, say: 'The first await: save state = 1, call loadCart(), and register step as the continuation with .then.' },
  { asyncLine: 2, sugarLine: 8, callerLine: 2, stack: ['main'], frame: { state: 1, cart: 'undefined', total: 'undefined' }, suspended: true, printed: 'main: carries on', say: 'checkout() returns its promise and its frames leave the stack: it is suspended, not blocking. The caller carries on.' },
  { asyncLine: 3, sugarLine: 11, callerLine: -1, stack: ['step(cart)', '(microtask)'], frame: { state: 1, cart: '{ items: 3 }', total: 'undefined' }, suspended: false, printed: 'cart has 3 items', say: 'The stack is empty, so the event loop runs the microtask: step(cart) resumes in case 1, with the saved frame.' },
  { asyncLine: 4, sugarLine: 13, callerLine: -1, stack: ['step(cart)', '(microtask)'], frame: { state: 2, cart: '{ items: 3 }', total: 'undefined' }, suspended: false, printed: null, say: 'The second await: state = 2, call price(cart), register step again.' },
  { asyncLine: 4, sugarLine: 13, callerLine: -1, stack: [], frame: { state: 2, cart: '{ items: 3 }', total: 'undefined' }, suspended: true, printed: null, say: 'Suspended again: nothing of checkout() is on the stack, only its frame object on the heap.' },
  { asyncLine: 5, sugarLine: 16, callerLine: -1, stack: ['step(30)', '(microtask)'], frame: { state: 2, cart: '{ items: 3 }', total: '30' }, suspended: false, printed: 'total 30', say: 'Resumed in case 2 with total = 30.' },
  { asyncLine: 6, sugarLine: 17, callerLine: -1, stack: ['step(30)', '(microtask)'], frame: null, suspended: false, printed: null, say: 'return total resolves checkout()\'s promise; the frame is no longer needed.' },
  { asyncLine: -1, sugarLine: -1, callerLine: 1, stack: ['(then callback)', '(microtask)'], frame: null, suspended: false, printed: 'main: checkout done, 30', say: 'The caller\'s .then callback runs as one more microtask.' },
];

/* ---------- pitfalls ---------- */

export type PitfallId = 'noAwait' | 'forEach' | 'returnNoAwait';

export interface Pitfall {
  id: PitfallId;
  label: string;
  code: string[];
  fixed: string[];
  /** Lines to tint: the bug, and the fix. */
  badLine: number;
  fixLines: number[];
  /** What the console shows, as Chrome prints it. `unhandled` is printed last, in red. */
  out: string[];
  unhandled: string | null;
  fixedOut: string[];
}

export const PITFALLS: Pitfall[] = [
  {
    id: 'noAwait',
    label: 'Forgotten await',
    code: [
      "async function save() { throw new Error('disk full'); }",
      'async function main() {',
      '  save();',
      "  console.log('done');",
      '}',
      'main();',
    ],
    fixed: [
      "async function save() { throw new Error('disk full'); }",
      'async function main() {',
      '  await save();',
      "  console.log('done');",
      '}',
      "main().catch((e) => console.log('failed: ' + e.message));",
    ],
    badLine: 2,
    fixLines: [2, 5],
    out: ['done'],
    unhandled: 'Uncaught (in promise) Error: disk full',
    fixedOut: ['failed: disk full'],
  },
  {
    id: 'forEach',
    label: 'forEach(async …)',
    code: [
      'const wait = (ms) => new Promise((r) => setTimeout(r, ms));',
      'async function main() {',
      '  [3, 1, 2].forEach(async (n) => {',
      '    await wait(n * 10);',
      "    console.log('sent ' + n);",
      '  });',
      "  console.log('all sent');",
      '}',
      'main();',
    ],
    fixed: [
      'const wait = (ms) => new Promise((r) => setTimeout(r, ms));',
      'async function main() {',
      '  await Promise.all([3, 1, 2].map(async (n) => {',
      '    await wait(n * 10);',
      "    console.log('sent ' + n);",
      '  }));',
      "  console.log('all sent');",
      '}',
      'main();',
    ],
    badLine: 2,
    fixLines: [2, 5],
    out: ['all sent', 'sent 1', 'sent 2', 'sent 3'],
    unhandled: null,
    fixedOut: ['sent 1', 'sent 2', 'sent 3', 'all sent'],
  },
  {
    id: 'returnNoAwait',
    label: 'try around a promise',
    code: [
      "async function load() { throw new Error('timeout'); }",
      'async function main() {',
      '  try {',
      '    return load();',
      '  } catch (e) {',
      "    console.log('caught: ' + e.message);",
      '  }',
      '}',
      "main().then(() => console.log('main finished'));",
    ],
    fixed: [
      "async function load() { throw new Error('timeout'); }",
      'async function main() {',
      '  try {',
      '    return await load();',
      '  } catch (e) {',
      "    console.log('caught: ' + e.message);",
      '  }',
      '}',
      "main().then(() => console.log('main finished'));",
    ],
    badLine: 3,
    fixLines: [3],
    out: [],
    unhandled: 'Uncaught (in promise) Error: timeout',
    fixedOut: ['caught: timeout', 'main finished'],
  },
];
