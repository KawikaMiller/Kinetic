import { describe, expect, it } from 'vitest';
import { harmonic, zipfPmf } from '../distributions';
import { mulberry32 } from '../random';
import { MAX_DEPTH, PRIME, TOP_K, UNIVERSE, cellValues, cellsOf, column, estimate, exactCounts, heavyRun, itemKey, keyOfRank, makeFamily, memory, mulmod, newSketch, quality, sketchOf, update, zipfStream } from './index';

describe('the hash family', () => {
  it('mulmod equals the exact product modulo p, checked against BigInt on 20,000 seeded pairs', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 20_000; i++) {
      const a = 1 + Math.floor(rnd() * (PRIME - 1));
      const x = Math.floor(rnd() * PRIME);
      expect(mulmod(a, x), `${a} ${x}`).toBe(Number((BigInt(a) * BigInt(x)) % BigInt(PRIME)));
    }
    expect(mulmod(PRIME - 1, PRIME - 1)).toBe(1);
    expect(mulmod(1, 5)).toBe(5);
  });

  it('each row maps 10,000 consecutive integers uniformly over w = 16 columns: chi-square below the 0.1% point for 15 degrees of freedom (37.7)', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const fam = makeFamily(seed, 4);
      for (let row = 0; row < 4; row++) {
        const counts = new Array<number>(16).fill(0);
        for (let x = 0; x < 10_000; x++) counts[column(fam, row, x, 16)]++;
        const expected = 10_000 / 16;
        const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
        expect(chi, `seed ${seed} row ${row}`).toBeLessThan(37.7);
      }
    }
  });

  it('rows use their own hash: two rows send most items to different columns', () => {
    const fam = makeFamily(3, 2);
    let same = 0;
    for (let r = 0; r < 500; r++) if (column(fam, 0, keyOfRank(r), 64) === column(fam, 1, keyOfRank(r), 64)) same++;
    expect(same).toBeLessThan(50);
  });

  it('is deterministic: a seed gives one family, and a key always lands in one column per row', () => {
    expect(makeFamily(9, 5)).toEqual(makeFamily(9, 5));
    expect(makeFamily(9, 5)).not.toEqual(makeFamily(10, 5));
    const s = newSketch(16, 4, makeFamily(2, 4));
    const x = itemKey('apple');
    expect(cellsOf(s, x)).toEqual(cellsOf(s, x));
    cellsOf(s, x).forEach((c, row) => expect(c.col).toBe(column(s.fam, row, x, 16)));
  });
});

describe('the sketch', () => {
  it('the estimate is the minimum of the d touched cells, recomputed from the grid, and never below the truth, over 200 seeded streams', () => {
    for (let seed = 0; seed < 200; seed++) {
      const stream = zipfStream(400, 0.6 + (seed % 11) / 10, seed, 50);
      const w = 4 + (seed % 5) * 8;
      const d = 1 + (seed % MAX_DEPTH);
      const s = sketchOf(stream, w, d, seed);
      const counts = exactCounts(stream, 50);
      for (let r = 0; r < 50; r++) {
        const key = keyOfRank(r);
        const byHand = Math.min(...cellsOf(s, key).map((c) => s.counts[c.row * w + c.col]));
        expect(estimate(s, key), `seed ${seed} item ${r}`).toBe(byHand);
        expect(byHand).toBeGreaterThanOrEqual(counts[r]);
      }
      expect(s.total).toBe(stream.length);
    }
  });

  it('a row sums to the stream length, and a width above the distinct count with no collision is exact', () => {
    const stream = zipfStream(300, 1.1, 4, 30);
    const s = sketchOf(stream, 64, 3, 4);
    for (let row = 0; row < 3; row++) expect(Array.from(s.counts.slice(row * 64, (row + 1) * 64)).reduce((a, b) => a + b, 0)).toBe(300);
    const one = newSketch(64, 3, makeFamily(1, 3));
    update(one, itemKey('a'), 3);
    expect(estimate(one, itemKey('a'))).toBe(3);
    expect(estimate(one, itemKey('never-seen'))).toBeLessThanOrEqual(3);
  });

  it('the mean of the d cells overcounts at least as much as the minimum, on every item', () => {
    const stream = zipfStream(2_000, 1.2, 3);
    const s = sketchOf(stream, 32, 4, 3);
    for (let r = 0; r < 200; r++) expect(estimate(s, keyOfRank(r), 'mean')).toBeGreaterThanOrEqual(estimate(s, keyOfRank(r), 'min'));
    expect(cellValues(s, keyOfRank(0))).toHaveLength(4);
  });
});

