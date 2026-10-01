// Pure logic for the functional-programming lesson: an order pipeline traced from
// real Array.prototype calls, a pure vs impure function, and in-place vs copying
// array methods. Everything the stage shows comes from here.

export interface Order {
  id: number;
  item: string;
  qty: number;
  price: number;
  paid: boolean;
}

export interface Priced extends Order {
  total: number;
}

export const ORDERS: readonly Order[] = [
  { id: 1, item: 'socks', qty: 2, price: 5, paid: true },
  { id: 2, item: 'hat', qty: 1, price: 18, paid: false },
  { id: 3, item: 'mug', qty: 3, price: 8, paid: true },
  { id: 4, item: 'lamp', qty: 1, price: 40, paid: false },
  { id: 5, item: 'pens', qty: 5, price: 2, paid: true },
  { id: 6, item: 'book', qty: 2, price: 15, paid: true },
];

// The three callbacks the pipeline uses; the on-screen code spells out the same functions.
export const addTotal = (o: Order): Priced => ({ ...o, total: o.qty * o.price });
export const isPaid = (o: Order): boolean => o.paid;
export const sumTotals = (sum: number, o: Priced): number => sum + o.total;

export type Plan = 'map-first' | 'filter-first';
export type StationKind = 'map' | 'filter' | 'reduce';

export const STATIONS: Record<Plan, readonly StationKind[]> = {
  'map-first': ['map', 'filter', 'reduce'],
  'filter-first': ['filter', 'map', 'reduce'],
};

export const STATION_CALLS: Record<StationKind, string> = {
  map: '.map(addTotal)',
  filter: '.filter(isPaid)',
  reduce: '.reduce(sumTotals, 0)',
};

/** One callback call, in the order JavaScript really makes them. */
export interface Step {
  /** Position of the station in the pipeline (0, 1, 2). */
  station: number;
  kind: StationKind;
  itemId: number;
  /** filter: the predicate's answer. */
  kept?: boolean;
  /** map: the total it computed; reduce: the total it added. */
  total?: number;
  /** reduce: the accumulator after this call. */
  acc?: number;
}

export interface Trace {
  steps: Step[];
  result: number;
  calls: Record<StationKind, number>;
}

/**
 * Run the pipeline with real array methods, recording every callback call. Each method
 * finishes the whole array before the next one starts: that's how chained array methods
 * work (they build a new array each time), not item by item.
 */
export function tracePipeline(orders: readonly Order[], plan: Plan): Trace {
  const steps: Step[] = [];
  const calls: Record<StationKind, number> = { map: 0, filter: 0, reduce: 0 };
  let items: Order[] = [...orders];
  let result = 0;
  STATIONS[plan].forEach((kind, station) => {
    if (kind === 'map') {
      items = items.map((o) => {
        calls.map++;
        const priced = addTotal(o);
        steps.push({ station, kind, itemId: o.id, total: priced.total });
        return priced;
      });
    } else if (kind === 'filter') {
      items = items.filter((o) => {
        calls.filter++;
        const kept = isPaid(o);
        steps.push({ station, kind, itemId: o.id, kept });
        return kept;
      });
    } else {
      result = (items as Priced[]).reduce((sum, o) => {
        calls.reduce++;
        const acc = sumTotals(sum, o);
        steps.push({ station, kind, itemId: o.id, total: o.total, acc });
        return acc;
      }, 0);
    }
  });
  return { steps, result, calls };
}

export const totalCalls = (t: Trace) => t.calls.map + t.calls.filter + t.calls.reduce;

const CALLBACK_CODE = [
  'const addTotal = (o) => ({ ...o, total: o.qty * o.price });',
  'const isPaid = (o) => o.paid;',
  'const sumTotals = (sum, o) => sum + o.total;',
  '',
  'const revenue = orders',
];

