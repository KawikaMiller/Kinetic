import { describe, expect, it } from 'vitest';
import { decodeSnowflake } from './formats';
import { BURST_LIMIT, CLOCK_RUN, runBurst, runClock, runMachines } from './limits';
import { formatCount, formatProbability, idsForOdds, probabilityOf, RANDOM_BITS } from './odds';
import { sortRows, TRADEOFFS, type SortKey } from './tradeoffs';

describe('a burst on one machine', () => {
  it('fits 4,096 IDs in a millisecond and waits for the next for the rest', () => {
    const run = runBurst(5000);
    expect(BURST_LIMIT).toBe(4096);
    expect(run.perMs.map((p) => p.count)).toEqual([4096, 904]);
    expect(run.perMs[0]).toMatchObject({ firstSequence: 0, lastSequence: 4095 });
    expect(run.perMs[1]).toMatchObject({ firstSequence: 0, lastSequence: 903 });
    expect(run.perMs[1].time).toBe(run.perMs[0].time + 1);
    expect(run.waits).toBe(1);
    expect(run.unique).toBe(5000);
  });
  it('waits exactly ceil(n / 4096) - 1 times, never puts more than 4,096 in a millisecond, and never repeats an ID', () => {
    for (const n of [1, 100, 4095, 4096, 4097, 8192, 8193, 12_345]) {
      const run = runBurst(n);
      expect(run.waits, `${n}`).toBe(Math.ceil(n / 4096) - 1);
      expect(run.perMs.every((p) => p.count <= 4096)).toBe(true);
      expect(run.perMs.reduce((s, p) => s + p.count, 0)).toBe(n);
      expect(run.unique).toBe(n);
    }
  });
});

describe('the clock going backwards', () => {
  it('ignoring it repeats exactly the IDs of the milliseconds it replays', () => {
    const run = runClock(CLOCK_RUN, 3, 'ignore');
    expect(run.filter((a) => a.event === 'clock-back-ignored')).toHaveLength(1);
    const duplicates = run.filter((a) => a.duplicate);
    // the clock stepped back from 104 to 102: ms 102 (2 ids), 103 (2) and 104 (2) are issued a second time
    expect(duplicates).toHaveLength(6);
    for (const d of duplicates) expect(decodeSnowflake(d.id!)).toMatchObject({ machine: 3 });
    expect(duplicates.map((d) => decodeSnowflake(d.id!).time)).toEqual([102, 102, 103, 103, 104, 104].map((t) => t));
  });
  it('refusing it or waiting it out gives no duplicates, and says what it needs', () => {
    for (const policy of ['refuse', 'wait'] as const) {
      const run = runClock(CLOCK_RUN, 3, policy);
      expect(run.some((a) => a.duplicate)).toBe(false);
      const stopped = run.filter((a) => a.id === null);
      expect(stopped).toHaveLength(4);
      for (const s of stopped) {
        expect(s.until).toBe(104);
        expect(s.clock).toBeLessThan(104);
        expect(s.event).toBe(policy === 'refuse' ? 'clock-back-refused' : 'clock-back-wait');
      }
    }
  });
  it('with a clock that never goes back, every policy issues every ID and none repeats', () => {
    for (const policy of ['refuse', 'wait', 'ignore'] as const) {
      const run = runClock([100, 100, 101, 102, 102, 102, 103], 1, policy);
      expect(run.every((a) => a.id !== null && !a.duplicate)).toBe(true);
    }
  });
});

describe('two machines with the same id', () => {
  it('repeat each other\'s IDs, three a millisecond, and different ids never do', () => {
    const same = runMachines(7, 7, 6);
    expect(same).toHaveLength(36);
    expect(same.filter((a) => a.duplicate)).toHaveLength(18);
    const different = runMachines(7, 8, 6);
    expect(different.filter((a) => a.duplicate)).toHaveLength(0);
  });
  it('the two ids differ only in the machine field', () => {
    const run = runMachines(7, 8, 1);
    const a = decodeSnowflake(run[0].id!);
    const b = decodeSnowflake(run[1].id!);
    expect({ ...a, machine: 0 }).toEqual({ ...b, machine: 0 });
    expect([a.machine, b.machine]).toEqual([7, 8]);
  });
});

