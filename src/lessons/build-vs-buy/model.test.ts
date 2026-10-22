import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BENEFIT, COMPONENTS, CROSSOVER_SCAN, GROWTH, HORIZON, MAINTENANCE, OPTIONS, PAIRS, STAGES, amount, benefitCounts, bestOnAllColumns, breakEven, cheapest, cheapestFlip, componentOf, crossoverYear,
  cumulativeCost, defaultAssumptions, dominatesOption, rows, series, type Assumptions, type ComponentId, type OptionId, type StageId,
} from './model';

const email = componentOf('email');
const search = componentOf('search');
const engine = componentOf('engine');
const at = (c: typeof email, o: OptionId, n: number, g = 15, m = 20) => cumulativeCost(c, o, n, g, m);

/** Oracle: the same cost by closed forms (a geometric series for the licences), written from the spec rather than from the model. */
const closed = (c: typeof email, o: OptionId, n: number, g: number, m: number): number => {
  if (o === 'build') return c.upfront * (1 + (m / 100) * n);
  if (o === 'oss') return c.setup + c.operations * n;
  const r = 1 + g / 100;
  return c.integration + (g === 0 ? c.licence * n : (c.licence * (r ** n - 1)) / (g / 100));
};

describe('cumulative cost, by year', () => {
  it('email: build 360, 432, 504, 576; open source 80, 140, 200, 260; buy 30, 90, 159, 238.35 (hand-worked in the spec)', () => {
    expect([0, 1, 2, 3].map((n) => at(email, 'build', n))).toEqual([360, 432, 504, 576]);
    expect([0, 1, 2, 3].map((n) => at(email, 'oss', n))).toEqual([80, 140, 200, 260]);
    const buy = [0, 1, 2, 3].map((n) => at(email, 'buy', n));
    expect(buy[0]).toBe(30);
    expect(buy[1]).toBeCloseTo(90, 9);
    expect(buy[2]).toBeCloseTo(159, 9);
    expect(buy[3]).toBeCloseTo(238.35, 9);
  });

  it('matches the closed forms for every component, option, year, growth and maintenance on the sliders', () => {
    for (const c of COMPONENTS) for (const o of OPTIONS) for (let n = 0; n <= HORIZON.max; n += 1) {
      for (const g of [GROWTH.min, 15, GROWTH.max]) for (const m of [MAINTENANCE.min, 20, MAINTENANCE.max]) {
        expect(cumulativeCost(c, o.id, n, g, m), `${c.id} ${o.id} ${n} ${g} ${m}`).toBeCloseTo(closed(c, o.id, n, g, m), 7);
      }
    }
  });
});

