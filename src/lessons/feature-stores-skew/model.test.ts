import { describe, expect, it, vi } from 'vitest';
import { aucPairs, aucTrapezoid, rocPoints } from '../../core/rocAuc';
import { DAYS, FIRST_ASOF_DAY, LAST_ASOF_DAY, ROWS_PER_USER, USERS, asOfTime, dayLabel, makeEvents, type PurchaseEvent } from './events';
import {
  NO_SOURCES, NULL_IMPUTED, SHARED, SOURCES, buildRows, divergence, explainFirst, featureValue, only, perSource, pipelines, type Source,
} from './feature';
import { LABEL_TIMES, LOG, asOf, asOfBinary, fitLogistic, join, labelledRows, measureLeak, type LogEntry } from './join';
import { parseLength } from './length';
import { mulberry32 } from '../../core/random';

// The seeded sweeps are exact but slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 120_000 });

const ev = (at: number, arrived: number): PurchaseEvent => ({ user: 0, at, arrived });

describe('the hand vector: one user, t = 10, a 7-day window', () => {
  // A (3, 3) on the window start, B (8, 8), C (9, 11) late, D (2, 2) outside the window.
  const events = [ev(3, 3), ev(8, 8), ev(9, 11), ev(2, 2)];

  it('offline (closed window, all arrivals) counts A, B, C = 3; online (half-open, arrived by t) counts B = 1; the shared definition gives 1', () => {
    const both = { ...NO_SOURCES, boundary: true, late: true };
    const { offline, online } = pipelines(both);
    expect(featureValue(events, 10, offline).orders7d).toBe(3);
    expect(featureValue(events, 10, online).orders7d).toBe(1);
    expect(featureValue(events, 10, SHARED).orders7d).toBe(1);
  });

  it('the boundary accounts for A (+1) and lateness for C (+1), each on its own', () => {
    expect(featureValue(events, 10, pipelines(only('boundary')).offline).orders7d).toBe(2);
    expect(featureValue(events, 10, pipelines(only('late')).offline).orders7d).toBe(2);
    expect(featureValue(events, 10, pipelines(only('boundary')).online).orders7d).toBe(1);
  });

  it('day boundary: events at day 4 20:00 UTC and day 5 02:00 UTC, as of day 5 03:00 UTC: 1 offline (UTC day) and 2 online (local day, UTC minus 5 hours)', () => {
    const day = [ev(4 + 20 / 24, 4 + 20 / 24), ev(5 + 2 / 24, 5 + 2 / 24)];
    const asOfTime3 = 5 + 3 / 24;
    const { offline, online } = pipelines(only('day'));
    expect(featureValue(day, asOfTime3, offline).ordersToday).toBe(1);
    expect(featureValue(day, asOfTime3, online).ordersToday).toBe(2);
  });

  it('null handling: a user with no events is 0 offline and null (imputed -1) online, so the rows differ', () => {
    const table = makeEvents(4);
    const silent = table.byUser.findIndex((e) => e.length === 0);
    expect(silent).toBeGreaterThanOrEqual(0);
    const rows = buildRows(table, only('null'), false).filter((r) => r.user === silent);
    expect(rows).toHaveLength(ROWS_PER_USER);
    for (const r of rows) {
      expect(r.offline.orders7d).toBe(0);
      expect(r.online.orders7d).toBe(NULL_IMPUTED);
      expect(r.differs).toBe(true);
    }
  });

  it('dayLabel prints times as the page shows them', () => {
    expect(dayLabel(4 + 20 / 24)).toBe('day 4 20:00');
    expect(dayLabel(0.5)).toBe('day 0 12:00');
    expect(dayLabel(20 + 18.5 / 24)).toBe('day 20 18:30');
  });
});

/** An independent brute-force count of the shared definition: no spec object, just the inequalities written out. */
function bruteShared(events: readonly PurchaseEvent[], t: number, w: number): { week: number; today: number } {
  let week = 0;
  let today = 0;
  for (const e of events) {
    const arrivedByNow = e.arrived <= t;
    if (arrivedByNow && e.at > t - w && e.at <= t) week += 1;
    if (arrivedByNow && e.at >= Math.floor(t) && e.at <= t) today += 1;
  }
  return { week, today };
}

