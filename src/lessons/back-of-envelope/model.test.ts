import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../core/latencyLadder';
import {
  GUESS_EXPONENTS, NIC_BYTES_PER_SECOND, PATH_DEFAULT, PATH_STEPS, SCENARIOS, SHORTCUT_ERROR, add, bandwidth, bigText, dimsText, div, mul,
  orderError, parseCpuMs, parseDau, parsePeak, parseRecord, parseWrites, pathBudget, quantity, scenarioQps, servers, stepMs, storage, traffic, withinTenfold,
  type PathStep,
} from './model';

describe('hand-worked vectors', () => {
  it('100,000,000 DAU × 10 ÷ 86,400 = 11,574.07 /s on average and 34,722 /s at a peak factor of 3', () => {
    const t = traffic({ dau: 100_000_000, actionsPerUser: 10, peakFactor: 3, readsPerWrite: 10, round: false });
    expect(t.average.value).toBeCloseTo(11_574.074, 3);
    expect(t.peak.value).toBeCloseTo(34_722.222, 3);
    expect(dimsText(t.average.dims)).toBe('req/s');
    expect(t.reads.value + t.writes.value).toBeCloseTo(t.peak.value, 6);
    expect(t.writes.value / t.reads.value).toBeCloseTo(0.1, 12);
  });

  it('the round shortcut (100,000 s/day) is 15.7% too low a divisor: it overstates the rate by 15.7%', () => {
    const exact = traffic({ dau: 1e8, actionsPerUser: 10, peakFactor: 1, readsPerWrite: 1, round: false }).average.value;
    const round = traffic({ dau: 1e8, actionsPerUser: 10, peakFactor: 1, readsPerWrite: 1, round: true }).average.value;
    expect(round).toBeCloseTo(10_000, 9);
    expect(exact / round - 1).toBeCloseTo(0.1574, 3);
    expect(SHORTCUT_ERROR).toBeCloseTo(0.1574, 3);
    expect(round / exact - 1).toBeCloseTo(-0.136, 3);
  });

  it('1,000,000 writes/day × 1,000 B × 365 days × 3 replicas = 1.095 × 10¹² B: 1.095 TB, 0.996 TiB', () => {
    const base = { recordBytes: 1000, writesPerDay: 1_000_000, retentionDays: 365, replicas: 3, overhead: 1 };
    const dec = storage({ ...base, binary: false });
    const bin = storage({ ...base, binary: true });
    expect(dec.total.value).toBe(1.095e12);
    expect(dimsText(dec.total.dims)).toBe('B');
    expect(dec.inUnit).toBeCloseTo(1.095, 12);
    expect(bin.inUnit).toBeCloseTo(0.996, 3);
    expect(dec.unitGap).toBeCloseTo(1.0995, 4);
  });

  it('50,000 /s peak, 8 cores × 1,000 ms ÷ 5 ms = 1,600 /s, × 0.6 = 960 /s, 53 servers, 54 with N+1', () => {
    const base = { peak: 50_000, cores: 8, cpuMs: 5, target: 0.6 };
    const s = servers({ ...base, redundancy: 'none' });
    expect([s.perServerAtFull, s.perServerAtTarget, s.base, s.total]).toEqual([1600, 960, 53, 53]);
    expect(servers({ ...base, redundancy: 'n+1' }).total).toBe(54);
    expect(servers({ ...base, redundancy: 'zones' }).total).toBe(80);
  });

  it('10 Gbit/s is 1.25 GB/s, not 10 GB/s: bits ÷ 8', () => {
    expect(NIC_BYTES_PER_SECOND).toBe(1.25e9);
    const b = bandwidth(2000, 100_000);
    expect(b.bytesPerSecond.value).toBe(2e8);
    expect(dimsText(b.bytesPerSecond.dims)).toBe('B/s');
    expect(b.bitsPerSecond.value).toBe(1.6e9);
    expect(dimsText(b.bitsPerSecond.dims)).toBe('bit/s');
    expect(b.megabitsPerSecond).toBe(1600);
    expect(b.nicShare).toBeCloseTo(0.16, 12);
    expect(b.bytesPerSecond.value / NIC_BYTES_PER_SECOND).toBeCloseTo(b.nicShare, 12);
  });

});

