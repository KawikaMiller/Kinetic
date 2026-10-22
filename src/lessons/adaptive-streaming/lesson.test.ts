import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ALGOS, DEFAULT_WEIGHTS, SEGMENT, TRACES, score, simulate, traceOf, type AlgoId, type Weights } from './abr';
import { cdnCaption, compareCaption, ladderCaption, playFrames } from './captions';
import { CACHE, CATALOGUE, DEFAULT_SEED, LONG_TAIL_FROM, ZIPF, liveLatency, rankBucket, replay, requestStream, titleRatio } from './cdn';
import { initialCdn, initialCompare, initialLadder, initialPlayer } from './init';
import lesson from './index';
import { LADDER_SIZES, POPULATION_SEED, evaluate, population } from './ladder';

const clean = (node: unknown) => {
  const t = captionText(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const f1 = (x: number) => x.toFixed(1);
const pct = (x: number | null) => (x === null ? 'none' : `${Math.round(x * 100)}%`);
const run = (trace: Parameters<typeof traceOf>[0], algo: AlgoId, S: number = SEGMENT.initial) => simulate(traceOf(trace, 1), S, algo);

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the rate-based player stalls once on the drop and the buffer-based player does not; the bitrates are the model\'s', () => {
    const p = initialPlayer();
    expect([p.trace, p.algo, p.S]).toEqual(['drop', 'rate', 4]);
    const rate = run('drop', 'rate');
    const buffer = run('drop', 'buffer');
    expect(rate.stallCount).toBe(1);
    expect(buffer.stallTime).toBe(0);
    expect(buffer.avgBitrate).toBeLessThan(rate.avgBitrate);
    const t = lesson.tryThis[0];
    expect(t).toContain(`stalls 1 time for ${f1(rate.stallTime)} s`);
    expect(t).toContain(`${f1(buffer.stallTime)} s stalled, at an average bitrate of ${buffer.avgBitrate.toFixed(2)} Mbit/s against ${rate.avgBitrate.toFixed(2)}`);
  });

  it('try-this 2: the naive player on the steady network stalls on 29 of 30 segments, 29.0 s in all', () => {
    const r = run('steady', 'naive');
    expect([r.stallCount, r.count, f1(r.stallTime)]).toEqual([29, 30, '29.0']);
    const t = lesson.tryThis[1];
    expect(t).toContain('29 of its 30 segments stall, 29.0 s in all');
    expect(t).toContain(`On "a drop" it stalls ${f1(run('drop', 'naive').stallTime)} s`);
  });

  it('try-this 3: the buffer-based player wins by default weights and the naive one wins with a bitrate reward of 5 and no stall penalty', () => {
    const c = initialCompare();
    expect([c.trace, c.S]).toEqual(['drop', 4]);
    const runs = (['naive', 'rate', 'buffer'] as const).map((a) => ({ a, r: run(c.trace, a, c.S) }));
    const top = (w: Weights) => runs.reduce((m, x) => (score(x.r, w) > score(m.r, w) ? x : m)).a;
    expect(top(DEFAULT_WEIGHTS)).toBe('buffer');
    expect(top({ ...DEFAULT_WEIGHTS, bitrate: 5, stall: 0 })).toBe('naive');
    const t = lesson.tryThis[2];
    expect(t).toContain('the buffer-based player scores highest by the default weights');
    expect(t).toContain('the naive player wins');
    expect(t).toContain(`naive ${f1(runs[0].r.stallTime)} s, rate-based ${f1(runs[1].r.stallTime)} s, buffer-based ${f1(runs[2].r.stallTime)} s`);
  });

  it('try-this 4: popular title, long-tail title and overall hit ratios, a full cache, and the live delay from 16 s to 10 s', () => {
    const c = initialCdn();
    expect([c.alpha, c.cache, c.S, c.seed]).toEqual([1, 1000, 4, DEFAULT_SEED]);
    const stream = requestStream(c.seed, c.alpha);
    const r = replay(stream, c.cache);
    const full = replay(stream, CACHE.max);
    const pop = titleRatio(r, 1);
    const tail = titleRatio(r, 150);
    expect(pop.ratio!).toBeGreaterThan(tail.ratio ?? 0);
    expect(full.hitRatio).toBeGreaterThan(r.hitRatio);
    expect(liveLatency(4)).toBe(16);
    expect(liveLatency(2)).toBe(10);
    const t = lesson.tryThis[3];
    expect(t).toContain(`hits ${pct(pop.ratio)} of ${pop.requests.toLocaleString('en-US')} requests`);
    expect(t).toContain(`title 150 hits ${pct(tail.ratio)} of ${tail.requests}`);
    expect(t).toContain(`from ${pct(r.hitRatio)} to ${pct(full.hitRatio)}`);
    expect(t).toContain('falls from 16 s to 10 s');
  });

  it('try-this 5: the three ladders at 30% and 100% slow viewers', () => {
    const l = initialLadder();
    expect([l.slow, l.size]).toEqual([30, 5]);
    const at = (slow: number) => LADDER_SIZES.map((n) => evaluate(n, population(POPULATION_SEED, slow)));
    const [a, b, c] = at(30);
    const slow = at(100);
    expect(a.share).toBeLessThan(b.share);
    expect(b.share).toBeCloseTo(c.share, 1);
    const t = lesson.tryThis[4];
    expect(t).toContain(`one rendition lets ${pct(a.share)} of viewers play, three ${pct(b.share)} and five ${pct(c.share)}`);
    expect(t).toContain(`${a.avgBitrate.toFixed(2)} to ${b.avgBitrate.toFixed(2)} to ${c.avgBitrate.toFixed(2)} Mbit/s`);
    expect(t).toContain(`${pct(slow[0].share)}, ${pct(slow[1].share)} and ${pct(slow[2].share)} can play`);
  });
});

