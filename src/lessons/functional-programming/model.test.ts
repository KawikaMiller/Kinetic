import { describe, expect, it } from 'vitest';
import {
  addTotal, applyMethod, CHAIN_CODE, FIRST_STATION_LINE, GLOBAL_DISCOUNTS, isPaid, LOOP_CODE, METHOD_CODE, ORDERS, PRICE, priceWithGlobal,
  pricePure, PURE_DISCOUNT, PURITY_CODE, SCORES, sumTotals, totalCalls, tracePipeline, type ArrayMethod, type Plan,
} from './model';

const PLANS: Plan[] = ['map-first', 'filter-first'];

/** Evaluate an on-screen chain for real, callbacks and all, exactly as shown. */
function runChain(plan: Plan) {
  return new Function('orders', `${CHAIN_CODE[plan].join('\n')}\nreturn revenue;`)(ORDERS) as number;
}

/** The callbacks as written on screen. */
function onScreenCallbacks() {
  const defs = CHAIN_CODE['map-first'].slice(0, FIRST_STATION_LINE - 2).join('\n');
  return new Function(`${defs}\nreturn { addTotal, isPaid, sumTotals };`)() as {
    addTotal: typeof addTotal;
    isPaid: typeof isPaid;
    sumTotals: typeof sumTotals;
  };
}

describe('pipeline', () => {
  it.each(PLANS)('%s: the traced result equals the on-screen chain run as real JavaScript', (plan) => {
    expect(tracePipeline(ORDERS, plan).result).toBe(runChain(plan));
  });

  it('the loop on screen computes the same revenue', () => {
    const loop = new Function('orders', `${LOOP_CODE.join('\n')}\nreturn revenue;`)(ORDERS) as number;
    expect(loop).toBe(74);
    expect(runChain('map-first')).toBe(74);
  });

  it('call counts are exact: map-first 6 + 6 + 4, filter-first 6 + 4 + 4', () => {
    const a = tracePipeline(ORDERS, 'map-first');
    const b = tracePipeline(ORDERS, 'filter-first');
    expect(a.calls).toEqual({ map: 6, filter: 6, reduce: 4 });
    expect(b.calls).toEqual({ map: 4, filter: 6, reduce: 4 });
    expect([totalCalls(a), totalCalls(b)]).toEqual([16, 14]);
  });

  it("the model's callbacks behave exactly like the ones on screen", () => {
    const shown = onScreenCallbacks();
    for (const o of ORDERS) {
      expect(addTotal(o)).toEqual(shown.addTotal(o));
      expect(isPaid(o)).toBe(shown.isPaid(o));
      expect(sumTotals(7, addTotal(o))).toBe(shown.sumTotals(7, addTotal(o)));
    }
  });

  it('the highlighted station lines are the ones that call each method', () => {
    for (const plan of PLANS) {
      const lines = CHAIN_CODE[plan].slice(FIRST_STATION_LINE);
      expect(lines.map((l) => l.trim().split('(')[0])).toEqual(
        (plan === 'map-first' ? ['map', 'filter', 'reduce'] : ['filter', 'map', 'reduce']).map((k) => `.${k}`),
      );
    }
  });

  it('each method finishes the whole array before the next starts', () => {
    for (const plan of PLANS) {
      const stations = tracePipeline(ORDERS, plan).steps.map((s) => s.station);
      expect(stations).toEqual([...stations].sort((x, y) => x - y));
    }
  });

  it('reduce accumulates the running total and the pipeline never mutates its input', () => {
    const before = JSON.stringify(ORDERS);
    const reduces = tracePipeline(ORDERS, 'map-first').steps.filter((s) => s.kind === 'reduce');
    expect(reduces.map((s) => s.acc)).toEqual([10, 34, 44, 74]);
    expect(JSON.stringify(ORDERS)).toBe(before);
  });
});

describe('purity', () => {
  const load = (global: number) =>
    new Function(`${PURITY_CODE.join('\n').replace('discount = 0.1', `discount = ${global}`)}\nreturn { priceWithGlobal, pricePure };`)() as {
      priceWithGlobal: (p: number) => number;
      pricePure: (p: number, d: number) => number;
    };

  it.each(GLOBAL_DISCOUNTS)('with the global at %s, the model matches the on-screen functions', (g) => {
    const real = load(g);
    expect(priceWithGlobal(PRICE, g)).toBe(real.priceWithGlobal(PRICE));
    expect(pricePure(PRICE, PURE_DISCOUNT)).toBe(real.pricePure(PRICE, PURE_DISCOUNT));
  });

  it('same input, different output for the impure one; always the same for the pure one', () => {
    const outs = GLOBAL_DISCOUNTS.map((g) => load(g).priceWithGlobal(PRICE));
    expect(new Set(outs).size).toBe(GLOBAL_DISCOUNTS.length);
    expect(new Set(GLOBAL_DISCOUNTS.map((g) => load(g).pricePure(PRICE, PURE_DISCOUNT))).size).toBe(1);
  });
});

describe('mutation', () => {
  const METHODS: ArrayMethod[] = ['sort', 'toSorted', 'spreadSort', 'reverse', 'toReversed'];

  it.each(METHODS)('%s: the model matches the on-screen line run as real JavaScript', (m) => {
    const real = new Function('input', `const scores = [...input];\n${METHOD_CODE[m]}\nreturn { scores, ranked, same: ranked === scores };`)(SCORES);
    const r = applyMethod(m);
    expect(r.scoresAfter).toEqual(real.scores);
    expect(r.ranked).toEqual(real.ranked);
    expect(r.sameArray).toBe(real.same);
  });

  it('sort and reverse change the array in place and return it', () => {
    for (const m of ['sort', 'reverse'] as const) {
      const r = applyMethod(m);
      expect(r.mutated).toBe(true);
      expect(r.sameArray).toBe(true);
    }
  });

  it('toSorted, toReversed and [...xs].sort() leave the original alone', () => {
    for (const m of ['toSorted', 'toReversed', 'spreadSort'] as const) {
      const r = applyMethod(m);
      expect(r.mutated).toBe(false);
      expect(r.sameArray).toBe(false);
      expect(r.scoresAfter).toEqual([...SCORES]);
    }
  });

  it('sorting gives the same ranking either way', () => {
    expect(applyMethod('sort').ranked).toEqual(applyMethod('toSorted').ranked);
    expect(applyMethod('toSorted').ranked).toEqual([42, 19, 7]);
  });
});
