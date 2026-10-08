/**
 * iterators-generators: the pure model. Every count and every { value, done } the stage shows
 * comes from running the generators below; the tests run the on-screen snippet text as real
 * JavaScript and check it gives the same answers.
 */

// ── Scene 1 · eager arrays vs lazy generators ──────────────────────

export const RANGE_FROM = 1;
export const RANGE_TO = 1_000_000;

export type FilterId = 'even' | 'over50';
export const FILTERS: { value: FilterId; label: string; code: string; test: (x: number) => boolean }[] = [
  { value: 'even', label: 'even', code: 'x % 2 === 0', test: (x) => x % 2 === 0 },
  { value: 'over50', label: '> 50', code: 'x > 50', test: (x) => x > 50 },
];
export const TAKES = [1, 3, 5] as const;
export type TakeN = (typeof TAKES)[number];
export const filterOf = (id: FilterId) => FILTERS.find((f) => f.value === id)!;

/** 1 to `to`, inclusive. */
export function* range(from: number, to: number) {
  for (let i = from; i <= to; i++) yield i;
}
export function* map<T, U>(it: Iterable<T>, f: (x: T) => U) {
  for (const x of it) yield f(x);
}
export function* filter<T>(it: Iterable<T>, keep: (x: T) => boolean) {
  for (const x of it) if (keep(x)) yield x;
}
/** Stops pulling as soon as it has k values (it never asks for a k+1-th). */
export function* take<T>(it: Iterable<T>, k: number) {
  if (k <= 0) return;
  for (const x of it) {
    yield x;
    if (--k === 0) return;
  }
}

export type Station = 'range' | 'map' | 'filter' | 'take';
export const STATIONS: Station[] = ['range', 'map', 'filter', 'take'];

/** One hop of one value in the lazy pipeline. */
export interface LazyEvent {
  /** range→map, map→filter, filter→take; or a drop at the filter. */
  from: Station;
  to: Station | null;
  value: number;
  dropped: boolean;
  /** Running counts of values each station has handled, after this event. */
  counts: Record<Station, number>;
}

/** Run the lazy pipeline with counting hooks: every event really happened in a generator. */
export function lazyRun(filterId: FilterId, n: number): { result: number[]; events: LazyEvent[] } {
  const keep = filterOf(filterId).test;
  const counts: Record<Station, number> = { range: 0, map: 0, filter: 0, take: 0 };
  const events: LazyEvent[] = [];
  const log = (from: Station, to: Station | null, value: number, dropped = false) => events.push({ from, to, value, dropped, counts: { ...counts } });
  const source = map(range(RANGE_FROM, RANGE_TO), (x) => {
    counts.range++;
    log('range', 'map', x);
    return x;
  });
  const squared = map(source, (x) => {
    counts.map++;
    log('map', 'filter', x * x);
    return x * x;
  });
  const kept = filter(squared, (x) => {
    counts.filter++;
    const ok = keep(x);
    if (!ok) log('filter', null, x, true);
    return ok;
  });
  const result: number[] = [];
  for (const x of take(kept, n)) {
    counts.take++;
    log('filter', 'take', x);
    result.push(x);
  }
  return { result, events };
}

export interface EagerCounts {
  result: number[];
  /** Numbers range built. */
  produced: number;
  squared: number;
  filtered: number;
  arrays: number;
  /** Elements held across every intermediate array. */
  elements: number;
}

/** Run the eager version for real: whole arrays at every stage. */
export function eagerRun(filterId: FilterId, n: number): EagerCounts {
  const keep = filterOf(filterId).test;
  const nums = Array.from({ length: RANGE_TO - RANGE_FROM + 1 }, (_, i) => RANGE_FROM + i);
  let squared = 0;
  let filtered = 0;
  const sq = nums.map((x) => {
    squared++;
    return x * x;
  });
  const kept = sq.filter((x) => {
    filtered++;
    return keep(x);
  });
  const result = kept.slice(0, n);
  return { result, produced: nums.length, squared, filtered, arrays: 4, elements: nums.length + sq.length + kept.length + result.length };
}