describe('captions are clean and true for every network, player and segment length', () => {
  it('player frames: an intro, one frame per landed segment, a summary; stalls are named where the model has them', () => {
    for (const t of TRACES) for (const a of ALGOS) for (const S of [SEGMENT.min, 4, SEGMENT.max]) {
      const r = simulate(traceOf(t.id, 3), S, a.id);
      const frames = playFrames(r, a.id);
      frames.forEach((f) => clean(f.say));
      if (r.segs.length === 0) {
        expect(frames).toHaveLength(2);
        expect(clean(frames[1].say)).toContain('Stalled, no data arriving');
        continue;
      }
      expect(frames).toHaveLength(r.segs.length + 2);
      expect(frames[0].k).toBe(-1);
      r.segs.forEach((s, k) => {
        const text = clean(frames[k + 1].say);
        expect(text).toContain(`Segment ${k + 1} of ${r.count}`);
        expect(text.includes('a stall of')).toBe(k > 0 && s.stall > 0);
        expect(frames[k + 1].now).toBe(s.end);
        expect(text).toContain(`${s.bitrate} Mbit/s`);
      });
      const last = clean(frames[frames.length - 1].say);
      expect(last).toContain(`${r.stallCount} stall${r.stallCount === 1 ? '' : 's'} totalling ${f1(r.stallTime)} s`);
      expect(last).toContain(`The whole video played in ${f1(r.wall!)} s`);
    }
  });

  it('the rate-based explanation shows the estimate and its safety fraction; the buffer-based one shows the buffer and the bitrate the map gives', () => {
    const rate = playFrames(run('commute', 'rate'), 'rate');
    expect(clean(rate[1].say)).toContain('no throughput estimate yet');
    expect(clean(rate[2].say)).toMatch(/the estimate is \d+\.\d Mbit\/s and 0\.8 of it is \d+\.\d\d/);
    const buffer = playFrames(run('commute', 'buffer'), 'buffer');
    expect(clean(buffer[3].say)).toMatch(/the buffer holds \d+\.\d s, which the buffer map turns into \d+\.\d\d Mbit\/s/);
  });

  it('a full buffer makes the request wait, and the caption says so', () => {
    const r = run('steady', 'rate', 2);
    const k = r.segs.findIndex((s) => s.waited > 0);
    expect(k).toBeGreaterThan(0);
    expect(clean(playFrames(r, 'rate')[k + 1].say)).toContain('The buffer was full');
  });

  it('the comparison caption names the winner from the learner\'s weights and each stalled time; zero throughput says nothing to compare', () => {
    const runs = ALGOS.map((a) => ({ algo: a.id, run: run('drop', a.id) }));
    const t = clean(compareCaption(runs, DEFAULT_WEIGHTS));
    const best = runs.reduce((m, x) => (score(x.run, DEFAULT_WEIGHTS) > score(m.run, DEFAULT_WEIGHTS) ? x : m));
    expect(t).toContain(`${ALGOS.find((a) => a.id === best.algo)!.label}`);
    expect(t).toContain('Change a weight and the winner can change');
    const dead = ALGOS.map((a) => ({ algo: a.id, run: run('dead', a.id) }));
    expect(clean(compareCaption(dead, DEFAULT_WEIGHTS))).toContain('nothing to compare');
  });

  it('weights at their extremes still give a clean caption and a finite score for every player', () => {
    for (const w of [0, 5]) {
      const weights: Weights = { bitrate: w, stall: w, switches: w, startup: w };
      for (const t of TRACES.filter((x) => x.id !== 'dead')) {
        const runs = ALGOS.map((a) => ({ algo: a.id, run: run(t.id, a.id) }));
        clean(compareCaption(runs, weights));
        runs.forEach((x) => expect(Number.isFinite(score(x.run, weights))).toBe(true));
      }
    }
  });

  it('the cache and ladder captions follow their replays, including a title that was never asked for', () => {
    for (const alpha of [ZIPF.min, ZIPF.initial, ZIPF.max]) for (const cache of [CACHE.min, CACHE.initial, CACHE.max]) {
      const r = replay(requestStream(DEFAULT_SEED, alpha), cache);
      const t = clean(cdnCaption(r));
      expect(t).toContain(`Overall ${pct(r.hitRatio)} hit`);
      expect(t).toContain(`${r.misses.toLocaleString('en-US')} of ${r.requests.toLocaleString('en-US')} requests`);
    }
    const tiny = replay([{ title: 2, segment: 0 }], 5);
    expect(clean(cdnCaption(tiny))).toContain('no requests');
    for (const slow of [0, 50, 100]) {
      const results = LADDER_SIZES.map((n) => evaluate(n, population(POPULATION_SEED, slow)));
      const t = clean(ladderCaption(results, slow));
      expect(t).toContain(`With ${slow}% slow viewers`);
      expect(t).toContain(`${pct(results[0].share)} of all viewers play`);
    }
  });
});