describe('feature computation', () => {
  it('featureValue under the shared definition equals a brute-force scan for 200 seeded tables, every user and as-of time', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const table = makeEvents(seed, 6);
      for (let u = 0; u < table.users; u += 1) {
        for (let day = FIRST_ASOF_DAY; day <= LAST_ASOF_DAY; day += 3) {
          const t = asOfTime(day);
          const fast = featureValue(table.byUser[u], t, SHARED);
          const slow = bruteShared(table.byUser[u], t, 7);
          expect([fast.orders7d, fast.ordersToday], `seed ${seed} user ${u} day ${day}`).toEqual([slow.week, slow.today]);
        }
      }
    }
  });

  it('the default table has 40 users x 23 as-of times = 920 rows, and the stream is seeded', () => {
    const table = makeEvents(4);
    expect(table.users).toBe(USERS);
    expect(ROWS_PER_USER).toBe(23);
    expect(buildRows(table, NO_SOURCES, false)).toHaveLength(920);
    expect(makeEvents(4).events).toEqual(table.events);
    expect(makeEvents(5).events.length).not.toBe(table.events.length);
    for (const e of table.events) {
      expect(e.at * 24 % 1).toBe(0);
      expect(e.arrived).toBeGreaterThanOrEqual(e.at);
      expect(e.at).toBeLessThan(DAYS);
    }
  });

  it('with every skew source off the pipelines agree on all 920 rows, and so do the shared definition and all-off for every seed', () => {
    const table = makeEvents(4);
    expect(divergence(buildRows(table, NO_SOURCES, false)).count).toBe(0);
    const allOn = { boundary: true, late: true, day: true, null: true };
    expect(divergence(buildRows(table, allOn, true)).count).toBe(0);
  });

  it('the shared definition gives zero divergence on 200 seeded datasets, all 920 rows each, with every source switched on', () => {
    const allOn = { boundary: true, late: true, day: true, null: true };
    for (let seed = 1; seed <= 200; seed += 1) {
      const rows = buildRows(makeEvents(seed), allOn, true);
      expect(rows).toHaveLength(920);
      expect(divergence(rows).count, `seed ${seed}`).toBe(0);
    }
  });

  it('each skew source diverges on every one of 200 seeded datasets, by between 0.1% and 40% of rows: no source is a no-op and none is everywhere', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const f of perSource(makeEvents(seed))) {
        expect(f.share, `seed ${seed} ${f.source}`).toBeGreaterThanOrEqual(0.001);
        expect(f.share, `seed ${seed} ${f.source}`).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('pinned counterexamples on seed 4: each source alone makes 8, 10, 46 and 115 rows differ, and the first diverging row of each is this object', () => {
    const table = makeEvents(4);
    const counts = Object.fromEntries(perSource(table).map((f) => [f.source, f.count]));
    expect(counts).toEqual({ boundary: 8, late: 10, day: 46, null: 115 });
    const first = (s: Source) => buildRows(table, only(s), false).find((r) => r.differs);
    expect(first('boundary')).toMatchObject({ user: 0, day: 7, offline: { orders7d: 2 }, online: { orders7d: 1 } });
    expect(first('late')).toMatchObject({ user: 6, day: 20, offline: { orders7d: 4 }, online: { orders7d: 3 } });
    expect(first('day')).toMatchObject({ user: 0, day: 29, offline: { ordersToday: 1 }, online: { ordersToday: 0 } });
    expect(first('null')).toMatchObject({ user: 1, day: 7, offline: { orders7d: 0 }, online: { orders7d: -1 } });
  });

  it('the pinned boundary row is an event exactly on the window start; the late row has an event that arrived after the as-of time', () => {
    const table = makeEvents(4);
    expect(table.byUser[0].some((e) => e.at === asOfTime(7) - 7)).toBe(true);
    expect(asOfTime(7) - 7).toBe(0.5);
    const late = table.byUser[6].find((e) => e.arrived > asOfTime(20) && e.at <= asOfTime(20) && e.at > asOfTime(20) - 7);
    expect(late).toBeDefined();
  });

  it('turning a source off restores the row\'s agreement, and all-off gives the same zero as the shared mode', () => {
    const table = makeEvents(4);
    for (const s of SOURCES) {
      const row = buildRows(table, only(s), false).find((r) => r.differs);
      expect(row, s).toBeDefined();
      const restored = buildRows(table, NO_SOURCES, false).find((r) => r.user === row?.user && r.day === row?.day);
      expect(restored?.differs).toBe(false);
    }
    expect(divergence(buildRows(table, NO_SOURCES, false)).count).toBe(divergence(buildRows(table, only('day'), true)).count);
  });

  it('the explanation names the cause of the first diverging row, from the rows themselves', () => {
    const table = makeEvents(4);
    for (const s of SOURCES) {
      const rows = buildRows(table, only(s), false);
      const x = explainFirst(table, rows, only(s));
      expect(x?.causes.map((c) => c.source), s).toEqual([s]);
    }
    expect(explainFirst(table, buildRows(table, NO_SOURCES, false), NO_SOURCES)).toBeNull();
    const boundary = explainFirst(table, buildRows(table, only('boundary'), false), only('boundary'));
    expect(boundary?.causes[0].text).toContain('day 0 12:00 sits exactly on the window start');
  });

  it('extremes: 1 and 40 users, 0% and 100% late events, windows of 1 and 30 days', () => {
    for (const users of [1, 40]) for (const late of [0, 1]) for (const w of [1, 30]) {
      const table = makeEvents(2, users, late);
      const rows = buildRows(table, { boundary: true, late: true, day: true, null: true }, false, w);
      expect(rows).toHaveLength(users * ROWS_PER_USER);
      expect(rows.every((r) => Number.isFinite(r.offline.orders7d) && Number.isFinite(r.online.orders7d))).toBe(true);
      expect(divergence(buildRows(table, NO_SOURCES, false, w)).count).toBe(0);
      if (late === 1) {
        const lateEvents = table.events.filter((e) => e.arrived > e.at);
        expect(lateEvents.length).toBe(table.events.length);
      } else {
        expect(table.events.every((e) => e.arrived === e.at)).toBe(true);
      }
    }
    expect(divergence([])).toEqual({ count: 0, share: 0 });
    expect(parseLength('31', 'window days', 1, 30).ok).toBe(false);
    expect(parseLength('0', 'window days', 1, 30).ok).toBe(false);
    expect(parseLength('41', 'users', 1, 40).ok).toBe(false);
    expect(parseLength('30', 'window days', 1, 30).ok).toBe(true);
  });

  it('a user with no events and an empty log are handled without NaN', () => {
    expect(featureValue([], 10, SHARED)).toEqual({ orders7d: 0, ordersToday: 0 });
    expect(asOf([], 5)).toBeNull();
    expect(asOfBinary([], 5)).toBeNull();
  });
});