describe('the hand-worked vectors at the defaults', () => {
  const a = defaultAssumptions();
  const net = (c: typeof email, stage: StageId, tweak: Partial<Assumptions> = {}) =>
    Object.fromEntries(rows(c, stage, { ...a, ...tweak }).map((r) => [r.option, r.net]));

  it('email: B is 0, so net cost is cost: buy 238.35, open source 260, build 576', () => {
    const n = net(email, 'custom');
    expect(n.build).toBe(576);
    expect(n.oss).toBe(260);
    expect(n.buy).toBeCloseTo(238.35, 9);
  });

  it('email crossover: at year 8 build 936 against buy 853.61, at year 9 build 1,008 against buy 1,037.15, so year 9', () => {
    expect(at(email, 'build', 8)).toBe(936);
    expect(at(email, 'buy', 8)).toBeCloseTo(853.61, 2);
    expect(at(email, 'build', 9)).toBe(1008);
    expect(at(email, 'buy', 9)).toBeCloseTo(1037.15, 2);
    expect(crossoverYear(email, 15, 20)).toBe(9);
  });

  it('crossover agrees with an independent scan of the closed forms for years 1 to 15, at a grid of growth and maintenance values', () => {
    for (const c of COMPONENTS) for (const g of [0, 5, 15, 25, 40]) for (const m of [5, 20, 40]) {
      let first: number | null = null;
      for (let n = 1; n <= 15 && first === null; n += 1) if (closed(c, 'buy', n, g, m) > closed(c, 'build', n, g, m)) first = n;
      const found = crossoverYear(c, g, m);
      if (first !== null) expect(found, `${c.id} g${g} m${m}`).toBe(first);
      else expect(found === null || found > 15, `${c.id} g${g} m${m}`).toBe(true);
    }
    expect(CROSSOVER_SCAN).toBeGreaterThanOrEqual(15);
  });

  it('search placed as custom: costs 768, 340, 317.8; benefits 450, 225, 112.5; net 318, 115, 205.3', () => {
    const rs = rows(search, 'custom', a);
    expect(rs.map((r) => r.cost)).toEqual([768, 340, expect.closeTo(317.8, 9)]);
    expect(rs.map((r) => r.benefit)).toEqual([450, 225, 112.5]);
    const n = net(search, 'custom');
    expect([n.build, n.oss]).toEqual([318, 115]);
    expect(n.buy).toBeCloseTo(205.3, 9);
  });

  it('engine placed as custom: costs 1,152, 420, 407.25; benefits 1,200, 300, 0; net -48, 120, 407.25', () => {
    const rs = rows(engine, 'custom', a);
    expect(rs.map((r) => r.cost)).toEqual([1152, 420, expect.closeTo(407.25, 9)]);
    expect(rs.map((r) => r.benefit)).toEqual([1200, 300, 0]);
    const n = net(engine, 'custom');
    expect([n.build, n.oss]).toEqual([-48, 120]);
    expect(n.buy).toBeCloseTo(407.25, 9);
  });

  it('engine break-even benefits: build against buy 248.25, open source against buy 17, build against open source 325.33', () => {
    expect(breakEven(engine, 'build', 'buy', a)).toBeCloseTo(248.25, 9);
    expect(breakEven(engine, 'oss', 'buy', a)).toBeCloseTo(17, 9);
    expect(breakEven(engine, 'build', 'oss', a)).toBeCloseTo(325.333, 3);
    expect(breakEven(engine, 'buy', 'buy', a)).toBeNull();
  });

  it('engine at B = 200: build 552 net, open source 270, buy 407.25: buy beats build but open source beats both', () => {
    const n = net(engine, 'custom', { benefit: { ...a.benefit, engine: 200 } });
    expect([n.build, n.oss]).toEqual([552, 270]);
    expect(n.buy).toBeCloseTo(407.25, 9);
  });

  it('break-even benefits are roots: bisection on the net-cost difference finds the same B', () => {
    for (const c of COMPONENTS) for (const [x, y] of PAIRS) {
      const diff = (b: number) => {
        const withB = { ...a, benefit: { ...a.benefit, [c.id]: b } };
        const r = rows(c, 'custom', withB);
        return r.find((q) => q.option === x)!.net - r.find((q) => q.option === y)!.net;
      };
      const exact = breakEven(c, x, y, a)!;
      let lo = -5000;
      let hi = 5000;
      for (let i = 0; i < 80; i += 1) {
        const mid = (lo + hi) / 2;
        if (Math.sign(diff(mid)) === Math.sign(diff(lo))) lo = mid;
        else hi = mid;
      }
      expect(exact, `${c.id} ${x} ${y}`).toBeCloseTo((lo + hi) / 2, 5);
    }
  });
});

describe('the benefit term', () => {
  it('counts only when the component is placed in Genesis or Custom-built, over all 4^3 = 64 placements', () => {
    const a = defaultAssumptions();
    let seen = 0;
    for (const e of STAGES) for (const s of STAGES) for (const g of STAGES) {
      const placement: Record<ComponentId, StageId> = { email: e.id, search: s.id, engine: g.id };
      for (const c of COMPONENTS) {
        const counted = rows(c, placement[c.id], a).map((r) => r.benefit);
        const expected = ['genesis', 'custom'].includes(placement[c.id]) ? OPTIONS.map((o) => a.benefit[c.id] * a.horizon * c.control[o.id]) : [0, 0, 0];
        expect(counted).toEqual(expected);
      }
      seen += 1;
    }
    expect(seen).toBe(64);
    expect(STAGES.filter((s) => benefitCounts(s.id)).map((s) => s.id)).toEqual(['genesis', 'custom']);
  });

  it('orders the options by net cost like a direct sort, over 200 seeded parameter sets', () => {
    const rnd = mulberry32(31);
    const pick = (lo: number, hi: number, step: number) => lo + step * Math.floor((rnd() * (hi - lo)) / step + 0.5);
    for (let i = 0; i < 200; i += 1) {
      const c = COMPONENTS[Math.floor(rnd() * 3)];
      const stage = STAGES[Math.floor(rnd() * 4)].id;
      const a: Assumptions = {
        growth: pick(GROWTH.min, GROWTH.max, GROWTH.step), maintenance: pick(MAINTENANCE.min, MAINTENANCE.max, MAINTENANCE.step), horizon: pick(HORIZON.min, HORIZON.max, 1),
        benefit: { ...defaultAssumptions().benefit, [c.id]: pick(BENEFIT.min, BENEFIT.max, BENEFIT.step) }, includeReversal: rnd() < 0.5,
      };
      const direct = OPTIONS.map((o) => ({
        id: o.id,
        net: closed(c, o.id, a.horizon, a.growth, a.maintenance)
          - (benefitCounts(stage) ? a.benefit[c.id] * a.horizon * c.control[o.id] : 0)
          + (a.includeReversal ? c.reversal[o.id] : 0),
      })).sort((x, y) => x.net - y.net);
      const modelled = [...rows(c, stage, a)].sort((x, y) => x.net - y.net);
      expect(modelled.map((r) => r.option)).toEqual(direct.map((d) => d.id));
    }
  });

  it('the reversal toggle adds each option\'s reversal cost to its net cost and nothing else', () => {
    const a = defaultAssumptions();
    const off = rows(engine, 'custom', a);
    const on = rows(engine, 'custom', { ...a, includeReversal: true });
    for (const [i, o] of OPTIONS.entries()) expect(on[i].net - off[i].net).toBe(engine.reversal[o.id]);
  });
});

