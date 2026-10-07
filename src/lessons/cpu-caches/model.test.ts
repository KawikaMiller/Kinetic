import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { levelById } from '../memory-hierarchy/model';
import {
  ADDRESS_BITS, ARRAYS, BASE, CACHE, illustrativeNs, L1_NS, lineOf, RAM_NS, sceneAddresses, sceneFor, simulateCache, splitAddress, tally,
  type CacheConfig, type LayoutId, type Order,
} from './model';

/**
 * Brute-force reference, written differently on purpose: every way stores a line and a
 * last-used timestamp; a lookup scans the ways, a miss fills the lowest empty way or evicts
 * the way with the smallest timestamp. The "three Cs" come from replaying the whole history:
 * compulsory = never seen before; capacity = the last `sets × ways` distinct lines touched
 * before this access don't include it (that's exactly a fully associative LRU's contents).
 */
function reference(addresses: readonly number[], cfg: CacheConfig) {
  const lines: (number | null)[][] = Array.from({ length: cfg.sets }, () => Array(cfg.ways).fill(null));
  const stamp: number[][] = Array.from({ length: cfg.sets }, () => Array(cfg.ways).fill(-1));
  return addresses.map((addr, t) => {
    const line = Math.floor(addr / cfg.lineBytes) * cfg.lineBytes;
    const set = Math.floor(addr / cfg.lineBytes) % cfg.sets;
    let way = lines[set].indexOf(line);
    const hit = way >= 0;
    let evicted: number | null = null;
    if (!hit) {
      way = lines[set].indexOf(null);
      if (way < 0) {
        way = stamp[set].indexOf(Math.min(...stamp[set]));
        evicted = lines[set][way];
      }
      lines[set][way] = line;
    }
    stamp[set][way] = t;
    const history = addresses.slice(0, t).map((a) => Math.floor(a / cfg.lineBytes) * cfg.lineBytes);
    const recent: number[] = [];
    for (let k = history.length - 1; k >= 0 && recent.length < cfg.sets * cfg.ways; k--) if (!recent.includes(history[k])) recent.push(history[k]);
    const kind = hit ? 'hit' : !history.includes(line) ? 'compulsory' : !recent.includes(line) ? 'capacity' : 'conflict';
    return { hit, way, evicted, kind };
  });
}

const CONFIGS: CacheConfig[] = [
  CACHE,
  { lineBytes: 16, sets: 1, ways: 4 },
  { lineBytes: 32, sets: 8, ways: 1 },
  { lineBytes: 64, sets: 2, ways: 4 },
  { lineBytes: 8, sets: 16, ways: 2 },
];

describe('simulateCache matches a brute-force reference', () => {
  it('on seeded random address streams, for direct-mapped, set-associative and fully associative caches', () => {
    const rnd = mulberry32(42);
    for (const cfg of CONFIGS) {
      for (let run = 0; run < 60; run++) {
        const span = cfg.lineBytes * cfg.sets * cfg.ways * randInt(1, 4, rnd);
        const addrs = Array.from({ length: randInt(1, 120, rnd) }, () => BASE + randInt(0, span - 1, rnd));
        const got = simulateCache(addrs, cfg);
        const want = reference(addrs, cfg);
        got.forEach((g, i) => {
          expect({ hit: g.hit, way: g.way, evicted: g.evicted, kind: g.kind }, `access ${i}`).toEqual(want[i]);
        });
      }
    }
  });
  it('and on every lesson scene', () => {
    for (const layout of ['small', 'wide', 'stride', 'structs'] as LayoutId[]) {
      for (const order of ['rows', 'cols'] as Order[]) {
        const addrs = sceneAddresses(sceneFor(layout, order));
        const got = simulateCache(addrs, CACHE);
        const want = reference(addrs, CACHE);
        expect(got.map((g) => g.kind)).toEqual(want.map((w) => w.kind));
      }
    }
  });
});

