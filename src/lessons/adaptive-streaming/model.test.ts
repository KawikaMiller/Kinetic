import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  ALGOS, ALPHA, CUSHION, LADDER, MAX_BUFFER, RESERVOIR, SAFETY, SEGMENT, TRACE_SECONDS, TRACES, VIDEO_SECONDS,
  bufferAt, bufferMap, chooseBuffer, chooseRate, downloadTime, playedAt, score, simulate, traceOf, DEFAULT_WEIGHTS, type AlgoId, type Run,
} from './abr';
import { CACHE, CATALOGUE, REQUESTS, SEGMENTS_PER_TITLE, ZIPF, expectedShare, liveLatency, replay, requestStream, titleRatio, type Req } from './cdn';
import { LADDERS, LADDER_SIZES, TITLE_SECONDS, VIEWERS, evaluate, population, rungFor } from './ladder';

const ALGO_IDS = ALGOS.map((a) => a.id);

// ---- the download clock -------------------------------------------------------------------------

describe('download time integrates the trace', () => {
  it('a constant trace gives size over rate, from any start', () => {
    const flat = Array.from({ length: 20 }, () => 4);
    for (const t0 of [0, 0.3, 7.9]) expect(downloadTime(flat, t0, 10)).toBeCloseTo(2.5, 12);
  });
  it('hand case: starting at 0.5 on [4, 1, 10]: 2 Mbit in the rest of second 0, 1 in second 1, then 2 more at 10 take 0.2 s: 1.7 s in all', () => {
    expect(downloadTime([4, 1, 10, 10], 0.5, 5)).toBeCloseTo(1.7, 12);
  });
  it('a stretch of zero throughput is waited out, not divided by', () => {
    expect(downloadTime([0, 0, 2, 2], 0, 1)).toBeCloseTo(2.5, 12);
  });
  it('past the end the last sample repeats; a zero last sample never completes', () => {
    expect(downloadTime([1], 0, 3)).toBeCloseTo(3, 12);
    expect(downloadTime([1, 1], 0.5, 3)).toBeCloseTo(3, 12);
    expect(downloadTime(traceOf('dead'), 0, 0.4)).toBe(Infinity);
    expect(downloadTime([2, 0], 0, 5)).toBe(Infinity);
  });
  it('matches a fine time-stepped integration on 300 seeded traces and start times', () => {
    const rnd = mulberry32(41);
    for (let i = 0; i < 300; i++) {
      const trace = traceOf('random', i + 1);
      const t0 = rnd() * 60;
      const size = 0.5 + rnd() * 20;
      let t = t0;
      let got = 0;
      const dt = 0.001;
      while (got < size) {
        got += trace[Math.min(Math.floor(t), trace.length - 1)] * dt;
        t += dt;
      }
      expect(downloadTime(trace, t0, size)).toBeCloseTo(t - t0, 2);
    }
  });
});

// ---- the algorithms -----------------------------------------------------------------------------

describe('rate-based selection', () => {
  it('equals a reference on 500 seeded estimates, scanning the ladder from the top', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const est = rnd() * 8;
      let expected = 0;
      for (let r = LADDER.length - 1; r >= 0; r--) {
        if (LADDER[r] <= 0.8 * est) {
          expected = r;
          break;
        }
      }
      expect(chooseRate(est)).toBe(expected);
    }
    expect(SAFETY).toBe(0.8);
  });
  it('the lowest rendition before any estimate, and on a very low one', () => {
    expect(chooseRate(null)).toBe(0);
    expect(chooseRate(0)).toBe(0);
    expect(chooseRate(0.1)).toBe(0);
  });
  it('hand cases: 2.0 Mbit/s x 0.8 = 1.6 reaches rung 2; 6.25 x 0.8 = 5.0 reaches the top; 6.2 does not', () => {
    expect(chooseRate(2)).toBe(2);
    expect(chooseRate(6.25)).toBe(4);
    expect(chooseRate(6.2)).toBe(3);
  });
});