describe('the unit algebra', () => {
  it('multiplying and dividing cancels units, and the result dimension is asserted for each scene', () => {
    const users = quantity(1000, { user: 1, day: -1 });
    const perUser = quantity(10, { req: 1, user: -1 });
    expect(dimsText(mul(users, perUser).dims)).toBe('req/day');
    expect(dimsText(div(mul(users, perUser), quantity(86_400, { s: 1, day: -1 })).dims)).toBe('req/s');
    expect(dimsText(mul(quantity(2, { B: 1 }), quantity(3, { B: -1 })).dims)).toBe('a plain number');
  });

  it('adding bytes to bits throws, and adding like to like works', () => {
    expect(() => add(quantity(1, { B: 1 }), quantity(1, { bit: 1 }))).toThrow(TypeError);
    expect(() => add(quantity(1, { B: 1 }), quantity(1))).toThrow(/can't add/);
    expect(add(quantity(1, { B: 1 }), quantity(2, { B: 1 })).value).toBe(3);
    expect(() => add(quantity(1, { 'req': 1, s: -1 }), quantity(1, { B: 1, s: -1 }))).toThrow();
  });

  it('dividing by zero throws instead of returning Infinity', () => {
    expect(() => div(quantity(1), quantity(0))).toThrow(RangeError);
  });

  it('2⁴⁰ ÷ 10¹² = 1.0995: a TiB is about 10% more than a TB', () => {
    expect(2 ** 40 / 10 ** 12).toBeCloseTo(1.0995, 4);
  });
});

describe('the latency ladder and the guess', () => {
  it('step times come from the shared ladder, never a local copy', () => {
    for (const id of PATH_STEPS) expect(stepMs(id)).toBe(LEVELS.find((l) => l.id === id)!.ns / 1e6);
    expect(stepMs('dc')).toBe(0.5);
    expect(stepMs('wan')).toBe(150);
  });

  it('a path totals its parts and is inside the 200 ms budget exactly when the total is at most 200', () => {
    const r = pathBudget(PATH_DEFAULT);
    expect(r.totalMs).toBeCloseTo(100 * 1e-6 + 50 * 1e-4 + 2 * 0.05 + 20 * 0.5, 9);
    expect(r.inBudget).toBe(true);
    const over = pathBudget({ ...PATH_DEFAULT, wan: 2 } as Record<PathStep, number>);
    expect(over.totalMs).toBeCloseTo(r.totalMs + 300, 9);
    expect(over.inBudget).toBe(false);
    expect(pathBudget({ l1: 0, ram: 0, nvme: 0, dc: 0, wan: 1 }, 150).inBudget).toBe(true);
  });

  it('the guess error is in orders of magnitude and "within 10×" means under one order', () => {
    const chat = scenarioQps(SCENARIOS[0]);
    expect(chat).toBeCloseTo(11_574.07, 1);
    expect(orderError(4, chat)).toBeCloseTo(4 - Math.log10((1e8 * 10) / 86_400), 9);
    expect(withinTenfold(4, chat)).toBe(true);
    expect(withinTenfold(5, chat)).toBe(true);
    expect(withinTenfold(7, chat)).toBe(false);
    expect(withinTenfold(2, chat)).toBe(false);
    expect(GUESS_EXPONENTS).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('every scenario has a computable answer with the units it claims', () => {
    for (const s of SCENARIOS) expect(Number.isFinite(scenarioQps(s))).toBe(true);
    expect(scenarioQps(SCENARIOS[2])).toBeCloseTo((5000 * 40) / 86_400, 9);
  });
});

describe('hostile input', () => {
  it('big counts read with commas or underscores, and refuse 5k, 1e6, zero, negatives, decimals and over 1e12', () => {
    expect(parseDau('1,000,000')).toEqual({ ok: true, value: 1_000_000 });
    expect(parseDau('1_000_000')).toEqual({ ok: true, value: 1_000_000 });
    expect(parseDau('1000000000000')).toEqual({ ok: true, value: 1e12 });
    for (const bad of ['5k', '1e6', '0', '-5', '1.5', '1000000000001', '', 'abc', '1,00']) {
      const r = parseDau(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
    const k = parseDau('5k');
    if (!k.ok) expect(k.error).toContain('type the digits');
    for (const fn of [parseWrites, parsePeak, parseRecord]) expect(fn('0').ok).toBe(false);
  });

  it('zero or negative CPU milliseconds are refused (they would divide by zero)', () => {
    for (const bad of ['0', '0.0', '-1', '', 'x', '1e3']) expect(parseCpuMs(bad).ok, JSON.stringify(bad)).toBe(false);
    expect(parseCpuMs('0.5')).toEqual({ ok: true, value: 0.5 });
  });

  it('results above 10²¹ print as powers of ten, smaller ones with grouped digits', () => {
    expect(bigText(1.5e22)).toBe('1.50 × 10²²');
    expect(bigText(11_574.074)).toBe('11,574');
    expect(bigText(69.444)).toBe('69.44');
    expect(bigText(0.996)).toBe('0.996');
    expect(bigText(Infinity)).toBe('∞');
  });
});
