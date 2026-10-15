import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BUCKETS, INDEX_FANOUT, asMultiset, bruteForce, cheapestAndDearest, costTable, hasKey, hashJoin, hashPlan, mergeJoin, nestedLoop, sortByKey, treeHeight,
  type Row, type Tables,
} from './join';
import { DEFAULT_SPEC, KEY_RANGE, makeTables, parseKey, withEdits, NO_EDITS, type TableSpec } from './tables';

/** A random table pair, written here and not taken from tables.ts: duplicates on both sides and NULL keys. */
function randomTables(seed: number, opts: { unique?: boolean; nulls?: boolean; max?: number } = {}): Tables {
  const rnd = mulberry32(seed);
  const pool = 1 + Math.floor(rnd() * 6);
  const size = () => Math.floor(rnd() * (opts.max ?? 12));
  const rows = (n: number): Row[] =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, key: opts.nulls !== false && rnd() < 0.2 ? null : opts.unique ? i + 1 : Math.floor(rnd() * pool) - 1 }));
  return { a: rows(size()), b: rows(size()) };
}
const nonNull = (rows: readonly Row[]) => rows.filter((r) => r.key !== null).length;
const BY_HAND: Tables = {
  a: [{ id: 1, key: 1 }, { id: 2, key: 2 }, { id: 3, key: 2 }, { id: 4, key: 4 }],
  b: [{ id: 1, key: 2 }, { id: 2, key: 2 }, { id: 3, key: 3 }, { id: 4, key: 4 }],
};

describe('all three algorithms equal the brute-force cross product (1,000 seeded table pairs)', () => {
  it('as multisets, with duplicates on both sides and NULL keys that never match', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const t = randomTables(seed);
      const want = asMultiset(bruteForce(t, 'eq'));
      const memory = 2 + (seed % 7);
      expect(asMultiset(nestedLoop(t, 'eq', false).pairs), `nested ${seed}`).toEqual(want);
      expect(asMultiset(nestedLoop(t, 'eq', true).pairs), `index nested ${seed}`).toEqual(want);
      expect(asMultiset(hashJoin(t, memory).pairs), `hash ${seed} memory ${memory}`).toEqual(want);
      expect(asMultiset(hashJoin(t, Number.MAX_SAFE_INTEGER).pairs), `hash in memory ${seed}`).toEqual(want);
      expect(asMultiset(mergeJoin(t, false).pairs), `merge ${seed}`).toEqual(want);
      expect(asMultiset(mergeJoin(t, true).pairs), `merge presorted ${seed}`).toEqual(want);
    }
  });

  it('a.key < b.key by nested loop equals the brute-force filter', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const t = randomTables(seed);
      expect(asMultiset(nestedLoop(t, 'lt', false).pairs), `${seed}`).toEqual(asMultiset(bruteForce(t, 'lt')));
    }
  });

  it('a NULL key matches nothing, not even another NULL', () => {
    const t: Tables = { a: [{ id: 1, key: null }, { id: 2, key: 1 }], b: [{ id: 1, key: null }, { id: 2, key: 1 }] };
    for (const pairs of [nestedLoop(t, 'eq', false).pairs, nestedLoop(t, 'eq', true).pairs, hashJoin(t, 2).pairs, mergeJoin(t, false).pairs]) expect(pairs).toEqual([[2, 2]]);
  });

  it('a broken variant that joins NULL = NULL is caught by the same comparison', () => {
    const t: Tables = { a: [{ id: 1, key: null }], b: [{ id: 1, key: null }] };
    const nullEqualsNull = t.a.flatMap((a) => t.b.filter((b) => a.key === b.key).map((b) => [a.id, b.id] as const));
    expect(asMultiset(nullEqualsNull)).not.toEqual(asMultiset(bruteForce(t, 'eq')));
  });
});

