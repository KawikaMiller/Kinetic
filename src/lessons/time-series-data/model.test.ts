import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { decode, dodWindow, encode, bitsPerPoint, ratioAgainstRaw, type Point } from './gorilla';
import { DEFAULT_LABELS, DEFAULT_POLICY, USER_IDS, bytesPerDay, seriesCount, spikeAfter, spikeShown, spikeVisible, storage, tierCovering, WINDOWS } from './retention';
import {
  BASELINE, DEFAULT_NOISE, DEFAULT_SEED, DEFAULT_SPIKE, HOUR, MINUTE, POINTS_PER_DAY, SERIES_START, SPIKE_POINTS, SPIKE_START, averageOfAverages, buildSeries, decimate, exactAverage,
  patternSeries, rollup, rollupBuckets, valueOf, withGap, type TimestampPattern, type ValuePattern,
} from './series';

const SEEDS = 200;
const seeds = Array.from({ length: SEEDS }, (_, i) => i);
const series = (seed = DEFAULT_SEED, noise = DEFAULT_NOISE, spike = DEFAULT_SPIKE) => buildSeries({ seed, noise, spike });
const same = (a: readonly Point[], b: readonly Point[]) => a.length === b.length && a.every((p, i) => p.t === b[i].t && Object.is(p.v, b[i].v));

describe('the series', () => {
  it('has 8,640 points 10 s apart, is seeded, and holds a two-minute spike', () => {
    const s = series();
    expect(s).toHaveLength(8640);
    expect(s[1].t - s[0].t).toBe(10);
    expect(same(s, series())).toBe(true);
    expect(same(s, series(8))).toBe(false);
    const quiet = buildSeries({ seed: 7, noise: 0, spike: 0 });
    const spiky = buildSeries({ seed: 7, noise: 0, spike: 4.5 });
    const raised = spiky.map((_, i) => i).filter((i) => Math.abs(spiky[i].v - quiet[i].v) > 0.001);
    expect(raised).toHaveLength(SPIKE_POINTS);
    expect(raised[0]).toBe(SPIKE_START);
    expect(SPIKE_POINTS * 10).toBe(120);
  });
  it('decimating to a number of columns keeps the largest value of each, so the spike survives drawing', () => {
    const s = series();
    const d = decimate(s, 340);
    expect(d.length).toBeLessThanOrEqual(340);
    expect(Math.max(...d.map((p) => p.y))).toBe(Math.max(...s.map((p) => p.v)));
  });
});