describe('the point-in-time join', () => {
  it('the three joins on the log (10 -> 2, 20 -> 5, 30 -> 9) and labels 15, 25, 35', () => {
    const values = (k: 'point-in-time' | 'latest' | 'next') => join(LOG, LABEL_TIMES, k).map((r) => r.entry?.value ?? null);
    expect(values('point-in-time')).toEqual([2, 5, 9]);
    expect(values('latest')).toEqual([9, 9, 9]);
    expect(values('next')).toEqual([5, 9, null]);
  });

  it('asOf equals a binary search for 1,000 seeded logs and times, and never returns an entry after the time', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 1000; i += 1) {
      const n = Math.floor(rnd() * 8);
      const times = Array.from({ length: n }, () => Math.floor(rnd() * 50)).sort((a, b) => a - b);
      const log: LogEntry[] = times.map((at) => ({ at, value: Math.floor(rnd() * 100) }));
      const t = Math.floor(rnd() * 60);
      const linear = asOf(log, t);
      expect(asOfBinary(log, t)?.at ?? null).toBe(linear?.at ?? null);
      if (linear) expect(linear.at).toBeLessThanOrEqual(t);
      const later = log.filter((e) => e.at <= t);
      expect(linear?.at ?? null).toBe(later.length ? Math.max(...later.map((e) => e.at)) : null);
    }
  });

  it('a leaky join returns a value stamped after the label time on every row where one exists: that is the definition of the leak', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 300; i += 1) {
      const log: LogEntry[] = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => ({ at: k * 10 + 10, value: k }));
      const labels = Array.from({ length: 5 }, () => Math.floor(rnd() * 80));
      for (const row of join(log, labels, 'next')) {
        const exists = log.some((e) => e.at > row.label);
        expect(row.leaks).toBe(exists);
        if (exists) expect(row.entry?.at).toBeGreaterThan(row.label);
      }
      for (const row of join(log, labels, 'point-in-time')) expect(row.leaks).toBe(false);
      for (const row of join(log, labels, 'latest')) expect(row.leaks).toBe(log[log.length - 1].at > row.label);
    }
  });
});