describe('hidden controls feed nothing', () => {
  it('the seed changes only the random-walk trace: every other network is the same for any seed', () => {
    for (const t of TRACES.filter((x) => x.id !== 'random')) expect(traceOf(t.id, 1)).toEqual(traceOf(t.id, 12345));
    for (const a of ALGOS) expect(simulate(traceOf('drop', 1), 4, a.id)).toEqual(simulate(traceOf('drop', 99), 4, a.id));
  });
  it('the scoring weights never reach the runs: a run is the same under any weights', () => {
    const r = run('commute', 'buffer');
    score(r, { bitrate: 5, stall: 5, switches: 5, startup: 5 });
    expect(r).toEqual(run('commute', 'buffer'));
  });
});

describe('the scenes open in their own state', () => {
  it('each opening state is a fresh object with its own values', () => {
    expect(initialPlayer()).not.toBe(initialPlayer());
    expect(initialCompare().weights).toEqual(DEFAULT_WEIGHTS);
    expect(initialCompare().weights).not.toBe(DEFAULT_WEIGHTS);
    expect(initialCdn().cache).toBe(1000);
    expect(initialLadder().size).toBe(5);
  });
});

describe('quiz facts come from the model', () => {
  it('the 5 Mbit/s over 4 Mbit/s question: a 4 s segment of 20 megabits takes 5 s, one second more than it plays', () => {
    const r = run('steady', 'naive');
    expect(r.segs[0].end - r.segs[0].start).toBeCloseTo(5, 9);
    expect(r.segs[1].stall).toBeCloseTo(1, 9);
  });
  it('the live delay answer is 3 x 6 + 4 = 22 s', () => {
    const q = lesson.quiz[4];
    expect(q.options[q.answer]).toBe(`${liveLatency(6)} s`);
    expect(q.options).toContain(`${3 * 6} s`);
  });
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});