describe('Gorilla-style encoding', () => {
  const patterns: [TimestampPattern, ValuePattern][] = [];
  for (const t of ['regular', 'jittery', 'gap'] as const) for (const v of ['constant', 'drifting', 'noisy'] as const) patterns.push([t, v]);

  it('decode(encode(series)) reproduces every timestamp and every value bit for bit, over 1,000 seeded series', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const rnd = mulberry32(seed);
      const n = randInt(2, 60, rnd);
      let t = 1_700_000_000 + randInt(0, 1_000_000, rnd);
      let v = 0;
      const mode = seed % 6;
      const pts: Point[] = Array.from({ length: n }, (_, i) => {
        if (i === 1) t += randInt(1, 3000, rnd);
        else if (i > 1) t += [10, 10, randInt(0, 4000, rnd), randInt(1, 20, rnd), 70_000, 10][mode === 3 ? randInt(0, 5, rnd) : mode] ?? 10;
        const pick = randInt(0, 5, rnd);
        v = pick === 0 ? v : pick === 1 ? 0 : pick === 2 ? -0 : pick === 3 ? (rnd() - 0.5) * 1e6 : pick === 4 ? Math.round(rnd() * 100) / 4 : 1e-300 * rnd();
        return { t, v };
      });
      const e = encode(pts);
      expect(same(decode(e.bits, n), pts), `seed ${seed}`).toBe(true);
      expect(e.bits.length).toBe(e.perPoint.reduce((a, b) => a + b, 0));
    }
  });

  it('round-trips repeated values, negative zero, a series with a gap larger than the largest window, and the demo patterns', () => {
    const pts: Point[] = [{ t: 100, v: 0 }, { t: 110, v: -0 }, { t: 120, v: -0 }, { t: 130, v: 5 }, { t: 140, v: 5 }, { t: 100_000, v: -7.25 }, { t: 100_010, v: 1e-9 }];
    expect(same(decode(encode(pts).bits, pts.length), pts)).toBe(true);
    for (const [t, v] of patterns) {
      const s = patternSeries(t, v);
      expect(same(decode(encode(s).bits, s.length), s), `${t} ${v}`).toBe(true);
    }
    const day = series();
    expect(same(decode(encode(day).bits, day.length), day)).toBe(true);
  });

  it('hand-worked: the control windows for delta of delta are 0, +-64, +-256, +-2048 and the rest', () => {
    expect(dodWindow(0)).toEqual({ prefix: '0', width: 0, offset: 0 });
    expect(dodWindow(64).prefix).toBe('10');
    expect(dodWindow(-63).prefix).toBe('10');
    expect(dodWindow(65).prefix).toBe('110');
    expect(dodWindow(-64).prefix).toBe('110');
    expect(dodWindow(256).prefix).toBe('110');
    expect(dodWindow(257).prefix).toBe('1110');
    expect(dodWindow(2048).prefix).toBe('1110');
    expect(dodWindow(-2047).prefix).toBe('1110');
    expect(dodWindow(2049).prefix).toBe('1111');
    expect(dodWindow(-2048).prefix).toBe('1111');
  });

  it('hand-worked bits: a regular series costs 64 + 64 for the first point, 14 + the value for the second, then 1 bit of timestamp each', () => {
    const pts: Point[] = Array.from({ length: 6 }, (_, i) => ({ t: 1000 + i * 10, v: 3 }));
    const e = encode(pts);
    expect(e.segments[0].map((s) => s.bits.length)).toEqual([64, 64]);
    expect(e.segments[1].map((s) => s.bits.length)).toEqual([14, 1]);
    for (let i = 2; i < 6; i++) expect(e.segments[i].map((s) => s.bits)).toEqual([['0'], ['0']].map((x) => x[0]));
    expect(e.perPoint).toEqual([128, 15, 2, 2, 2, 2]);
    // the second delta of delta below: 10 -> 13 is D = 3, '10' + 7 bits = 9
    const jump = encode([{ t: 0, v: 1 }, { t: 10, v: 1 }, { t: 23, v: 1 }]);
    expect(jump.segments[2][0].bits).toBe('10' + (3 + 63).toString(2).padStart(7, '0'));
  });

  it('a perfectly regular series is 1 bit of timestamp per point after the first two, and a constant value 1 bit per point after the first', () => {
    const e = encode(patternSeries('regular', 'constant'));
    for (let i = 2; i < e.segments.length; i++) {
      expect(e.segments[i][0].bits).toBe('0');
      expect(e.segments[i][1].bits).toBe('0');
    }
    expect(e.segments[1][1].bits).toBe('0');
    expect(bitsPerPoint(e)).toBeLessThan(2.6);
    expect(ratioAgainstRaw(e)).toBeGreaterThan(40);
  });

  it('noisy floats cost far more than a constant, and jitter costs more than regular timestamps', () => {
    const cost = (t: TimestampPattern, v: ValuePattern) => bitsPerPoint(encode(patternSeries(t, v)));
    expect(cost('regular', 'noisy')).toBeGreaterThan(5 * cost('regular', 'constant'));
    expect(cost('jittery', 'constant')).toBeGreaterThan(cost('regular', 'constant'));
    expect(cost('regular', 'drifting')).toBeGreaterThan(cost('regular', 'constant'));
    expect(cost('regular', 'noisy')).toBeLessThan(80);
  });

  it('broken variants fail the round trip: dropping the control bit for a same value, and a decoder that reads the wrong window', () => {
    const pts = patternSeries('regular', 'drifting').slice(0, 40);
    const good = encode(pts);
    // broken encoder: writes no '0' for a repeated value (the value field is empty)
    const broken = good.segments.map((segs, i) => segs.map((s) => (i > 0 && s.label === 'value' && s.bits === '0' ? '' : s.bits)).join('')).join('');
    expect(broken).not.toBe(good.bits);
    let ok = true;
    try {
      ok = same(decode(broken, pts.length), pts);
    } catch {
      ok = false;
    }
    expect(ok).toBe(false);
    // broken decoder input: a flipped bit in a value field changes the series
    const flipped = good.bits.slice(0, 200) + (good.bits[200] === '0' ? '1' : '0') + good.bits.slice(201);
    expect(same(decode(flipped, pts.length), pts)).toBe(false);
  });

  it('the first delta must fit 14 bits', () => {
    expect(() => encode([{ t: 0, v: 1 }, { t: 20_000, v: 1 }])).toThrow('14 bits');
  });
});