describe('the lowest-net flip', () => {
  // Independent oracle: the closed forms for email at 15% growth, 20% maintenance, no benefit (email's B is 0).
  const buy = (n: number) => 30 + Array.from({ length: n }, (_, y) => 60 * 1.15 ** y).reduce((s, x) => s + x, 0);
  const oss = (n: number) => 80 + 60 * n;
  const build = (n: number) => 360 + 0.2 * 360 * n;
  it('email: buy is lowest through year 3 (238.35 against 260) and open source from year 4 (320 against 329.6), build never', () => {
    const a = defaultAssumptions();
    expect(buy(3)).toBeCloseTo(238.35, 2);
    expect(buy(4)).toBeGreaterThan(oss(4));
    for (let n = 1; n <= 30; n += 1) expect(build(n) < Math.min(buy(n), oss(n)), `year ${n}`).toBe(false);
    expect(cheapestFlip(email, 'commodity', a)).toEqual({ year: 4, from: ['buy'], to: ['oss'] });
  });

  it('agrees with a closed-form scan for all three components and placements at the defaults', () => {
    const a = defaultAssumptions();
    for (const c of COMPONENTS) for (const stage of STAGES) {
      const lowest = (n: number) => cheapest(rows(c, stage.id, { ...a, horizon: n }));
      let want: ReturnType<typeof cheapestFlip> = null;
      for (let n = 2; n <= CROSSOVER_SCAN && want === null; n += 1) if (lowest(n).join() !== lowest(1).join()) want = { year: n, from: lowest(1), to: lowest(n) };
      expect(cheapestFlip(c, stage.id, a), `${c.id} ${stage.id}`).toEqual(want);
    }
  });
});

describe('no option is a straw man', () => {
  it('no option is dominated, and none is best on all four columns, for each component at the defaults and every placement, with and without the reversal cost', () => {
    for (const c of COMPONENTS) for (const stage of STAGES) for (const includeReversal of [false, true]) {
      const rs = rows(c, stage.id, { ...defaultAssumptions(), includeReversal });
      for (const x of rs) for (const y of rs) if (x !== y) expect(dominatesOption(c, x, y), `${c.id} ${stage.id} ${x.option} over ${y.option}`).toBe(false);
      expect(bestOnAllColumns(c, rs), `${c.id} ${stage.id}`).toEqual([]);
    }
  });
});

describe('the chart series and the money format', () => {
  it('has one point a year from 0 to the horizon, ending at the cumulative cost', () => {
    const a = defaultAssumptions();
    const s = series(email, 'build', a);
    expect(s).toEqual([[0, 360], [1, 432], [2, 504], [3, 576]]);
    expect(series(email, 'oss', { ...a, horizon: HORIZON.max })).toHaveLength(HORIZON.max + 1);
  });

  it('writes 238.35, 1,008, 1,037.15 and a negative with a real minus', () => {
    expect([amount(238.35), amount(1008), amount(1037.15), amount(-48), amount(0.005)]).toEqual(['238.35', '1,008', '1,037.15', '−48', '0.01']);
  });
});