/** The code the stage shows for each plan: the tests run exactly these lines. */
export const CHAIN_CODE: Record<Plan, readonly string[]> = {
  'map-first': [...CALLBACK_CODE, '  .map(addTotal)', '  .filter(isPaid)', '  .reduce(sumTotals, 0);'],
  'filter-first': [...CALLBACK_CODE, '  .filter(isPaid)', '  .map(addTotal)', '  .reduce(sumTotals, 0);'],
};

/** Station i's call is on this line of CHAIN_CODE. */
export const FIRST_STATION_LINE = CALLBACK_CODE.length;

/** The same job as one loop, for comparison. */
export const LOOP_CODE: readonly string[] = [
  'let revenue = 0;',
  'for (const o of orders) {',
  '  if (!o.paid) continue;',
  '  revenue += o.qty * o.price;',
  '}',
];

// ── Purity ─────────────────────────────────────────────────────────────

export const PURITY_CODE: readonly string[] = [
  'let discount = 0.1; // a global anyone can change',
  '',
  'function priceWithGlobal(price) {',
  '  return price * (1 - discount);',
  '}',
  '',
  'function pricePure(price, discount) {',
  '  return price * (1 - discount);',
  '}',
];

export const PRICE = 100;
export const PURE_DISCOUNT = 0.1;
export const GLOBAL_DISCOUNTS = [0.1, 0.25, 0.5] as const;

/** What `priceWithGlobal(price)` returns while the global is `globalDiscount`. */
export const priceWithGlobal = (price: number, globalDiscount: number) => price * (1 - globalDiscount);
/** What `pricePure(price, discount)` returns: only its arguments matter. */
export const pricePure = (price: number, discount: number) => price * (1 - discount);

// ── Mutation ───────────────────────────────────────────────────────────

export type ArrayMethod = 'sort' | 'toSorted' | 'spreadSort' | 'reverse' | 'toReversed';

export const METHOD_CODE: Record<ArrayMethod, string> = {
  sort: 'const ranked = scores.sort((a, b) => b - a);',
  toSorted: 'const ranked = scores.toSorted((a, b) => b - a);',
  spreadSort: 'const ranked = [...scores].sort((a, b) => b - a);',
  reverse: 'const ranked = scores.reverse();',
  toReversed: 'const ranked = scores.toReversed();',
};

export const METHOD_LABEL: Record<ArrayMethod, string> = {
  sort: '.sort()',
  toSorted: '.toSorted()',
  spreadSort: '[...xs].sort()',
  reverse: '.reverse()',
  toReversed: '.toReversed()',
};

export const SCORES: readonly number[] = [42, 7, 19];

export interface MethodResult {
  /** `scores` after the line ran. */
  scoresAfter: number[];
  /** `ranked`, the value the line returned. */
  ranked: number[];
  /** `ranked === scores`: the method handed back the same array it changed. */
  sameArray: boolean;
  /** The line changed `scores` itself. */
  mutated: boolean;
  /** `ranked` really is highest first. Reversing only flips the entry order, which isn't a ranking. */
  isRanked: boolean;
}

/** Highest score first, ties allowed. */
export const isRankedDesc = (xs: readonly number[]) => xs.every((v, i) => i === 0 || xs[i - 1] >= v);

/** Run the method for real on a fresh copy of `scores`. */
export function applyMethod(method: ArrayMethod, input: readonly number[] = SCORES): MethodResult {
  const scores = [...input];
  const desc = (a: number, b: number) => b - a;
  const ranked =
    method === 'sort'
      ? scores.sort(desc)
      : method === 'toSorted'
        ? scores.toSorted(desc)
        : method === 'spreadSort'
          ? [...scores].sort(desc)
          : method === 'reverse'
            ? scores.reverse()
            : scores.toReversed();
  return {
    scoresAfter: [...scores],
    ranked: [...ranked],
    sameArray: ranked === scores,
    mutated: scores.some((v, i) => v !== input[i]),
    isRanked: isRankedDesc(ranked),
  };
}