/** The generators the lazy lane runs, shown on screen and run as real JavaScript in the tests. */
export const HELPER_CODE = [
  'function* range(from, to) { for (let i = from; i <= to; i++) yield i; }',
  'function* map(it, f) { for (const x of it) yield f(x); }',
  'function* filter(it, keep) { for (const x of it) if (keep(x)) yield x; }',
  'function* take(it, k) {',
  '  if (k <= 0) return;',
  '  for (const x of it) {',
  '    yield x;',
  '    if (--k === 0) return;   // stops asking: the generators behind it never run again',
  '  }',
  '}',
];

export const EAGER_CODE = [
  `const nums = Array.from({ length: ${RANGE_TO.toLocaleString('en-US').replace(/,/g, '_')} }, (_, i) => i + 1);`,
  'const squares = nums.map((x) => x * x);',
  'const kept = squares.filter((x) => KEEP);',
  'const result = kept.slice(0, N);',
];
export const LAZY_CODE = [
  `const nums = range(1, ${RANGE_TO.toLocaleString('en-US').replace(/,/g, '_')});   // nothing runs yet`,
  'const squares = map(nums, (x) => x * x);',
  'const kept = filter(squares, (x) => KEEP);',
  'const result = [...take(kept, N)];          // take pulls',
];
export const pipelineCode = (lines: string[], f: FilterId, n: number) => lines.map((l) => l.replace('KEEP', filterOf(f).code).replace('N)', `${n})`));

// ── Scene 2 · the protocol ─────────────────────────────────────────

export type ProgramId = 'hand' | 'gen' | 'forBreak' | 'naturals';

export const PROGRAMS: { value: ProgramId; label: string }[] = [
  { value: 'hand', label: 'hand-written' },
  { value: 'gen', label: 'function*' },
  { value: 'forBreak', label: 'for…of + break' },
  { value: 'naturals', label: 'naturals() + take' },
];

/** The on-screen source of each program: the definition, then the caller. Tests run this text. */
export const PROGRAM_CODE: Record<ProgramId, { def: string[]; caller: string[] }> = {
  hand: {
    def: [
      'function countdown(n) {',
      '  return {',
      '    next() {',
      '      if (n === 0) return { value: undefined, done: true };',
      '      return { value: n--, done: false };',
      '    },',
      '    [Symbol.iterator]() { return this; },',
      '  };',
      '}',
    ],
    caller: ['const it = countdown(3);', 'it.next();', 'it.next();', 'it.next();', 'it.next();'],
  },
  gen: {
    def: ['function* countdown(n) {', '  while (n > 0) {', '    yield n;', '    n--;', '  }', '}'],
    caller: ['const it = countdown(3);   // runs nothing yet', 'it.next();', 'it.next();', 'it.next();', 'it.next();'],
  },
  forBreak: {
    def: ['function* countdown(n) {', '  try {', '    while (n > 0) {', '      yield n;', '      n--;', '    }', '  } finally {', '    console.log("cleanup");', '  }', '}'],
    caller: ['for (const x of countdown(3)) {', '  if (x === 2) break;', '  console.log(x);', '}'],
  },
  naturals: {
    def: [
      'function* naturals() {',
      '  let n = 1;',
      '  while (true) yield n++;',
      '}',
      'function* take(it, k) {',
      '  if (k <= 0) return;',
      '  for (const x of it) {',
      '    yield x;',
      '    if (--k === 0) return;   // leaving the loop closes `it`',
      '  }',
      '}',
    ],
    caller: ['const first = [...take(naturals(), 3)];', 'console.log(first);'],
  },
};