describe('hand-worked counts', () => {
  const run = (layout: LayoutId, order: Order) => tally(simulateCache(sceneAddresses(sceneFor(layout, order)), CACHE));
  it('8 × 8 int32 row-wise: exactly 4 misses in 64 accesses, all compulsory (4 lines of 16 ints)', () => {
    expect(run('small', 'rows')).toEqual({ hits: 60, misses: 4, compulsory: 4, capacity: 0, conflict: 0 });
  });
  it('8 × 8 column-wise: also 4 misses. The whole array (256 bytes) fits in the 512-byte cache', () => {
    expect(run('small', 'cols')).toEqual({ hits: 60, misses: 4, compulsory: 4, capacity: 0, conflict: 0 });
  });
  it('16 × 16 row-wise: 16 misses (one per 64-byte row); column-wise: every one of the 256 accesses misses', () => {
    expect(run('wide', 'rows')).toEqual({ hits: 240, misses: 16, compulsory: 16, capacity: 0, conflict: 0 });
    // a column touches 16 lines, the cache holds 8: by the time the loop comes back, LRU has thrown them out
    expect(run('wide', 'cols')).toEqual({ hits: 0, misses: 256, compulsory: 16, capacity: 240, conflict: 0 });
  });
  it('rows 64 ints apart: every row starts in set 0, so a column-wise walk is all conflict misses', () => {
    expect(run('stride', 'rows')).toEqual({ hits: 56, misses: 8, compulsory: 8, capacity: 0, conflict: 0 });
    expect(run('stride', 'cols')).toEqual({ hits: 0, misses: 64, compulsory: 8, capacity: 0, conflict: 56 });
    const sets = sceneFor('stride', 'rows').visits.filter(([, c]) => c === 0).map(([r]) => splitAddress(BASE + r * 64 * 4, CACHE).set);
    expect(new Set(sets)).toEqual(new Set([0]));
  });
  it('summing one field: array of structs touches 8 lines, struct of arrays 2', () => {
    expect(run('structs', 'rows')).toEqual({ hits: 24, misses: 8, compulsory: 8, capacity: 0, conflict: 0 });
    expect(run('structs', 'cols')).toEqual({ hits: 30, misses: 2, compulsory: 2, capacity: 0, conflict: 0 });
  });
  it('every loop visits every cell exactly once', () => {
    for (const layout of ['small', 'wide', 'stride', 'structs'] as LayoutId[]) {
      for (const order of ['rows', 'cols'] as Order[]) {
        const s = sceneFor(layout, order);
        const keys = s.visits.map(([r, c]) => `${r},${c}`);
        expect(new Set(keys).size).toBe(keys.length);
        if (layout !== 'structs') expect(keys.length).toBe(s.rows * s.cols);
      }
    }
  });
  it('declared strides give distinct, int-aligned addresses inside 16 bits', () => {
    for (const [id, a] of Object.entries(ARRAYS)) {
      const s = sceneFor(id as LayoutId, 'rows');
      const addrs = sceneAddresses(s);
      expect(new Set(addrs).size).toBe(a.rows * a.cols);
      for (const x of addrs) {
        expect(x % 4).toBe(0);
        expect(x).toBeLessThan(2 ** ADDRESS_BITS);
      }
    }
  });
});

describe('the address split', () => {
  const bitsOf = (n: number) => n.toString(2).padStart(ADDRESS_BITS, '0');
  for (const sets of [1, 2, 4, 8, 16, 32, 64]) {
    for (const lineBytes of [16, 64]) {
      it(`is exact for every 16-bit address with ${sets} sets of ${lineBytes}-byte lines`, () => {
        const cfg = { lineBytes, sets, ways: 2 };
        const offBits = Math.log2(lineBytes);
        const setBits = Math.log2(sets);
        for (let a = 0; a < 2 ** ADDRESS_BITS; a++) {
          const s = splitAddress(a, cfg);
          const b = bitsOf(a);
          const tagEnd = ADDRESS_BITS - offBits - setBits;
          expect(s.tag).toBe(tagEnd ? parseInt(b.slice(0, tagEnd), 2) : 0);
          expect(s.set).toBe(setBits ? parseInt(b.slice(tagEnd, tagEnd + setBits), 2) : 0);
          expect(s.offset).toBe(parseInt(b.slice(tagEnd + setBits), 2));
          expect(s.bits).toEqual({ tag: tagEnd, set: setBits, offset: offBits });
          // and it recombines
          expect(((s.tag * sets + s.set) * lineBytes) + s.offset).toBe(a);
          expect(lineOf(a, cfg)).toBe(a - s.offset);
        }
      });
    }
  }
  it('refuses a non-power-of-two cache', () => {
    expect(() => splitAddress(0, { lineBytes: 48, sets: 4, ways: 2 })).toThrow();
    expect(() => splitAddress(0, { lineBytes: 64, sets: 3, ways: 2 })).toThrow();
  });
});

describe('illustrative time', () => {
  it('uses memory-hierarchy\'s L1 and RAM figures', () => {
    expect(L1_NS).toBe(levelById('l1').ns);
    expect(RAM_NS).toBe(levelById('ram').ns);
  });
  it('is hits × L1 + misses × RAM', () => {
    expect(illustrativeNs({ hits: 60, misses: 4, compulsory: 4, capacity: 0, conflict: 0 })).toBe(60 + 400);
  });
});