describe('buffer-based selection', () => {
  it('the map is monotone in the buffer, from the lowest bitrate up to the reservoir to the highest past the cushion', () => {
    let prev = -Infinity;
    for (let b = 0; b <= MAX_BUFFER + 10; b += 0.1) {
      const m = bufferMap(b);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
    expect(bufferMap(0)).toBe(LADDER[0]);
    expect(bufferMap(RESERVOIR)).toBe(LADDER[0]);
    expect(bufferMap(RESERVOIR + CUSHION)).toBe(LADDER[LADDER.length - 1]);
    expect(bufferMap(RESERVOIR + CUSHION / 2)).toBeCloseTo((LADDER[0] + LADDER[LADDER.length - 1]) / 2, 12);
  });
  it('the chosen rendition is monotone in the buffer and equals a reference scan', () => {
    let prev = -1;
    for (let b = 0; b <= 40; b += 0.05) {
      const r = chooseBuffer(b);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
      let expected = 0;
      for (let i = 0; i < LADDER.length; i++) if (LADDER[i] <= bufferMap(b)) expected = i;
      expect(r).toBe(expected);
    }
    expect(chooseBuffer(7.9)).toBe(0);
    expect(chooseBuffer(28)).toBe(LADDER.length - 1);
  });
});

// ---- the player ---------------------------------------------------------------------------------

/** An independent time-stepped replay of the player's mechanics, fed the renditions the model chose. */
function replayTicks(trace: readonly number[], run: Run): { startup: number; stallTime: number; wall: number } {
  const dt = 0.001;
  let clock = 0;
  let buffer = 0;
  let playing = false;
  let stalled = false;
  let stallTime = 0;
  let startup = 0;
  let k = 0;
  let bits = 0;
  let waiting = true;
  const lengthOf = (i: number) => run.segs[i].length;
  const rateAt = (t: number) => trace[Math.min(Math.floor(t), trace.length - 1)];
  const needed = (i: number) => run.segs[i].bitrate * lengthOf(i);
  while (k < run.segs.length) {
    if (waiting && !(playing && buffer + lengthOf(k) > MAX_BUFFER)) waiting = false;
    if (!waiting) bits += rateAt(clock) * dt;
    if (playing && !stalled) {
      buffer -= dt;
      if (buffer <= 0) {
        buffer = 0;
        stalled = true;
      }
    } else if (stalled) {
      stallTime += dt;
    }
    clock += dt;
    if (!waiting && bits >= needed(k)) {
      buffer += lengthOf(k);
      if (!playing) {
        playing = true;
        startup = clock;
      }
      stalled = false;
      bits -= needed(k);
      k++;
      waiting = true;
    }
  }
  return { startup, stallTime, wall: clock + buffer };
}

describe('the player equals an independent time-stepped replay', () => {
  it('startup, stalled time and finishing time agree on 200 seeded traces, every algorithm', () => {
    const rnd = mulberry32(43);
    for (let i = 0; i < 200; i++) {
      const id = (['random', 'random', 'drop', 'commute', 'sawtooth'] as const)[i % 5];
      const trace = traceOf(id, i + 1);
      const S = randInt(SEGMENT.min, SEGMENT.max, rnd);
      const algo = ALGO_IDS[i % 3] as AlgoId;
      const run = simulate(trace, S, algo);
      if (run.wall === null) continue;
      const ref = replayTicks(trace, run);
      const tol = 0.03 + 0.003 * run.segs.length;
      expect(Math.abs(ref.startup - run.startup), `startup ${id} S${S} ${algo}`).toBeLessThan(tol);
      expect(Math.abs(ref.stallTime - run.stallTime), `stall ${id} S${S} ${algo}`).toBeLessThan(tol);
      expect(Math.abs(ref.wall - run.wall), `wall ${id} S${S} ${algo}`).toBeLessThan(tol);
    }
  });
});

describe('buffer conservation and time accounting, on 200 seeded traces', () => {
  const cases = Array.from({ length: 200 }, (_, i) => {
    const rnd = mulberry32(100 + i);
    return { trace: traceOf((['random', 'drop', 'sawtooth', 'commute', 'steady'] as const)[i % 5], i + 1), S: randInt(SEGMENT.min, SEGMENT.max, rnd), algo: ALGO_IDS[i % 3] as AlgoId };
  });

  it('each segment: buffer after = buffer before - download time + length while playing, or exactly the length after a stall', () => {
    for (const { trace, S, algo } of cases) {
      const run = simulate(trace, S, algo);
      run.segs.forEach((s, k) => {
        const dt = s.end - s.start;
        if (k === 0) {
          expect(s.bufferAfter).toBe(s.length);
        } else if (s.stall === 0) {
          expect(s.bufferAfter).toBeCloseTo(s.bufferBefore - dt + s.length, 9);
          expect(s.bufferBefore - dt).toBeGreaterThanOrEqual(-1e-9);
        } else {
          expect(s.bufferAfter).toBe(s.length);
          expect(s.stall).toBeCloseTo(dt - s.bufferBefore, 9);
          expect(dt).toBeGreaterThan(s.bufferBefore + 1e-12);
        }
        expect(s.bufferAfter).toBeLessThanOrEqual(MAX_BUFFER + 1e-9);
        expect(s.bufferBefore).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('wall time = startup + video length + stalled time, and the video played is exactly the video', () => {
    for (const { trace, S, algo } of cases) {
      const run = simulate(trace, S, algo);
      expect(run.wall).not.toBeNull();
      expect(run.wall!).toBeCloseTo(run.startup + VIDEO_SECONDS + run.stallTime, 8);
      expect(run.segs.reduce((n, s) => n + s.length, 0)).toBeCloseTo(VIDEO_SECONDS, 9);
      expect(run.segs).toHaveLength(Math.ceil(VIDEO_SECONDS / S));
    }
  });

  it('played seconds never exceed wall time, rise by at most the time that passed, and reach the whole video at the end', () => {
    for (const { trace, S, algo } of cases.slice(0, 60)) {
      const run = simulate(trace, S, algo);
      let prev = 0;
      for (let t = 0; t <= run.wall! + 1; t += 0.7) {
        const p = playedAt(run, t);
        expect(p).toBeLessThanOrEqual(t + 1e-9);
        expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(p - prev).toBeLessThanOrEqual(0.7 + 1e-9);
        prev = p;
      }
      expect(playedAt(run, run.wall!)).toBeCloseTo(VIDEO_SECONDS, 8);
    }
  });

  it('the buffer curve agrees with the records at every request and landing, and is never negative', () => {
    for (const { trace, S, algo } of cases.slice(0, 80)) {
      const run = simulate(trace, S, algo);
      for (const s of run.segs) {
        expect(bufferAt(run, s.start)).toBeCloseTo(s.bufferBefore, 8);
        expect(bufferAt(run, s.end)).toBeCloseTo(s.bufferAfter, 8);
      }
      for (let t = 0; t <= run.wall!; t += 0.9) expect(bufferAt(run, t)).toBeGreaterThanOrEqual(0);
      expect(bufferAt(run, run.wall!)).toBeCloseTo(0, 8);
    }
  });
});

describe('what each algorithm does', () => {
  it('every rendition chosen is on the ladder', () => {
    for (const t of TRACES) for (const a of ALGOS) for (const S of [SEGMENT.min, 4, SEGMENT.max]) {
      for (const s of simulate(traceOf(t.id, 3), S, a.id).segs) {
        expect(Number.isInteger(s.rendition)).toBe(true);
        expect(s.rendition).toBeGreaterThanOrEqual(0);
        expect(s.rendition).toBeLessThan(LADDER.length);
        expect(s.bitrate).toBe(LADDER[s.rendition]);
      }
    }
  });
  it('the naive algorithm\'s average bitrate is the top rung, on every trace that delivers', () => {
    for (const t of TRACES.filter((x) => x.id !== 'dead')) expect(simulate(traceOf(t.id, 5), 4, 'naive').avgBitrate).toBeCloseTo(LADDER[LADDER.length - 1], 12);
  });
  it('with a constant trace above the top rung no algorithm stalls, at any segment length (hand case)', () => {
    const fast = Array.from({ length: TRACE_SECONDS }, () => 6);
    for (const a of ALGO_IDS) for (let S = SEGMENT.min; S <= SEGMENT.max; S++) {
      const r = simulate(fast, S, a);
      expect(r.stallTime, `${a} S${S}`).toBe(0);
      expect(r.stallCount).toBe(0);
    }
  });
  it('on the steady 4 Mbit/s trace the top rendition cannot keep up: a 4 s segment of 5 Mbit/s takes 5 s, so the naive player stalls on every segment but the first (hand case)', () => {
    const r = simulate(traceOf('steady'), 4, 'naive');
    expect(r.segs[0].end - r.segs[0].start).toBeCloseTo(5, 12);
    expect(r.stallCount).toBe(r.count - 1);
    expect(r.segs[1].stall).toBeCloseTo(1, 9);
  });
  it('on the drop trace the buffer-based player stalls less than the rate-based one, which stalls less than the naive one, and pays for it in bitrate', () => {
    const [naive, rate, buffer] = (['naive', 'rate', 'buffer'] as const).map((a) => simulate(traceOf('drop'), 4, a));
    expect(buffer.stallTime).toBeLessThan(rate.stallTime);
    expect(rate.stallTime).toBeLessThan(naive.stallTime);
    expect(buffer.avgBitrate).toBeLessThan(naive.avgBitrate);
  });
  it('the dead trace never completes a segment, for every algorithm, and the run says where it is stuck', () => {
    for (const a of ALGO_IDS) {
      const r = simulate(traceOf('dead'), 4, a);
      expect(r.stuckAt).toBe(0);
      expect(r.wall).toBeNull();
      expect(r.segs).toHaveLength(0);
      expect(Number.isNaN(r.avgBitrate)).toBe(false);
    }
  });
  it('the first request is always the lowest rendition for the two adaptive algorithms (no estimate, an empty buffer)', () => {
    for (const a of ['rate', 'buffer'] as const) for (const t of TRACES.filter((x) => x.id !== 'dead')) expect(simulate(traceOf(t.id, 2), 4, a).segs[0].rendition).toBe(0);
  });
  it('the throughput estimate follows the exponential average of the measured samples', () => {
    const r = simulate(traceOf('commute'), 4, 'rate');
    let est: number | null = null;
    for (const s of r.segs) {
      expect(s.estimateBefore).toEqual(est);
      est = est === null ? s.sample : ALPHA * s.sample + (1 - ALPHA) * est;
      expect(s.estimate).toBeCloseTo(est, 12);
    }
  });
  it('switches count the changes of rendition between neighbouring segments', () => {
    const r = simulate(traceOf('commute'), 4, 'buffer');
    let n = 0;
    for (let i = 1; i < r.segs.length; i++) if (r.segs[i].rendition !== r.segs[i - 1].rendition) n++;
    expect(r.switches).toBe(n);
  });
  it('the learner\'s own score is the weighted sum of the readouts, with no built-in winner: different weights crown different players', () => {
    const runs = ALGO_IDS.map((a) => ({ a, r: simulate(traceOf('drop'), 4, a) }));
    const best = (w: typeof DEFAULT_WEIGHTS) => runs.reduce((m, x) => (score(x.r, w) > score(m.r, w) ? x : m)).a;
    const q = runs[1].r;
    expect(score(q, { bitrate: 1, stall: 2, switches: 0.5, startup: 0.5 })).toBeCloseTo(q.avgBitrate - 2 * q.stallTime - 0.5 * q.switches - 0.5 * q.startup, 12);
    expect(best({ bitrate: 5, stall: 0, switches: 0, startup: 0 })).toBe('naive');
    expect(best({ bitrate: 0, stall: 5, switches: 0, startup: 0 })).toBe('buffer');
  });
});

// ---- the CDN -----------------------------------------------------------------------------------

/** A reference LRU: an array kept most recent last, with linear scans. */
function referenceHits(stream: readonly Req[], capacity: number): { hits: number; byTitle: Map<number, [number, number]> } {
  const cache: number[] = [];
  const byTitle = new Map<number, [number, number]>();
  let hits = 0;
  for (const r of stream) {
    const k = r.title * SEGMENTS_PER_TITLE + r.segment;
    const rec = byTitle.get(r.title) ?? [0, 0];
    byTitle.set(r.title, rec);
    rec[0]++;
    const at = cache.indexOf(k);
    if (at >= 0) {
      hits++;
      rec[1]++;
      cache.splice(at, 1);
    } else if (cache.length >= capacity) cache.shift();
    cache.push(k);
  }
  return { hits, byTitle };
}

describe('the cache hit ratio equals a replay through an LRU of the stated size', () => {
  it('overall and per title, at several sizes and exponents', () => {
    for (const alpha of [0.6, 1, 1.4]) {
      const stream = requestStream(7, alpha);
      for (const capacity of [100, 1000, 6000]) {
        const got = replay(stream, capacity);
        const ref = referenceHits(stream, capacity);
        expect(got.hits).toBe(ref.hits);
        expect(got.misses).toBe(stream.length - ref.hits);
        for (const [title, [requests, hits]] of ref.byTitle) expect(got.byTitle.get(title)).toEqual({ requests, hits });
      }
    }
  });
  it('a cache big enough for the whole catalogue misses each distinct segment once; a cache of one only hits an immediate repeat', () => {
    const stream = requestStream(9, 1);
    const distinct = new Set(stream.map((r) => r.title * SEGMENTS_PER_TITLE + r.segment)).size;
    expect(replay(stream, CATALOGUE * SEGMENTS_PER_TITLE).misses).toBe(distinct);
    const one = replay(stream, 1);
    const repeats = stream.filter((r, i) => i > 0 && r.title === stream[i - 1].title && r.segment === stream[i - 1].segment).length;
    expect(one.hits).toBe(repeats);
  });
  it('a bigger cache never lowers the overall hit ratio (the LRU stack property), on a seeded stream', () => {
    const stream = requestStream(5, 1);
    let prev = -1;
    for (let c = CACHE.min; c <= CACHE.max; c += 500) {
      const h = replay(stream, c).hitRatio;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
  it('the popular title hits far more often than a long-tail title at the default cache, and the Zipf stream matches its law', () => {
    const stream = requestStream(7, ZIPF.initial);
    expect(stream).toHaveLength(REQUESTS);
    const r = replay(stream, CACHE.initial);
    expect(titleRatio(r, 1).ratio!).toBeGreaterThan(0.9);
    expect(titleRatio(r, 150).ratio ?? 0).toBeLessThan(0.5);
    const share = titleRatio(r, 1).requests / REQUESTS;
    expect(Math.abs(share - expectedShare(1, ZIPF.initial))).toBeLessThan(0.02);
  });
  it('live latency is the segments held back times the segment length plus the pipeline time (hand case: 3 x 4 + 4 = 16 s)', () => {
    expect(liveLatency(4)).toBe(16);
    expect(liveLatency(2)).toBe(10);
    expect(liveLatency(10)).toBe(34);
  });
});

// ---- the ladder ---------------------------------------------------------------------------------

describe('the ladder and the population', () => {
  it('a viewer gets the highest rung within the safety fraction of their bandwidth, or nothing', () => {
    expect(rungFor(LADDERS[5], 2)).toBe(1.6);
    expect(rungFor(LADDERS[5], 0.4)).toBeNull();
    expect(rungFor(LADDERS[5], 0.5)).toBe(0.4);
    expect(rungFor(LADDERS[1], 1.9)).toBeNull();
    expect(rungFor(LADDERS[1], 2)).toBe(1.6);
    expect(rungFor(LADDERS[3], 100)).toBe(5);
  });
  it('served share and average bitrate equal a brute-force pass over the viewers, for each ladder and mix', () => {
    for (const slow of [0, 30, 100]) {
      const bws = population(11, slow);
      expect(bws).toHaveLength(VIEWERS);
      for (const size of LADDER_SIZES) {
        const r = evaluate(size, bws);
        let can = 0;
        let sum = 0;
        for (const bw of bws) {
          const fit = LADDERS[size].filter((b) => b <= 0.8 * bw);
          if (fit.length) {
            can++;
            sum += Math.max(...fit);
          }
        }
        expect(r.canPlay).toBe(can);
        expect(r.avgBitrate).toBeCloseTo(can ? sum / can : 0, 12);
        expect(r.share).toBeCloseTo(can / bws.length, 12);
      }
    }
  });
  it('more rungs never serve fewer viewers than a ladder they contain, and always cost more storage (hand: 5 rungs sum to 10.8 Mbit/s for 2 h = 9.72 GB)', () => {
    const bws = population(11, 30);
    const [one, three, five] = LADDER_SIZES.map((s) => evaluate(s, bws));
    expect(five.canPlay).toBeGreaterThanOrEqual(three.canPlay);
    expect(five.storageGb).toBeGreaterThan(three.storageGb);
    expect(three.storageGb).toBeGreaterThan(one.storageGb);
    expect(five.storageGb).toBeCloseTo((LADDER.reduce((a, b) => a + b, 0) * TITLE_SECONDS) / 8000, 12);
    expect(five.storageGb).toBeCloseTo(9.72, 2);
    expect(five.avgBitrate).toBeGreaterThan(three.avgBitrate);
    expect(three.canPlay).toBeGreaterThan(one.canPlay);
  });
  it('a population of only fast viewers is served completely by every ladder, and one of slow viewers is served less', () => {
    const fast = population(11, 0);
    for (const s of LADDER_SIZES) expect(evaluate(s, fast).share).toBeGreaterThan(0.99);
    expect(evaluate(1, population(11, 100)).share).toBeLessThan(evaluate(1, fast).share);
  });
});

describe('the traces', () => {
  it('every trace has the stated length and non-negative samples; the seeded one follows its seed', () => {
    for (const t of TRACES) {
      const tr = traceOf(t.id, 4);
      expect(tr).toHaveLength(TRACE_SECONDS);
      expect(tr.every((x) => x >= 0 && Number.isFinite(x))).toBe(true);
    }
    expect(traceOf('random', 4)).toEqual(traceOf('random', 4));
    expect(traceOf('random', 4)).not.toEqual(traceOf('random', 5));
    expect(traceOf('steady', 1)).toEqual(traceOf('steady', 99));
  });
});