describe('the counters match closed forms and hand-worked vectors', () => {
  it('nested loop makes |R| x |S| comparisons', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = randomTables(seed);
      expect(nestedLoop(t, 'eq', false).work).toBe(t.a.length * t.b.length);
    }
  });

  it('index nested loop makes one probe of `height` node visits per non-NULL outer row: |R| x height without NULLs', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = randomTables(seed, { nulls: false });
      expect(nestedLoop(t, 'eq', true).work).toBe(t.a.length * treeHeight(t.b.length));
    }
    for (let seed = 1; seed <= 200; seed++) {
      const t = randomTables(seed);
      expect(nestedLoop(t, 'eq', true).work).toBe(nonNull(t.a) * treeHeight(t.b.length));
    }
  });

  it('tree height is the smallest h with 4^h >= n', () => {
    expect([1, 2, 4, 5, 16, 17, 64, 65].map(treeHeight)).toEqual([1, 1, 1, 2, 2, 3, 3, 4]);
    for (let n = 1; n <= 300; n++) {
      const h = treeHeight(n);
      expect(INDEX_FANOUT ** h).toBeGreaterThanOrEqual(n);
      if (h > 1) expect(INDEX_FANOUT ** (h - 1)).toBeLessThan(n);
    }
  });

  it('hash join makes |build| + |probe| operations (non-NULL rows), whatever the memory', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const t = randomTables(seed);
      const expected = nonNull(t.a) + nonNull(t.b);
      for (const memory of [2, 3, 5, 1000]) expect(hashJoin(t, memory).work, `${seed} ${memory}`).toBe(expected);
    }
  });

  it('merge join: advances stay within |R| + |S| for unique keys', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const t = randomTables(seed, { unique: true, nulls: false });
      const run = mergeJoin(t, true);
      expect(run.advances, `${seed}`).toBeLessThanOrEqual(t.a.length + t.b.length);
      expect(run.rewinds).toBe(0);
    }
  });

  it('merge sort: [3, 1, 2] sorts in 3 comparisons and the result equals Array.sort', () => {
    const rows = [3, 1, 2].map((key, i) => ({ id: i + 1, key }));
    expect(sortByKey(rows).comparisons).toBe(3);
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      const xs = Array.from({ length: Math.floor(rnd() * 20) }, (_, i) => ({ id: i + 1, key: Math.floor(rnd() * 8) }));
      const { sorted, comparisons } = sortByKey(xs);
      expect(sorted.map((r) => r.key)).toEqual(xs.map((r) => r.key).sort((p, q) => p - q));
      expect(comparisons).toBeLessThanOrEqual(xs.length * Math.ceil(Math.log2(Math.max(2, xs.length))));
    }
  });

  it('the hand-worked join A [1,2,2,4] with B [2,2,3,4]: 5 pairs; 16 comparisons nested, 4 with an index; 8 hash operations; merge 11 comparisons, 10 advances, 1 rewind', () => {
    expect(asMultiset(bruteForce(BY_HAND, 'eq'))).toEqual(['2-1', '2-2', '3-1', '3-2', '4-4']);
    expect(nestedLoop(BY_HAND, 'eq', false).work).toBe(16);
    expect(nestedLoop(BY_HAND, 'eq', true)).toMatchObject({ work: 4, height: 1 });
    expect(hashJoin(BY_HAND, 99).work).toBe(8);
    const m = mergeJoin(BY_HAND, true);
    expect([m.work, m.advances, m.rewinds, m.pairs.length]).toEqual([11, 10, 1, 5]);
    expect(m.events.filter((e) => e.t === 'rewind')).toHaveLength(1);
  });

  it('sorting both sides is counted unless an index supplies the order', () => {
    const t = makeTables(DEFAULT_SPEC);
    const sorted = mergeJoin(t, true);
    const unsorted = mergeJoin(t, false);
    expect(sorted.sortComparisons).toBe(0);
    expect(unsorted.sortComparisons).toBe(sortByKey(t.a.filter(hasKey)).comparisons + sortByKey(t.b.filter(hasKey)).comparisons);
    expect(unsorted.work - sorted.work).toBe(unsorted.sortComparisons);
  });
});

describe('hash join spilling', () => {
  /** Independent count: rows with a non-NULL key whose partition is not 0, on both sides. */
  function spilledByDefinition(t: Tables, memory: number): number {
    const na = nonNull(t.a);
    const nb = nonNull(t.b);
    const build = Math.min(na, nb);
    if (build <= memory) return 0;
    const batches = Math.ceil(build / memory);
    const outside = (rows: readonly Row[]) => rows.filter((r) => r.key !== null && (((r.key % batches) + batches) % batches) !== 0).length;
    return outside(t.a) + outside(t.b);
  }

  it('rows spilled equals an independent count of the rows that land outside partition 0, for both sides', () => {
    let spilledAny = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const t = randomTables(seed, { max: 16 });
      for (const memory of [2, 3, 4, 7, 16]) {
        const run = hashJoin(t, memory);
        expect(run.rowsSpilled, `${seed} ${memory}`).toBe(spilledByDefinition(t, memory));
        if (run.rowsSpilled > 0) spilledAny++;
      }
    }
    expect(spilledAny).toBeGreaterThan(100);
  });

  it('nothing spills while the build side fits, and the partition count is ceil(build / memory)', () => {
    const t = makeTables(DEFAULT_SPEC);
    const plan = hashPlan(t, 1000);
    expect(plan).toMatchObject({ buildSide: 'a', buildRows: 8, probeRows: 12, batches: 1 });
    expect(hashJoin(t, 8).rowsSpilled).toBe(0);
    expect(hashPlan(t, 3).batches).toBe(3);
    expect(hashPlan(t, 2).batches).toBe(4);
    expect(hashJoin(t, 3).rowsSpilled).toBeGreaterThan(0);
  });

  it('builds from the smaller side', () => {
    const t = makeTables({ ...DEFAULT_SPEC, sizeA: 16, sizeB: 4 });
    expect(hashPlan(t, 100).buildSide).toBe('b');
    expect(hashPlan(t, 100).buildRows).toBe(4);
  });

  it('the bucket of a key is its remainder modulo the bucket count, also for negative keys', () => {
    const t: Tables = { a: [{ id: 1, key: -3 }], b: [{ id: 1, key: -3 }] };
    const run = hashJoin(t, 5);
    expect(run.pairs).toEqual([[1, 1]]);
    expect(run.events.find((e) => e.t === 'build')).toMatchObject({ bucket: BUCKETS - 3 });
  });
});

