import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { guessCaption, ladderCaption, serverCaption, storageCaption, trafficCaption } from './frames';
import lesson from './index';
import {
  PATH_DEFAULT, SCENARIOS, SERVER_DEFAULT, STORAGE_DEFAULT, TRAFFIC_DEFAULT, bandwidth, bigText, orderError, parseDau, parsePeak, parseRecord, parseWrites,
  parseCpuMs, pathBudget, scenarioQps, servers, storage, traffic, withinTenfold, type PathStep,
} from './model';

const defaultTraffic = (round: boolean) =>
  traffic({ dau: 100_000_000, actionsPerUser: TRAFFIC_DEFAULT.actions, peakFactor: TRAFFIC_DEFAULT.peak, readsPerWrite: TRAFFIC_DEFAULT.reads, round });
const defaultStorage = (binary: boolean) => {
  const r = parseRecord(STORAGE_DEFAULT.record);
  const w = parseWrites(STORAGE_DEFAULT.writes);
  if (!r.ok || !w.ok) throw new Error('defaults must parse');
  return storage({ recordBytes: r.value, writesPerDay: w.value, retentionDays: STORAGE_DEFAULT.retention, replicas: STORAGE_DEFAULT.replicas, overhead: STORAGE_DEFAULT.overhead, binary });
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 11,574 /s average and 34,722 /s peak, and the round divisor gives 10,000, about 14% low', () => {
    const exact = defaultTraffic(false);
    expect(parseDau(TRAFFIC_DEFAULT.dau)).toEqual({ ok: true, value: 100_000_000 });
    expect(bigText(exact.average.value)).toBe('11,574');
    expect(bigText(exact.peak.value)).toBe('34,722');
    const round = defaultTraffic(true);
    expect(round.average.value).toBeCloseTo(10_000, 9);
    expect(1 - round.average.value / exact.average.value).toBeCloseTo(0.136, 3);
    expect(text(trafficCaption(round, TRAFFIC_DEFAULT.peak, true))).toContain('13.6% below the exact 11,574 req/s');
    expect(text(trafficCaption(exact, TRAFFIC_DEFAULT.peak, false))).toContain('the exact figure is 15.7% above it');
  });

  it('try-this 2: the default storage is 1.095 TB, and binary units read 0.996 TiB', () => {
    const dec = defaultStorage(false);
    const bin = defaultStorage(true);
    expect(dec.inUnit).toBeCloseTo(1.095, 9);
    expect(bin.inUnit).toBeCloseTo(0.996, 3);
    const b = bandwidth(STORAGE_DEFAULT.payload, 34_722.222);
    expect(text(storageCaption(dec, b))).toContain('1.095 TB');
    expect(text(storageCaption(bin, b))).toContain('0.996 TiB');
  });

  it('try-this 3: the default peak needs 53 servers, and N + 1 makes 54', () => {
    const peak = parsePeak(SERVER_DEFAULT.peak);
    const cpu = parseCpuMs(SERVER_DEFAULT.cpuMs);
    if (!peak.ok || !cpu.ok) throw new Error('defaults must parse');
    const base = { peak: peak.value, cores: SERVER_DEFAULT.cores, cpuMs: cpu.value, target: SERVER_DEFAULT.target };
    expect(servers({ ...base, redundancy: SERVER_DEFAULT.redundancy }).total).toBe(53);
    expect(servers({ ...base, redundancy: 'n+1' }).total).toBe(54);
    expect(text(serverCaption(servers({ ...base, redundancy: 'n+1' })))).toContain('plus 1 for redundancy: 54');
  });

  it('try-this 4: the default path is about 10 ms inside 200 ms, and two cross-continent trips put it over', () => {
    const p = pathBudget(PATH_DEFAULT);
    expect(p.totalMs).toBeGreaterThan(9.5);
    expect(p.totalMs).toBeLessThan(10.7);
    expect(p.inBudget).toBe(true);
    const over = pathBudget({ ...PATH_DEFAULT, wan: 2 } as Record<PathStep, number>);
    expect(over.inBudget).toBe(false);
    expect(text(ladderCaption(over))).toContain('over the 200 ms budget by');
    expect(text(ladderCaption(p))).toContain('inside the 200 ms budget');
  });

  it('try-this 5: 10⁴ for the chat app is 0.06 orders low and within 10×; 10³ is more than 10× off', () => {
    const truth = scenarioQps(SCENARIOS[0]);
    expect(bigText(truth)).toBe('11,574');
    expect(orderError(4, truth)).toBeCloseTo(-0.0635, 3);
    expect(withinTenfold(4, truth)).toBe(true);
    expect(withinTenfold(3, truth)).toBe(false);
    expect(text(guessCaption(4, truth))).toContain('0.063 orders of magnitude low');
    expect(text(guessCaption(3, truth))).toContain('more than 10× off');
    expect(text(guessCaption(null, truth))).toContain('before any answer is shown');
  });
});