describe('the measured leak', () => {
  it('leaky-join offline AUC exceeds the correct join\'s on every one of 200 seeded datasets, and the online AUC equals the honest feature\'s', () => {
    let greater = 0;
    let smallestGap = Infinity;
    for (let seed = 1; seed <= 200; seed += 1) {
      const r = measureLeak(makeEvents(seed));
      expect(r.leakyOffline, `seed ${seed}`).not.toBeNull();
      if ((r.leakyOffline as number) > (r.correctOffline as number)) greater += 1;
      smallestGap = Math.min(smallestGap, (r.leakyOffline as number) - (r.correctOffline as number));
      expect(r.online as number).toBeCloseTo(r.honestFeature as number, 12);
    }
    // Measured: 200 of 200, smallest gap about 0.13. The page says "on these datasets".
    expect(greater).toBe(200);
    expect(smallestGap).toBeGreaterThan(0.1);
  }, 60_000);

  it('the seed-4 numbers of the page: 640 rows, 460 positive, AUC 0.927, 0.736 and 0.736', () => {
    const r = measureLeak(makeEvents(4));
    expect([r.rows, r.positives]).toEqual([640, 460]);
    expect(r.leakyOffline as number).toBeCloseTo(0.927, 3);
    expect(r.correctOffline as number).toBeCloseTo(0.736, 3);
    expect(r.online as number).toBeCloseTo(0.736, 3);
  });

  it('the pair-counting AUC and the trapezoid AUC agree on the same scores, and the logistic fit\'s loss does not rise', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rows = labelledRows(makeEvents(seed));
      for (const pick of [(r: (typeof rows)[number]) => r.honest, (r: (typeof rows)[number]) => r.leaky]) {
        const fit = fitLogistic(rows.map(pick), rows.map((r) => r.label));
        for (let k = 1; k < fit.losses.length; k += 1) expect(fit.losses[k], `seed ${seed} step ${k}`).toBeLessThanOrEqual(fit.losses[k - 1] + 1e-12);
        const scored = rows.map((r) => ({ score: pick(r), label: r.label }));
        expect(aucTrapezoid(rocPoints(scored))).toBeCloseTo(aucPairs(scored), 12);
      }
    }
  });

  it('the leaky feature contains the label window, so every positive row has leaky >= 1', () => {
    const rows = labelledRows(makeEvents(4));
    for (const r of rows) if (r.label === 1) expect(r.leaky).toBeGreaterThanOrEqual(1);
  });

  it('one user: AUC is undefined when a class is empty, and the result says so instead of NaN', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const r = measureLeak(makeEvents(seed, 1));
      for (const v of [r.leakyOffline, r.correctOffline, r.online]) expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
