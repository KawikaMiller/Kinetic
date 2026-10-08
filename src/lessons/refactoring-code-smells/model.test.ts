import { describe, expect, it } from 'vitest';
import {
  ALL_SUBSETS, CHARACTERIZATION, REFACTORS, callLine, compileVersion, diffRows, lineDiff, metrics, randomOrders, runCharacterization, smellLines, versionLines,
  type Order, type RefactorId,
} from './model';

/** The pricing rules, written independently in TypeScript from the lesson's description. */
function reference(o: Order): number {
  const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
  const discounted = (o.type === 'member' || o.coupon === 'SAVE10') && subtotal > 100;
  const net = subtotal - (discounted ? subtotal * 0.1 : 0);
  const tax = o.region === 'CA' ? net * 0.0725 : 0;
  const shipping = o.express ? 15 : net < 50 ? 5 : 0;
  return Math.round((net + tax + shipping) * 100) / 100;
}

const NONE = new Set<RefactorId>();
const key = (s: ReadonlySet<RefactorId>) => [...s].sort().join('+') || 'original';
const orders = randomOrders(2026, 500);

describe('the original', () => {
  it('passes its 12 characterization tests (hand-worked values)', () => {
    expect(runCharacterization(NONE).filter((t) => !t.passed)).toEqual([]);
    for (const t of CHARACTERIZATION) expect(reference(t.order), t.name).toBe(t.expected);
  });
  it('matches the independent reference on 500 seeded orders', () => {
    const f = compileVersion(NONE);
    for (const o of orders) expect(f(o)).toBe(reference(o));
  });
});

describe('all 64 refactor subsets', () => {
  it('are 64 distinct versions of real JS', () => {
    expect(ALL_SUBSETS).toHaveLength(64);
    expect(new Set(ALL_SUBSETS.map((s) => versionLines(s).join('\n'))).size).toBe(64);
  });
  it.each(ALL_SUBSETS.map((s) => [key(s), s] as const))('%s: 12 characterization tests green, and 500 seeded orders identical to the original', (_, s) => {
    expect(runCharacterization(s).filter((t) => !t.passed).map((t) => t.name)).toEqual([]);
    const original = compileVersion(NONE);
    const f = compileVersion(s);
    for (const o of orders) expect(f(o)).toBe(original(o));
  });
  it('end at the same clean version whatever the order (a version is keyed by the set)', () => {
    const permute = (xs: RefactorId[]): RefactorId[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const clean = versionLines(new Set(REFACTORS)).join('\n');
    for (const order of permute([...REFACTORS])) {
      const applied = new Set<RefactorId>();
      for (const r of order) applied.add(r);
      expect(versionLines(applied).join('\n')).toBe(clean);
    }
  });
});

describe('the unsafe edit', () => {
  it.each(ALL_SUBSETS.map((s) => [key(s), s] as const))('changes behaviour on at least one characterization test (%s)', (_, s) => {
    const failed = runCharacterization(s, { unsafe: true }).filter((t) => !t.passed);
    expect(failed.map((t) => t.name)).toEqual(['tax on a discounted price with sub-cent leftovers']);
    expect(failed[0]).toMatchObject({ expected: 96.53, actual: 96.54 });
  });
});

describe('smells and metrics come from the text', () => {
  it('a subset still shows exactly the smells it has not fixed, each on real lines', () => {
    for (const s of ALL_SUBSETS) {
      const lines = versionLines(s);
      const found = smellLines(s, lines);
      expect(Object.keys(found).sort()).toEqual(REFACTORS.filter((r) => !s.has(r)).sort());
      for (const at of Object.values(found)) expect(at!.length).toBeGreaterThan(0);
    }
  });
  it('the magic literal is on the tax line; the duplicate is the two discount lines', () => {
    const lines = versionLines(NONE);
    const s = smellLines(NONE, lines);
    expect(s.constant!.map((i) => lines[i].trim())).toEqual(['tax = net * 0.0725;']);
    expect(s.consolidate).toHaveLength(2);
  });
  it('hand-worked metrics for the original and the clean version', () => {
    const before = metrics(versionLines(NONE));
    // 28 lines in one function; the discount line sits inside two ifs; two `if (subtotal > 100)` and two `discount = …` lines
    expect(before).toEqual({ longestFunction: 28, maxDepth: 2, duplicatedLines: 4, lines: 28 });
    // longest is orderTotalStandard (8 lines); the only repeat is the two BeforeShipping calls
    expect(metrics(versionLines(new Set(REFACTORS)))).toEqual({ longestFunction: 8, maxDepth: 1, duplicatedLines: 2, lines: 48 });
  });
  it('the diff marks exactly the lines a refactoring changed', () => {
    const before = versionLines(NONE);
    const after = versionLines(new Set<RefactorId>(['constant']));
    const d = lineDiff(before, after);
    expect([...d.added].map((i) => after[i])).toEqual(['const CA_SALES_TAX = 0.0725;', '', '    tax = net * CA_SALES_TAX;']);
    expect([...d.removed].map((i) => before[i])).toEqual(['    tax = net * 0.0725;']);
  });
  it('tells the harness how to call each API shape', () => {
    expect(callLine(NONE)).toBe('calc2(items, type, coupon, region, express)');
    expect(callLine(new Set(REFACTORS))).toBe('express ? orderTotalExpress({ items, type, coupon, region }) : orderTotalStandard({ items, type, coupon, region })');
  });
});

describe('the merged diff', () => {
  it('keeps every new line in order and every removed old line, for every single refactoring', () => {
    for (const r of REFACTORS) {
      const before = versionLines(new Set());
      const after = versionLines(new Set([r]));
      const rows = diffRows(before, after);
      expect(rows.filter((x) => x.kind !== 'removed').map((x) => x.text)).toEqual(after);
      expect(rows.filter((x) => x.kind !== 'added').map((x) => x.text)).toEqual(before);
    }
  });
});