describe('captions are computed from the model', () => {
  it('the guess caption never shows the answer before a pick and always matches the sign of the error', () => {
    for (const s of SCENARIOS) {
      const truth = scenarioQps(s);
      expect(text(guessCaption(null, truth))).not.toContain(bigText(truth));
      for (const e of [2, 3, 4, 5, 6, 7]) {
        const c = text(guessCaption(e, truth));
        expect(c.includes('low')).toBe(orderError(e, truth) < 0);
        expect(c.includes('within 10×')).toBe(withinTenfold(e, truth));
      }
    }
  });

  it('the traffic caption reads the same numbers as the stats at extreme inputs, and big results print as powers of ten', () => {
    const big = traffic({ dau: 1e12, actionsPerUser: 1e9, peakFactor: 10, readsPerWrite: 100, round: false });
    expect(text(trafficCaption(big, 10, false))).toContain(bigText(big.peak.value));
    const huge = storage({ recordBytes: 1e9, writesPerDay: 1e12, retentionDays: 3650, replicas: 5, overhead: 3, binary: false });
    expect(bigText(huge.total.value)).toMatch(/× 10[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
    const small = traffic({ dau: 1, actionsPerUser: 1, peakFactor: 1, readsPerWrite: 1, round: false });
    expect(text(trafficCaption(small, 1, false))).toContain(bigText(small.average.value));
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: 10⁹ requests a day ÷ 86,400 s is about 11,600 per second, and each other option is a power of ten away', () => {
    const q = (1e8 * 10) / 86_400;
    expect(q).toBeGreaterThan(11_500);
    expect(q).toBeLessThan(11_700);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toBe('About 11,600 per second');
    expect(Math.log10(116_000 / q)).toBeCloseTo(1, 1);
  });

  it('Q2: 10 Gbit/s ÷ 8 = 1.25 GB/s', () => {
    expect((10e9 / 8) / 1e9).toBe(1.25);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toBe('About 1.25 GB per second');
  });

  it('Q3: the peak is 30,000 /s, 30 servers at 1,000 each; ten servers would run the peak at 3× target', () => {
    const peak = 10_000 * 3;
    expect(peak / 1000).toBe(30);
    expect(peak / (10 * 1000)).toBe(3);
  });

  it('Q4: an SSD read is about 500 memory reads on the shared ladder', () => {
    const p = pathBudget({ l1: 0, ram: 1, nvme: 0, dc: 0, wan: 0 }).totalMs;
    const ssd = pathBudget({ l1: 0, ram: 0, nvme: 1, dc: 0, wan: 0 }).totalMs;
    expect(ssd / p).toBe(500);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('storage bandwidth uses scene 1 defaults, not scene 1 sliders (it is a pure function of its own inputs)', () => {
    const a = bandwidth(2000, 34_722.222);
    const b = bandwidth(2000, 34_722.222);
    expect(a).toEqual(b);
    expect(bandwidth(4000, 34_722.222).bytesPerSecond.value).toBeCloseTo(2 * a.bytesPerSecond.value, 6);
  });

  it('the read:write ratio splits the peak and never moves the average or the peak', () => {
    const lo = traffic({ dau: 1e8, actionsPerUser: 10, peakFactor: 3, readsPerWrite: 1, round: false });
    const hi = traffic({ dau: 1e8, actionsPerUser: 10, peakFactor: 3, readsPerWrite: 100, round: false });
    expect(lo.average.value).toBe(hi.average.value);
    expect(lo.peak.value).toBe(hi.peak.value);
    expect(lo.reads.value).toBeLessThan(hi.reads.value);
  });
});