describe('claims about the origin and the traces come from the model', () => {
  it('key idea 4: the long-tail share of the origin requests is recounted request by request, and the three buckets add up to the origin load', () => {
    const stream = requestStream(DEFAULT_SEED, ZIPF.initial);
    const r = replay(stream, CACHE.initial);
    // brute force: an independent LRU over an array, counting a miss for each request not in it
    const cache: number[] = [];
    let originTail = 0;
    let origin = 0;
    let tailRequests = 0;
    for (const q of stream) {
      const k = q.title * 30 + q.segment;
      const at = cache.indexOf(k);
      if (q.title >= LONG_TAIL_FROM) tailRequests++;
      if (at >= 0) cache.splice(at, 1);
      else {
        origin++;
        if (q.title >= LONG_TAIL_FROM) originTail++;
        if (cache.length >= CACHE.initial) cache.shift();
      }
      cache.push(k);
    }
    const bucket = rankBucket(r, LONG_TAIL_FROM, CATALOGUE);
    expect(r.misses).toBe(origin);
    expect(bucket.originShare).toBeCloseTo(originTail / origin, 12);
    expect(bucket.requests).toBe(tailRequests);
    const shares = [rankBucket(r, 1, 10), rankBucket(r, 11, LONG_TAIL_FROM - 1), bucket].map((b) => b.originShare);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const idea = lesson.keyIdeas[3];
    expect(idea).toContain(`${Math.round((tailRequests / stream.length) * 100)}% of the requests but ${Math.round((originTail / origin) * 100)}% of the ones that reach the origin`);
    expect(idea).not.toContain('mostly');
  });
  it('the sawtooth note names its true peak, and the repeating claim is scoped to the trace length', () => {
    const peak = Math.max(...traceOf('sawtooth', 1));
    expect(peak).toBe(5.25);
    const note = TRACES.find((t) => t.id === 'sawtooth')!.note;
    expect(note).toContain('to 5.25 Mbit/s');
    expect(note).not.toContain('over and over');
    expect(note).toContain('150 s');
    expect(traceOf('commute', 1)).toHaveLength(150);
  });
  it('the ladder caption says the averages are among the viewers who can play, and they are', () => {
    const bws = population(POPULATION_SEED, 100);
    const results = LADDER_SIZES.map((n) => evaluate(n, bws));
    expect(captionText(ladderCaption(results, 100) as never, { strict: true })).toContain('among the viewers who can play');
    const one = results[0];
    expect(one.canPlay).toBeLessThan(bws.length);
  });
  it('the quiz numbers are the model numbers', () => {
    expect(lesson.quiz[1].why).toContain('20 megabits, which takes 5 s at 4 Mbit/s: 1 s longer');
    expect(lesson.quiz[4].q).toContain('6 s segments');
    expect(lesson.quiz[4].options).toEqual([`${liveLatency(6)} s`, '18 s', '10 s', '6 s']);
  });
});