describe('collision odds', () => {
  it('two random 122-bit picks collide with chance 2^-122, not zero', () => {
    expect(probabilityOf(2, 122)).toBeCloseTo(2 ** -122, 50);
    expect(probabilityOf(2, 122)).toBeGreaterThan(0);
  });
  it('a 32-bit random ID has even odds of a collision at about 77,000 IDs', () => {
    const n = idsForOdds(32, 0.5);
    expect(n).toBeGreaterThan(75_000);
    expect(n).toBeLessThan(80_000);
    expect(probabilityOf(Math.round(n), 32)).toBeGreaterThan(0.49);
    expect(probabilityOf(Math.round(n), 32)).toBeLessThan(0.51);
  });
  it('the approximation matches the exact product at every size, for 1%, 50% and 99%', () => {
    for (const bits of [32, 64, 122]) for (const p of [0.01, 0.5, 0.99]) {
      const n = idsForOdds(bits, p);
      expect(probabilityOf(n, bits) / p, `${bits} bits at ${p}`).toBeGreaterThan(0.99);
      expect(probabilityOf(n, bits) / p).toBeLessThan(1.01);
    }
  });
  it('a billion UUIDv4s have a chance of about 9.4 x 10^-20 of any repeat; ten billion 32-bit IDs are certain to', () => {
    expect(probabilityOf(1e9, 122)).toBeGreaterThan(9e-20);
    expect(probabilityOf(1e9, 122)).toBeLessThan(1e-19);
    expect(probabilityOf(1e10, 32)).toBe(1);
  });
  it('more IDs never lower the odds, and more bits never raise them', () => {
    for (const { bits } of RANDOM_BITS) {
      let last = 0;
      for (let k = 1; k <= 14; k++) {
        const p = probabilityOf(10 ** k, bits);
        expect(p).toBeGreaterThanOrEqual(last);
        last = p;
      }
    }
    for (let k = 3; k <= 12; k++) {
      expect(probabilityOf(10 ** k, 32)).toBeGreaterThanOrEqual(probabilityOf(10 ** k, 64));
      expect(probabilityOf(10 ** k, 64)).toBeGreaterThanOrEqual(probabilityOf(10 ** k, 122));
    }
  });
  it('formats probabilities and counts the way they are said aloud', () => {
    expect(formatProbability(0)).toBe('0');
    expect(formatProbability(1)).toBe('100%');
    expect(formatProbability(0.5)).toBe('50%');
    expect(formatProbability(0.0123)).toBe('1.23%');
    expect(formatProbability(9.4e-20)).toBe('9.4 × 10⁻²⁰');
    expect(formatCount(77_000)).toBe('77 thousand');
    expect(formatCount(5.1e9)).toBe('5.1 billion');
    expect(formatCount(2.7e18)).toBe('2.7 × 10¹⁸');
  });
});

describe('the trade-offs table', () => {
  const key = (k: SortKey, i: number) => TRADEOFFS[i][k as keyof (typeof TRADEOFFS)[number]];
  it('has the five formats with the sizes the layouts say', () => {
    expect(TRADEOFFS.map((r) => [r.id, r.size])).toEqual([['autoincrement', 64], ['uuidv4', 128], ['uuidv7', 128], ['ulid', 128], ['snowflake', 64]]);
    expect(TRADEOFFS.find((r) => r.id === 'uuidv4')).toMatchObject({ sortable: false, leaks: false, locality: 'scatters' });
    expect(TRADEOFFS.filter((r) => r.locality === 'scatters')).toHaveLength(1);
    expect(key('format', 0)).toBe('Auto-increment');
  });
  it('sorts by every column in both directions, keeping table order for ties', () => {
    const keys: SortKey[] = ['format', 'size', 'sortable', 'leaks', 'coordination', 'locality'];
    for (const k of keys) for (const asc of [true, false]) {
      const rows = sortRows(TRADEOFFS, k, asc);
      expect(rows).toHaveLength(5);
      expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    }
    expect(sortRows(TRADEOFFS, 'size', true).map((r) => r.id)).toEqual(['autoincrement', 'snowflake', 'uuidv4', 'uuidv7', 'ulid']);
    expect(sortRows(TRADEOFFS, 'size', false).map((r) => r.id)).toEqual(['uuidv4', 'uuidv7', 'ulid', 'autoincrement', 'snowflake']);
    expect(sortRows(TRADEOFFS, 'format', true).map((r) => r.format)).toEqual(['Auto-increment', 'Snowflake-style', 'UUIDv4', 'UUIDv7', 'ULID'].sort((a, b) => a.localeCompare(b)));
    expect(sortRows(TRADEOFFS, 'coordination', false).map((r) => r.id)[0]).toBe('autoincrement');
    expect(sortRows(TRADEOFFS, 'coordination', true).map((r) => r.id).at(-1)).toBe('autoincrement');
    expect(sortRows(TRADEOFFS, 'sortable', true)[0].id).toBe('uuidv4');
  });
});
