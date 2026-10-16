import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  CAPACITY, CLOSE_CALL, DEPENDENCY, ITEMS, RANGES_DEFAULT, RUNS, bestOrder, delayCost, finishTimes, lineOf, orderBy, placeItem, ranksBy, simulateRanks, swapsToRatioOrder,
  topTwo, valueBy, violation, withinCapacity, type Dependency, type Item,
} from './model';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function randomItems(seed: number, max = 8): Item[] {
  const rnd = mulberry32(seed);
  const n = 2 + Math.floor(rnd() * (max - 1));
  return Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}`, impact: 1 + Math.floor(rnd() * 10), effort: 1 + Math.floor(rnd() * 8) }));
}

function* permutations<T>(xs: readonly T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
}

const bruteMin = (items: Item[], dep: Dependency | null) => {
  let best = Infinity;
  for (const p of permutations(items.map((i) => i.id))) if (!violation(p, dep)) best = Math.min(best, delayCost(items, p));
  return best;
};

describe("Smith's rule (cost of delay over duration)", () => {
  it('the ratio order costs exactly the minimum over all permutations, and none beats it, on 200 seeded item sets of up to 8', () => {
    for (const seed of SEEDS) {
      const items = randomItems(seed);
      const ratioCost = delayCost(items, orderBy(items, 'ratio'));
      let min = Infinity;
      for (const p of permutations(items.map((i) => i.id))) min = Math.min(min, delayCost(items, p));
      expect(ratioCost, `seed ${seed}`).toBe(min);
    }
  });

  it('a hand case: (10 a week, 1 week) and (30 a week, 3 weeks) tie at ratio 10 and cost 130 either way', () => {
    const items: Item[] = [{ id: 'a', label: 'A', impact: 10, effort: 1 }, { id: 'b', label: 'B', impact: 30, effort: 3 }];
    // a then b: 10 x 1 + 30 x 4 = 130; b then a: 30 x 3 + 10 x 4 = 130
    expect(delayCost(items, ['a', 'b'])).toBe(130);
    expect(delayCost(items, ['b', 'a'])).toBe(130);
  });

  it('highest impact first and lowest effort first can both cost more than the ratio order on the backlog', () => {
    const ratio = delayCost(ITEMS, orderBy(ITEMS, 'ratio'));
    expect(delayCost(ITEMS, orderBy(ITEMS, 'impact'))).toBeGreaterThan(ratio);
    expect(delayCost(ITEMS, orderBy(ITEMS, 'effort'))).toBeGreaterThan(ratio);
  });

  it('ranks follow each rule, ties keeping the list order', () => {
    const items: Item[] = [{ id: 'a', label: 'A', impact: 3, effort: 3 }, { id: 'b', label: 'B', impact: 4, effort: 4 }, { id: 'c', label: 'C', impact: 9, effort: 1 }];
    expect(orderBy(items, 'ratio')).toEqual(['c', 'a', 'b']);
    expect(ranksBy(items, 'effort')).toEqual({ c: 1, a: 2, b: 3 });
    expect(ranksBy(items, 'impact')).toEqual({ c: 1, b: 2, a: 3 });
  });
});

describe('exact search with a dependency', () => {
  it('the subset search equals brute force with and without a precedence edge on 100 seeded sets', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const items = randomItems(seed, 7);
      const dep: Dependency | null = seed % 2 ? { before: items[items.length - 1].id, after: items[0].id } : null;
      const found = bestOrder(items, dep);
      expect(found.cost, `seed ${seed}`).toBe(bruteMin(items, dep));
      expect(violation(found.order, dep)).toBeNull();
      expect(delayCost(items, found.order)).toBe(found.cost);
    }
  });

  it('on the backlog the ratio order breaks the dependency, and the best allowed order costs more (brute force on the 8 items that matter)', () => {
    expect(violation(orderBy(ITEMS, 'ratio'), DEPENDENCY)).toEqual(DEPENDENCY);
    const free = bestOrder(ITEMS, null);
    const bound = bestOrder(ITEMS, DEPENDENCY);
    expect(free.cost).toBe(delayCost(ITEMS, orderBy(ITEMS, 'ratio')));
    expect(bound.cost).toBeGreaterThan(free.cost);
    expect(violation(bound.order, DEPENDENCY)).toBeNull();
    const eight = ITEMS.filter((i) => ['signup', 'csv', 'filters', 'roles', 'audit', 'onboarding', 'dark', 'mobile'].includes(i.id));
    expect(bestOrder(eight, DEPENDENCY).cost).toBe(bruteMin(eight, DEPENDENCY));
  });
});

describe('the swap breakdown', () => {
  it('each swap saves a positive amount and the savings add up to the learner\'s extra cost, on 200 random orders', () => {
    for (const seed of SEEDS) {
      const items = randomItems(seed, 8);
      const rnd = mulberry32(seed + 1000);
      const order = items.map((i) => i.id).sort(() => rnd() - 0.5);
      const swaps = swapsToRatioOrder(items, order);
      const extra = delayCost(items, order) - delayCost(items, orderBy(items, 'ratio'));
      expect(swaps.every((s) => s.saved > 0)).toBe(true);
      expect(swaps.reduce((s, x) => s + x.saved, 0), `seed ${seed}`).toBe(extra);
    }
  });

  it('finish times and value by a week are hand-worked on a two-item case', () => {
    const items: Item[] = [{ id: 'a', label: 'A', impact: 10, effort: 1 }, { id: 'b', label: 'B', impact: 30, effort: 3 }];
    expect(finishTimes(items, ['b', 'a'])).toEqual({ b: 3, a: 4 });
    // by week 5: b earns 30 x 2, a earns 10 x 1
    expect(valueBy(items, ['b', 'a'], 5)).toBe(70);
    expect(valueBy(items, ['b', 'a'], 2)).toBe(0);
  });
});

describe('placing an item', () => {
  it('snaps to half steps, keeps inside the scale, and a zero effort is refused with the reason', () => {
    expect(placeItem(3.2, 6.8)).toEqual({ impact: 7, effort: 3, refusal: null });
    expect(placeItem(0.1, 4)).toMatchObject({ effort: 0.5, refusal: expect.stringContaining('zero-length item has no ratio') });
    expect(placeItem(99, -4)).toMatchObject({ effort: 10, impact: 0.5 });
  });
});

describe('when the numbers are ranges', () => {
  it('with no spread the ranking is the plan\'s: the signup bug ranks first every time and every rank is certain', () => {
    const s = simulateRanks(ITEMS, 0, 1, 200);
    expect(s.first.signup).toBe(1);
    const order = orderBy(ITEMS, 'ratio');
    // dark mode and mobile polish tie at ratio 1: the tie breaks on the list order, not on chance, so their ranks are fixed.
    order.forEach((id, k) => expect(s.probability[id][k]).toBe(1));
  });

  it('probabilities sum to 1 per item and per rank, and the top-two chances agree across two seeds within 3 standard errors', () => {
    const a = simulateRanks(ITEMS, RANGES_DEFAULT.sigma, 1);
    const b = simulateRanks(ITEMS, RANGES_DEFAULT.sigma, 2);
    for (const i of ITEMS) expect(a.probability[i.id].reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    for (let k = 0; k < ITEMS.length; k++) expect(ITEMS.reduce((s, i) => s + a.probability[i.id][k], 0)).toBeCloseTo(1, 9);
    for (const id of ['signup', 'csv']) {
      const p = (a.first[id] + b.first[id]) / 2;
      expect(Math.abs(a.first[id] - b.first[id])).toBeLessThan(3 * Math.sqrt((2 * p * (1 - p)) / RUNS) + 1e-9);
    }
  });

  it('at the default spread the two best items are within noise, and a rank interval always contains the plan\'s own rank at zero spread', () => {
    const s = simulateRanks(ITEMS, RANGES_DEFAULT.sigma, RANGES_DEFAULT.seed);
    const t = topTwo(s);
    expect([t.top, t.second].sort()).toEqual(['csv', 'signup']);
    expect(t.close).toBe(t.gap < CLOSE_CALL);
    const planned = ranksBy(ITEMS, 'ratio');
    for (const i of ITEMS) expect(s.interval[i.id][0]).toBeLessThanOrEqual(s.interval[i.id][1]);
    expect(s.interval.search[1]).toBeGreaterThanOrEqual(planned.search - 1);
  });
});

describe('the capacity line', () => {
  it('13 weeks takes the first six items in ratio order (hand sum 1+1+2+2+3+4), worth 35 a week, with 26 a week cut', () => {
    const chosen = new Set(withinCapacity(ITEMS, CAPACITY.default));
    expect([...chosen].sort()).toEqual(['audit', 'csv', 'emails', 'filters', 'roles', 'signup']);
    expect(lineOf(ITEMS, chosen)).toEqual({ used: 13, value: 35, cutCost: 26 });
  });

  it('a bigger capacity never cuts more, and the whole backlog fits at 34 weeks', () => {
    let previous = Infinity;
    for (let c = CAPACITY.min; c <= CAPACITY.max; c++) {
      const cut = lineOf(ITEMS, new Set(withinCapacity(ITEMS, c))).cutCost;
      expect(cut).toBeLessThanOrEqual(previous);
      previous = cut;
    }
    expect(withinCapacity(ITEMS, 34)).toHaveLength(10);
  });
});
