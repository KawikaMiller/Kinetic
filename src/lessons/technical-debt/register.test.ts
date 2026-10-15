import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { disagreement } from './captions';
import {
  ITEMS, byInterest, byPayback, businessTerms, leaveIt, monthlyInterest, paybackMonths, paybackText, DEFAULT_HORIZON, HORIZON_MAX, HORIZON_MIN,
  MONTHS_PER_QUARTER, WORKDAYS_PER_WEEK, type Item,
} from './register';

const item = (over: Partial<Item>): Item => ({ id: 'x', name: 'x', fixDays: 10, touches: 2, extraDays: 1, ...over });

describe('interest and payback', () => {
  it('is touches times extra days, and payback is fix cost over that, in hand-worked cases', () => {
    expect(monthlyInterest(item({ touches: 4, extraDays: 1 }))).toBe(4);
    expect(paybackMonths(item({ fixDays: 8, touches: 4, extraDays: 1 }))).toBe(2);
    expect(paybackMonths(item({ fixDays: 40, touches: 3, extraDays: 3 }))).toBeCloseTo(40 / 9, 12);
    expect(paybackMonths(item({ fixDays: 15, touches: 6, extraDays: 0.5 }))).toBe(5);
  });

  it('prints never, not Infinity or NaN, when nobody touches the item or each touch costs nothing', () => {
    for (const i of [item({ touches: 0 }), item({ extraDays: 0 }), item({ touches: 0, extraDays: 0 })]) {
      expect(monthlyInterest(i)).toBe(0);
      expect(paybackMonths(i)).toBe(Infinity);
      expect(paybackText(paybackMonths(i))).toBe('never');
      expect(paybackText(paybackMonths(i))).not.toMatch(/Infinity|NaN/);
    }
    expect(paybackText(2)).toBe('2.0 months');
    expect(paybackText(40 / 9)).toBe('4.4 months');
  });

  it('labels leave it exactly when payback is beyond the horizon or never', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 500; k++) {
      const i = item({ fixDays: 1 + Math.floor(rnd() * 40), touches: Math.floor(rnd() * 20), extraDays: Math.floor(rnd() * 20) / 4 });
      const horizon = HORIZON_MIN + Math.floor(rnd() * (HORIZON_MAX - HORIZON_MIN + 1));
      const pays = monthlyInterest(i) > 0 && i.fixDays <= horizon * monthlyInterest(i);
      expect(leaveIt(i, horizon)).toBe(!pays);
    }
  });
});

describe('the two rankings', () => {
  it('sort by payback and by interest against a brute-force check, ties keeping register order', () => {
    const rnd = mulberry32(11);
    for (let k = 0; k < 200; k++) {
      const items = ITEMS.map((i) => ({ ...i, touches: Math.floor(rnd() * 4), extraDays: Math.floor(rnd() * 3) }));
      const pain = byInterest(items).map((i) => i.id);
      const ret = byPayback(items).map((i) => i.id);
      for (const order of [pain, ret]) expect([...order].sort()).toEqual(items.map((i) => i.id).sort());
      for (let a = 0; a < pain.length; a++) {
        for (let b = a + 1; b < pain.length; b++) {
          const x = items.find((i) => i.id === pain[a])!;
          const y = items.find((i) => i.id === pain[b])!;
          expect(monthlyInterest(x)).toBeGreaterThanOrEqual(monthlyInterest(y));
          if (monthlyInterest(x) === monthlyInterest(y)) expect(items.indexOf(x)).toBeLessThan(items.indexOf(y));
          const rx = items.find((i) => i.id === ret[a])!;
          const ry = items.find((i) => i.id === ret[b])!;
          expect(paybackMonths(rx)).toBeLessThanOrEqual(paybackMonths(ry));
          if (paybackMonths(rx) === paybackMonths(ry)) expect(items.indexOf(rx)).toBeLessThan(items.indexOf(ry));
        }
      }
    }
  });

  it('try-this 4: at the opening estimates the orders disagree, and the report generator never pays back', () => {
    const pain = byInterest(ITEMS).map((i) => i.id);
    const ret = byPayback(ITEMS).map((i) => i.id);
    expect(pain).not.toEqual(ret);
    expect(pain[0]).toBe('order');
    expect(ret.indexOf('order')).toBe(2);
    expect(disagreement(ITEMS).agree).toBe(false);
    const report = ITEMS.find((i) => i.id === 'report')!;
    expect(report.fixDays).toBe(12);
    expect(report.touches).toBe(0);
    expect(paybackText(paybackMonths(report))).toBe('never');
    expect(ret[ret.length - 1]).toBe('report');
  });

  it('puts an item with no interest last in the return order whatever its fix cost', () => {
    const items = [item({ id: 'a', touches: 0, fixDays: 1 }), item({ id: 'b', fixDays: 30 }), item({ id: 'c', fixDays: 5 })];
    expect(byPayback(items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('business terms', () => {
  it('turns days a month into weeks a quarter, and fix and savings into one payback, in a hand-worked register', () => {
    const items = [item({ id: 'a', fixDays: 8, touches: 4, extraDays: 1 }), item({ id: 'b', fixDays: 40, touches: 3, extraDays: 3 }), item({ id: 'c', touches: 0 })];
    const t = businessTerms(items, 6);
    // interest a month: 4 + 9 + 0 = 13 days; a quarter is 39 days; five-day weeks give 7.8
    expect(t.weeksLostPerQuarter).toBeCloseTo((13 * MONTHS_PER_QUARTER) / WORKDAYS_PER_WEEK, 12);
    expect(t.weeksLostPerQuarter).toBeCloseTo(7.8, 12);
    // within 6 months only a pays back (2 months); b needs 4.44, c never: so b is worth it too
    expect(t.worth.map((i) => i.id)).toEqual(['a', 'b']);
    expect(t.fixDays).toBe(48);
    expect(t.savedPerMonth).toBe(13);
    expect(t.paysBackMonths).toBeCloseTo(48 / 13, 12);
  });

  it('says nothing pays back when no item is worth fixing', () => {
    const t = businessTerms([item({ touches: 0 })], DEFAULT_HORIZON);
    expect(t.worth).toEqual([]);
    expect(t.paysBackMonths).toBeNull();
  });

  it('ends with a worth-fixing set that pays back within the horizon at every horizon', () => {
    for (let h = HORIZON_MIN; h <= HORIZON_MAX; h++) {
      const t = businessTerms(ITEMS, h);
      if (t.paysBackMonths !== null) expect(t.paysBackMonths).toBeLessThanOrEqual(h + 1e-9);
    }
  });
});