describe('rollups', () => {
  it('(sum, count, min, max) reproduce the raw average, min, max and count exactly for 200 seeded series, and rollups of rollups equal rollups of raw', () => {
    for (const seed of seeds) {
      const pts = series(seed, 0.5 + (seed % 5) * 0.3).filter((_, i) => i % (1 + (seed % 7)) === 0);
      const hourFromRaw = rollup(pts, HOUR);
      const hourFromMinutes = rollupBuckets(rollup(pts, MINUTE), HOUR);
      expect(hourFromMinutes.map((b) => [b.start, b.count, b.min, b.max])).toEqual(hourFromRaw.map((b) => [b.start, b.count, b.min, b.max]));
      for (let i = 0; i < hourFromRaw.length; i++) expect(hourFromMinutes[i].sum).toBeCloseTo(hourFromRaw[i].sum, 6);
      const rawAvg = pts.reduce((a, p) => a + p.v, 0) / pts.length;
      expect(exactAverage(rollup(pts, HOUR))).toBeCloseTo(rawAvg, 9);
      expect(exactAverage(rollup(pts, MINUTE))).toBeCloseTo(rawAvg, 9);
      expect(Math.max(...hourFromRaw.map((b) => b.max))).toBe(Math.max(...pts.map((p) => p.v)));
      expect(Math.min(...hourFromRaw.map((b) => b.min))).toBe(Math.min(...pts.map((p) => p.v)));
      expect(hourFromRaw.reduce((n, b) => n + b.count, 0)).toBe(pts.length);
    }
  });

  it('the spike\'s height after each aggregate equals a direct computation from the raw points', () => {
    const s = series();
    const spikeHour = Math.floor((SERIES_START + SPIKE_START * 10) / HOUR) * HOUR;
    const raw = s.filter((p) => p.t >= spikeHour && p.t < spikeHour + HOUR);
    const b = rollup(s, HOUR).find((x) => x.start === spikeHour)!;
    expect(valueOf(b, 'max')).toBe(Math.max(...raw.map((p) => p.v)));
    expect(valueOf(b, 'min')).toBe(Math.min(...raw.map((p) => p.v)));
    expect(valueOf(b, 'count')).toBe(raw.length);
    expect(valueOf(b, 'avg')).toBeCloseTo(raw.reduce((a, p) => a + p.v, 0) / raw.length, 9);
    expect(valueOf(b, 'avg')).toBeLessThan(valueOf(b, 'max') - 2);
  });

  it('the average of bucket averages differs from the true average on the gap preset by the stated amount, and (sum, count) equals the raw average', () => {
    const gapped = withGap(series(7, 0, 0), 60, 100);
    const minutes = rollup(gapped, MINUTE);
    const raw = gapped.reduce((a, p) => a + p.v, 0) / gapped.length;
    expect(exactAverage(minutes)).toBeCloseTo(raw, 9);
    const wrong = averageOfAverages(minutes);
    expect(Math.abs(wrong - raw)).toBeGreaterThan(0.01);
    const counts = new Set(minutes.map((b) => b.count));
    expect(counts.size).toBeGreaterThan(1);
    // equal counts: the two agree
    const even = rollup(series(7, 0, 0), HOUR);
    expect(averageOfAverages(even)).toBeCloseTo(exactAverage(even), 9);
  });
});