describe('the Zipf stream', () => {
  it('follows the Zipf pmf: the share of rank 1 over 50,000 draws is within 0.01 of 1 / H(n, s)', () => {
    const stream = zipfStream(50_000, 1.2, 9);
    const counts = exactCounts(stream);
    for (const r of [0, 1, 4]) expect(Math.abs(counts[r] / 50_000 - zipfPmf(r + 1, UNIVERSE, 1.2))).toBeLessThan(0.01);
    expect(zipfPmf(1, UNIVERSE, 1.2)).toBeCloseTo(1 / harmonic(UNIVERSE, 1.2), 12);
  });
});

describe('heavy hitters', () => {
  it('with w >= 272 at skew 1.2 the true top 5 are all among the candidates on every one of 50 seeds', () => {
    for (let seed = 0; seed < 50; seed++) {
      const stream = zipfStream(20_000, 1.2, seed);
      const state = heavyRun(stream, 272, 5, seed, stream.length);
      const q = quality(stream, state);
      expect(q.recall, `seed ${seed}`).toBe(1);
      expect(state.heap).toHaveLength(TOP_K);
    }
  });

  it('candidates are at most K, each estimate matches the sketch, and the memory comparison counts distinct items against d * w', () => {
    const stream = zipfStream(5_000, 1.2, 2);
    const state = heavyRun(stream, 128, 4, 2, 3_000);
    expect(state.heap.length).toBeLessThanOrEqual(TOP_K);
    for (const c of state.heap) expect(c.est).toBe(estimate(state.sketch, keyOfRank(c.item)));
    expect(state.seen).toBe(3_000);
    expect(memory(stream, state)).toEqual({ exact: new Set(stream.slice(0, 3_000)).size, sketch: 512 });
  });

  it('running to k items is the same as running to k from scratch, and a smaller sketch finds fewer of the top 5 on some seed', () => {
    const stream = zipfStream(10_000, 1.2, 1);
    expect(heavyRun(stream, 64, 3, 1, 4_000).heap).toEqual(heavyRun(stream.slice(0, 4_000), 64, 3, 1, 4_000).heap);
    let missed = 0;
    for (let seed = 0; seed < 50; seed++) {
      const s = zipfStream(10_000, 0.7, seed);
      if (quality(s, heavyRun(s, 8, 1, seed, s.length)).recall < 1) missed++;
    }
    expect(missed).toBeGreaterThan(0);
  });

  it('events record every entry and eviction, an eviction names the item that replaced it', () => {
    const stream = zipfStream(3_000, 1.0, 6);
    const state = heavyRun(stream, 64, 3, 6, 3_000);
    expect(state.events.filter((e) => e.kind === 'enter').length).toBeGreaterThanOrEqual(TOP_K);
    for (const e of state.events.filter((x) => x.kind === 'evict')) expect(e.by).toBeDefined();
    const alive = new Set<number>();
    for (const e of state.events) {
      if (e.kind === 'enter') alive.add(e.item);
      else {
        expect(alive.delete(e.item)).toBe(true);
        alive.add(e.by!);
      }
    }
    expect([...alive].sort()).toEqual(state.heap.map((c) => c.item).sort());
  });
});