export function handCountdown(n: number) {
  return {
    next(): IteratorResult<number, undefined> {
      if (n === 0) return { value: undefined, done: true };
      return { value: n--, done: false };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}
export function* countdown(n: number) {
  while (n > 0) {
    yield n;
    n--;
  }
}
export function* naturals() {
  let n = 1;
  while (true) yield n++;
}

/** `{ value: 3, done: false }`, as the console shows it. */
export const showResult = (r: IteratorResult<unknown>) => `{ value: ${r.value === undefined ? 'undefined' : String(r.value)}, done: ${r.done} }`;

/** The four next() results of countdown(3), from a real run of either version. */
export const countdownResults = (impl: 'hand' | 'gen') => {
  const it = impl === 'hand' ? handCountdown(3) : countdown(3);
  return [it.next(), it.next(), it.next(), it.next()];
};

/** What for…of + break really prints, and the protocol calls it makes, from a real run. */
export function forBreakRun(): { printed: string[]; calls: string[] } {
  const printed: string[] = [];
  const calls: string[] = [];
  function* gen(n: number) {
    try {
      while (n > 0) {
        yield n;
        n--;
      }
    } finally {
      printed.push('cleanup');
    }
  }
  const g = gen(3);
  // Watch the protocol: wrap the generator object's methods.
  const watched: Iterable<number> = {
    [Symbol.iterator]() {
      calls.push('[Symbol.iterator]()');
      return {
        next: () => {
          const r = g.next();
          calls.push(`next() → ${showResult(r)}`);
          return r;
        },
        return: () => {
          calls.push('return()');
          return g.return(undefined);
        },
      };
    },
  };
  for (const x of watched) {
    if (x === 2) break;
    printed.push(String(x));
  }
  return { printed, calls };
}

/** How many values take(naturals(), 3) pulls, from a real run. */
export function naturalsRun(k: number): { result: number[]; pulled: number } {
  let pulled = 0;
  function* counted() {
    for (const x of naturals()) {
      pulled++;
      yield x;
    }
  }
  return { result: [...take(counted(), k)], pulled };
}

// ── Scene 3 · single pass ──────────────────────────────────────────

export type SourceId = 'array' | 'generator' | 'iterable' | 'file';

export const SOURCES: { value: SourceId; label: string }[] = [
  { value: 'array', label: 'array' },
  { value: 'generator', label: 'generator object' },
  { value: 'iterable', label: 'iterable class' },
  { value: 'file', label: 'line reader' },
];

export const FILE_TEXT = 'GET /\nGET /about\nPOST /login';

export const SOURCE_CODE: Record<SourceId, string[]> = {
  array: ['const xs = [1, 2, 3];'],
  generator: ['function* gen() { yield 1; yield 2; yield 3; }', 'const xs = gen();'],
  iterable: ['class Trio {', '  *[Symbol.iterator]() { yield 1; yield 2; yield 3; }', '}', 'const xs = new Trio();'],
  file: [
    'function* lines(text) {   // a line reader: one line per next()',
    '  let start = 0;',
    '  while (start < text.length) {',
    '    let end = text.indexOf("\\n", start);',
    '    if (end === -1) end = text.length;',
    '    yield text.slice(start, end);',
    '    start = end + 1;',
    '  }',
    '}',
    'const xs = lines(accessLog);',
  ],
};
export const PASS_CODE = ['console.log([...xs]);   // first pass', 'console.log([...xs]);   // second pass'];

function* trio() {
  yield 1;
  yield 2;
  yield 3;
}
class Trio {
  *[Symbol.iterator]() {
    yield 1;
    yield 2;
    yield 3;
  }
}
function* lines(text: string) {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    yield text.slice(start, end);
    start = end + 1;
  }
}

/** Both passes, from a real run. */
export function twoPasses(id: SourceId): [unknown[], unknown[]] {
  const xs: Iterable<unknown> = id === 'array' ? [1, 2, 3] : id === 'generator' ? trio() : id === 'iterable' ? new Trio() : lines(FILE_TEXT);
  return [[...xs], [...xs]];
}

/** An iterator is its own iterable: [Symbol.iterator]() returns the same, already-moving object. */
export const reusable = (id: SourceId) => id === 'array' || id === 'iterable';

export const showArray = (xs: unknown[]) => `[${xs.map((x) => (typeof x === 'string' ? `'${x}'` : String(x))).join(', ')}]`;