describe('retention and cardinality', () => {
  it('storage is points x bytes per tier, summed: 2 days of raw, 14 of minutes, 365 of hours', () => {
    const s = storage(DEFAULT_POLICY);
    expect(s.raw).toBe(2 * 8640 * 16);
    expect(s.minute).toBe(14 * 1440 * 16);
    expect(s.hour).toBe(365 * 24 * 16);
    expect(s.total).toBe(s.raw + s.minute + s.hour);
    const full = storage({ ...DEFAULT_POLICY, keeps: 'full' });
    expect(full.raw).toBe(s.raw);
    expect(full.minute).toBe(14 * 1440 * 40);
  });

  it('the resolution that answers a window is the finest tier whose retention covers it, table-driven', () => {
    const table: [number, number, number, number, 'raw' | 'minute' | 'hour' | null][] = [
      [2, 14, 365, 1 / 24, 'raw'],
      [2, 14, 365, 7, 'minute'],
      [2, 14, 365, 365, 'hour'],
      [2, 14, 90, 365, null],
      [8, 14, 365, 7, 'raw'],
      [1, 1, 400, 7, 'hour'],
    ];
    for (const [raw, minute, hour, days, tier] of table) expect(tierCovering({ days: { raw, minute, hour }, keeps: 'average' }, days), `${raw}/${minute}/${hour} ${days}`).toBe(tier);
    expect(WINDOWS.map((w) => w.days)).toEqual([1 / 24, 7, 365]);
  });

  it('a one-minute spike from last month survives with max rollups and is erased by hourly averages; held at raw or minute it shows', () => {
    const avg = spikeAfter(DEFAULT_POLICY, 30);
    expect(avg.tier).toBe('hour');
    expect(avg.visible).toBe(false);
    const full = spikeAfter({ ...DEFAULT_POLICY, keeps: 'full' }, 30);
    expect(full.visible).toBe(true);
    expect(full.shown).toBe(BASELINE + DEFAULT_SPIKE);
    expect(spikeAfter({ days: { raw: 40, minute: 40, hour: 40 }, keeps: 'average' }, 30)).toMatchObject({ tier: 'raw', visible: true });
    expect(spikeAfter({ days: { raw: 2, minute: 60, hour: 60 }, keeps: 'average' }, 30)).toMatchObject({ tier: 'minute', visible: true });
    expect(spikeAfter({ days: { raw: 2, minute: 2, hour: 20 }, keeps: 'full' }, 30)).toEqual({ tier: null, shown: null, visible: false });
    expect(spikeShown('hour', 'avg')).toBeCloseTo(BASELINE + DEFAULT_SPIKE / 60, 9);
    expect(spikeVisible(spikeShown('hour', 'avg'))).toBe(false);
  });

  it('series count is the product of the label cardinalities, and a user id multiplies storage by its 10,000 values', () => {
    expect(seriesCount(DEFAULT_LABELS, false)).toBe(8 * 25 * 5 * 40);
    expect(seriesCount(DEFAULT_LABELS, true)).toBe(8 * 25 * 5 * 40 * USER_IDS);
    expect(bytesPerDay(1)).toBe(POINTS_PER_DAY * 16);
    expect(bytesPerDay(seriesCount(DEFAULT_LABELS, true)) / bytesPerDay(seriesCount(DEFAULT_LABELS, false))).toBe(USER_IDS);
    expect(seriesCount({ service: 1, endpoint: 1, status: 1, host: 1 }, false)).toBe(1);
  });
});
