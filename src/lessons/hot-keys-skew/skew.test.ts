import { describe, expect, it } from 'vitest';
import { harmonic, zipfSampler } from '../../core/distributions';
import { hash32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';
import {
  BURST_SHIFT, FILL_TICKS, HOT_SHARE, KEYS, REQUESTS, SHARDS, TICK_REQUESTS, burstLoads, detect, expectedShares, fillSim, hottestKeys, hottestShare, makeStream, plainLoads, saltedReadResult,
  saturationAt, saturationEstimate, shardLoads, shardOf, splitTable, summarise, type Mitigation, type MitigationKind,
} from './skew';

const mit = (kind: MitigationKind, o: Partial<Mitigation> = {}): Mitigation => ({ kind, m: 4, hit: 0.8, hot: hottestKeys(1), ...o });

describe('placement and the seeded stream', () => {
  it('shardOf is hash32 of the key name mod 8, and hashing spreads KEYS roughly evenly (each shard holds 125 keys give or take 25)', () => {
    expect(shardOf(7)).toBe(hash32('user:7') % 8);
    const counts = new Array<number>(SHARDS).fill(0);
    for (let k = 1; k <= KEYS; k++) counts[shardOf(k)]++;
    for (const c of counts) expect(Math.abs(c - KEYS / SHARDS)).toBeLessThan(25);
  });

  it('shard loads without a mitigation equal an independent count of the stream, for several skews and seeds', () => {
    for (const skew of [0, 0.5, 1, 1.5]) {
      for (const seed of [1, 2, 3]) {
        const stream = makeStream({ seed, skew, readShare: 0.5 });
        const by = new Array<number>(SHARDS).fill(0);
        for (const r of stream) by[hash32(`user:${r.key}`) % 8]++;
        expect(shardLoads(stream, mit('none'), skew).loads).toEqual(by);
        expect(plainLoads(stream)).toEqual(by);
      }
    }
  });

  it('the tick sim fills the bars exactly as an independent draw of the same seeded keys counts them (at ticks 0, 7 and the last)', () => {
    for (const skew of [0, 1]) {
      const sim = fillSim(5, skew);
      sim.run(FILL_TICKS);
      const draw = zipfSampler(KEYS, skew);
      const rnd = mulberry32(5);
      const by = new Array<number>(SHARDS).fill(0);
      const seen: number[][] = [by.slice()];
      for (let t = 1; t <= FILL_TICKS; t++) {
        for (let i = 0; i < TICK_REQUESTS; i++) by[shardOf(draw(rnd))]++;
        seen.push(by.slice());
      }
      for (const t of [0, 7, FILL_TICKS]) expect(sim.at(t)!.loads, `skew ${skew} tick ${t}`).toEqual(seen[t]);
      expect(sim.at(FILL_TICKS)!.requests).toBe(REQUESTS);
    }
  });

  it('the hottest key carries 1 / H(n, s) of the traffic: measured over 100,000 seeded requests it is within 6% of the closed form', () => {
    for (const skew of [0.5, 1, 1.5]) {
      const stream = makeStream({ seed: 11, skew, readShare: 0.5, requests: 100_000 });
      const measured = stream.filter((r) => r.key === 1).length / stream.length;
      expect(hottestShare(skew)).toBeCloseTo(1 / harmonic(KEYS, skew), 12);
      expect(Math.abs(measured - hottestShare(skew)) / hottestShare(skew), `s=${skew}`).toBeLessThan(0.06);
    }
    expect(hottestShare(1)).toBeCloseTo(0.1336, 3);
  });
});

describe('the point of the lesson: the hottest shard saturates while total utilisation is about half', () => {
  it('at s = 1 the formula puts the first saturation near 52% utilisation, and the expected-share and measured values agree with it', () => {
    const est = saturationEstimate(1);
    expect(est).toBeCloseTo(0.5167, 3);
    const exact = saturationAt(expectedShares(1));
    expect(Math.abs(exact - est) / est).toBeLessThan(0.2);
    const stream = makeStream({ seed: 3, skew: 1, readShare: 0.5, requests: 100_000 });
    const loads = plainLoads(stream);
    const measured = saturationAt(loads.map((x) => x / stream.length));
    expect(Math.abs(measured - exact) / exact).toBeLessThan(0.05);
    expect(exact).toBeLessThan(0.6);
  });

  it('uniform keys (s = 0) saturate near full utilisation: key placement alone leaves the hottest shard within 25% of the mean', () => {
    const s = summarise(shardLoads(makeStream({ seed: 1, skew: 0, readShare: 0.5, requests: 100_000 }), mit('none'), 0), 0.5);
    expect(s.maxOverMean).toBeGreaterThan(1);
    expect(s.maxOverMean).toBeLessThan(1.25);
    expect(s.saturatesAt).toBeGreaterThan(0.8);
  });

  it('the hottest shard is the one holding key 1, once the skew is strong enough that one key dominates', () => {
    const stream = makeStream({ seed: 2, skew: 1.5, readShare: 0.5 });
    expect(summarise(shardLoads(stream, mit('none'), 1.5), 0.5).hottestShard).toBe(shardOf(1));
  });

  it('hottest load is utilisation times shards times the hottest share: at 50% a shard past 100% of its capacity is overloaded while the cluster is half used', () => {
    const l = shardLoads(makeStream({ seed: 4, skew: 1.2, readShare: 0.5 }), mit('none'), 1.2);
    const s = summarise(l, 0.5);
    expect(s.hottestLoad).toBeGreaterThan(1);
    expect(s.hottestLoad).toBeCloseTo(0.5 * SHARDS * Math.max(...l.loads) / REQUESTS, 9);
  });
});

describe('mitigations', () => {
  const grid = (kind: MitigationKind) => [0.5, 1, 1.5].flatMap((skew) => [0.2, 0.8].flatMap((readShare) => [2, 4, 8].flatMap((m) => [0, 0.5, 0.9].map((hit) => ({ skew, readShare, m, hit, kind })))));

  it('conservation: shard requests = requests - cached reads + extra gather and replication work, for every mitigation on a grid of settings', () => {
    for (const kind of ['none', 'salt', 'split', 'cache', 'replicate'] as const) {
      for (const g of grid(kind)) {
        const stream = makeStream({ seed: 9, skew: g.skew, readShare: g.readShare, requests: 6_000 });
        const l = shardLoads(stream, mit(kind, { m: g.m, hit: g.hit }), g.skew);
        expect(l.loads.reduce((a, b) => a + b, 0), `${kind} ${JSON.stringify(g)}`).toBe(l.requests - l.absorbed + l.extra);
        if (kind === 'none' || kind === 'split') expect([l.absorbed, l.extra]).toEqual([0, 0]);
      }
    }
  });

  it('salting: the hot key\'s writes land on its m sub-keys at p1 / m each (within tolerance), and every read of it fans out to exactly m', () => {
    for (const m of [2, 4, 8]) {
      const stream = makeStream({ seed: 5, skew: 1, readShare: 0.5, requests: 100_000 });
      const writes = stream.filter((r) => r.key === 1 && !r.read);
      const per = new Array<number>(m).fill(0);
      for (const w of writes) per[Math.floor(w.u1 * m)]++;
      for (const c of per) expect(Math.abs(c / writes.length - 1 / m)).toBeLessThan(0.05);
      const reads = stream.filter((r) => r.key === 1 && r.read).length;
      const l = shardLoads(stream, mit('salt', { m }), 1);
      expect(l.extra).toBe(reads * (m - 1));
    }
  });

  it('salting fixes write skew and costs the readers; a cache fixes read skew and does nothing for writes (read-only against write-only streams)', () => {
    const maxRatio = (readShare: number, m: Mitigation) => summarise(shardLoads(makeStream({ seed: 6, skew: 1, readShare, requests: 40_000 }), m, 1), 0.5).maxOverMean;
    const writesOnly = 0;
    const readsOnly = 1;
    expect(maxRatio(writesOnly, mit('salt', { m: 8, hot: hottestKeys(10) }))).toBeLessThan(maxRatio(writesOnly, mit('none')) * 0.85);
    expect(maxRatio(writesOnly, mit('cache', { hit: 0.9 }))).toBeCloseTo(maxRatio(writesOnly, mit('none')), 9);
    expect(maxRatio(readsOnly, mit('cache', { hit: 0.9 }))).toBeLessThan(maxRatio(readsOnly, mit('none')) * 0.85);
    const reads = makeStream({ seed: 6, skew: 1.2, readShare: 1, requests: 10_000 });
    expect(shardLoads(reads, mit('salt', { m: 8 }), 1.2).extra).toBeGreaterThan(0);
  });

  it('replication spreads hot reads but updates every replica on a write', () => {
    const stream = makeStream({ seed: 7, skew: 1.2, readShare: 0.9, requests: 40_000 });
    const none = summarise(shardLoads(stream, mit('none'), 1.2), 0.5).maxOverMean;
    const rep = shardLoads(stream, mit('replicate', { m: 4 }), 1.2);
    expect(summarise(rep, 0.5).maxOverMean).toBeLessThan(none);
    expect(rep.extra).toBe(stream.filter((r) => r.key === 1 && !r.read).length * 3);
  });

  it('splitting moves the other keys off the hot shard, helping a little but never fixing a single hot key', () => {
    const stream = makeStream({ seed: 8, skew: 1.2, readShare: 0.5, requests: 40_000 });
    const none = shardLoads(stream, mit('none'), 1.2);
    const split = shardLoads(stream, mit('split'), 1.2);
    const hotShard = shardOf(1);
    expect(split.loads[hotShard]).toBeLessThan(none.loads[hotShard]);
    expect(split.loads[hotShard]).toBeGreaterThanOrEqual(stream.filter((r) => r.key === 1).length);
    const table = splitTable(1.2, hottestKeys(1));
    expect(table[1]).toBe(hotShard);
    expect(table.slice(1).filter((s) => s === hotShard)).toHaveLength(1);
  });

  it('broken variant: salting reads without a gather returns partial data, and the single-node oracle shows the missing writes', () => {
    const stream = makeStream({ seed: 12, skew: 1.3, readShare: 0.5, requests: 6_000 });
    const at = stream.findIndex((r, i) => r.read && r.key === 1 && i > 3_000);
    const oracle = stream.slice(0, at).map((r, i) => (!r.read && r.key === 1 ? i : -1)).filter((i) => i >= 0);
    expect(saltedReadResult(stream, at, 4, true)).toEqual(oracle);
    const partial = saltedReadResult(stream, at, 4, false);
    expect(partial.length).toBeLessThan(oracle.length);
    expect(partial.every((i) => oracle.includes(i))).toBe(true);
    const broken = shardLoads(stream, mit('salt', { m: 4, readsWithoutGather: true }), 1.3);
    expect(broken.partialReads).toBe(stream.filter((r) => r.key === 1 && r.read).length);
    expect(shardLoads(stream, mit('salt', { m: 4 }), 1.3).partialReads).toBe(0);
  });
});

describe('finding the hot keys with a count-min sketch', () => {
  const stream = makeStream({ seed: 1, skew: 1, readShare: 0.5 });
  it('a roomy sketch flags exactly the keys carrying at least 3% of the stream', () => {
    const d = detect(stream, 512);
    expect(d.hot).toEqual([1, 2, 3, 4]);
    expect(d.missed).toEqual([]);
    expect(d.flagged.every((k) => d.hot.includes(k))).toBe(true);
  });
  it('a sketch that is too small misses a hot key (the candidate set fills with colliding cold keys), for some hash seed', () => {
    const hits = [4, 6, 8, 12].flatMap((w) => Array.from({ length: 60 }, (_, seed) => detect(stream, w, seed))).filter((d) => d.missed.length > 0);
    expect(hits.length).toBeGreaterThan(0);
    const d = hits[0];
    expect(d.hot.some((k) => d.missed.includes(k))).toBe(true);
  });
  it('detection is judged against true counts: the hot set is the keys at or above the share, counted straight from the stream', () => {
    const counts = new Map<number, number>();
    for (const r of stream) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
    const truth = [...counts].filter(([, n]) => n >= HOT_SHARE * stream.length).map(([k]) => k).sort((a, b) => a - b);
    expect(detect(stream, 512).hot).toEqual(truth);
  });
});

describe('a hot key that moves in time', () => {
  it('salting made for yesterday\'s hot keys leaves the second half unbalanced, and following the hot keys fixes it', () => {
    const skew = 1;
    const stream = makeStream({ seed: 3, skew, readShare: 0.2, burst: true });
    const stale = burstLoads(stream, hottestKeys(12), 8, skew);
    const moved = new Set([...hottestKeys(12)].map((k) => ((k - 1 + BURST_SHIFT) % KEYS) + 1));
    const adaptive = burstLoads(stream, moved, 8, skew);
    const ratio = (l: { loads: number[] }) => Math.max(...l.loads) / (l.loads.reduce((a, b) => a + b, 0) / SHARDS);
    expect(ratio(stale.second)).toBeGreaterThan(ratio(stale.first) * 1.2);
    expect(ratio(adaptive.second)).toBeLessThan(ratio(stale.second) * 0.85);
  });
});