describe('the cost table', () => {
  const spec = (patch: Partial<TableSpec>) => makeTables({ ...DEFAULT_SPEC, ...patch });

  it('prices every algorithm in one unit, each from its own closed form', () => {
    const t = spec({});
    const rows = Object.fromEntries(costTable(t, 'eq').map((r) => [r.id, r.cost]));
    expect(rows.nested).toBe(8 * 12);
    expect(rows.indexNested).toBe(8 * treeHeight(12));
    expect(rows.hash).toBe(nonNull(t.a) + nonNull(t.b));
    expect(rows.merge).toBe(rows.mergeSorted! + mergeJoin(t, false).sortComparisons);
  });

  it('refuses hash and merge for a non-equality join, with a reason, and keeps only the nested loop', () => {
    const rows = costTable(spec({}), 'lt');
    expect(rows.filter((r) => r.cost !== null).map((r) => r.id)).toEqual(['nested']);
    for (const id of ['hash', 'merge', 'mergeSorted']) expect(rows.find((r) => r.id === id)!.refused).toMatch(/equality/);
  });

  it('a tiny outer table with an index on the inner key makes the index nested loop the cheapest; two large tables do not', () => {
    const tiny = costTable(spec({ oneCustomer: true, sizeB: 16 }), 'eq');
    expect(cheapestAndDearest(tiny).cheapest).toEqual(['indexNested']);
    const big = costTable(spec({ sizeA: 16, sizeB: 16 }), 'eq');
    const { cheapest, dearest } = cheapestAndDearest(big);
    expect(cheapest.every((id) => id === 'hash' || id === 'mergeSorted' || id === 'indexNested')).toBe(true);
    expect(dearest).toEqual(['nested']);
  });

  it('hash join is not always cheapest: on the one-customer table it loses to the index nested loop', () => {
    const rows = costTable(spec({ oneCustomer: true }), 'eq');
    expect(rows.find((r) => r.id === 'hash')!.cost!).toBeGreaterThan(rows.find((r) => r.id === 'indexNested')!.cost!);
  });

  it('does not depend on a memory limit: the table is the same whatever the hash scene is set to', () => {
    const t = spec({});
    const hashCost = costTable(t, 'eq').find((r) => r.id === 'hash')!.cost;
    for (const memory of [2, 3, 8, 1000]) expect(hashJoin(t, memory).work).toBe(hashCost);
  });
});

describe('the tables and typed keys', () => {
  it('the same spec gives the same tables, sizes clamp to 4-16, and a key edit changes only that row', () => {
    expect(makeTables(DEFAULT_SPEC)).toEqual(makeTables(DEFAULT_SPEC));
    expect(makeTables({ ...DEFAULT_SPEC, sizeA: 1, sizeB: 99 })).toMatchObject({ a: { length: 4 }, b: { length: 16 } });
    const t = makeTables(DEFAULT_SPEC);
    const edited = withEdits(t, { ...NO_EDITS, a: { 2: null } });
    expect(edited.a[0]).toEqual(t.a[0]);
    expect(edited.b).toEqual(t.b);
    expect(edited.a.find((r) => r.id === 2)!.key).toBeNull();
    expect(t.a.find((r) => r.id === 2)!.key).not.toBeNull();
  });

  it('many-to-many has duplicates on both sides, NULL keys appear in the NULL preset, one customer keeps one row', () => {
    const dup = (rows: readonly Row[]) => new Set(rows.map((r) => r.key)).size < rows.length;
    const m = makeTables({ ...DEFAULT_SPEC, shape: 'manyToMany' });
    expect(dup(m.a) && dup(m.b)).toBe(true);
    expect(makeTables({ ...DEFAULT_SPEC, shape: 'nulls' }).a.some((r) => r.key === null)).toBe(true);
    expect(makeTables({ ...DEFAULT_SPEC, oneCustomer: true }).a).toHaveLength(1);
    expect(bruteForce(makeTables({ ...DEFAULT_SPEC, oneCustomer: true, sizeB: 16 }), 'eq').length).toBeGreaterThan(0);
  });

  it('accepts a whole number or NULL and refuses everything else with a message', () => {
    expect(parseKey('7')).toEqual({ ok: true, value: 7 });
    expect(parseKey(' null ')).toEqual({ ok: true, value: null });
    expect(parseKey('-12')).toEqual({ ok: true, value: -12 });
    for (const bad of ['', 'abc', '1.5', '0x10', '1e3', `${KEY_RANGE.max + 1}`, `${KEY_RANGE.min - 1}`, 'NULLS', '--1']) {
      const r = parseKey(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });
});
