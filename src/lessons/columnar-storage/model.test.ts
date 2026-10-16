import { describe, expect, it } from 'vitest';
import { canDelta, codeWidth, decode, encode, encodedBits, encodedBytes, zigzag, type Encoding } from './encode';
import {
  PAGE_SIZES, QUERIES, answerFrom, columnStore, compare, neededFields, rowStore, tableFor, touchedPages, type QueryId,
} from './layout';
import { COLUMNS, DEFAULT_TABLE, FIELD_BYTES, ROW_BYTES, SORT_KEYS, TARGET_ID, columnOf, isNumeric, randomTable, sortRows, type Cell, type Table } from './table';
import { BATCH_VALUES, batchSizes, callsPerBatch, callsPerRow } from './vector';
import { CHUNK_BYTES, CHUNKS_PER_GROUP, GROUP_ROWS, THRESHOLD_MAX, filteredSum, rowGroups } from './zones';
import { mulberry32, randInt } from '../../core/random';

const SEEDS = 200;
const seeded = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('the page layouts: the hand-worked case', () => {
  it('16 rows x 5 fixed 4-byte fields on 64-byte pages: 3 rows a page, 6 pages = 384 B for SUM(price); the column store 64 B; ratio 6', () => {
    expect(ROW_BYTES).toBe(20);
    expect(Math.floor(64 / ROW_BYTES)).toBe(3);
    expect(Math.ceil(16 / 3)).toBe(6);
    const c = compare('sum-price', DEFAULT_TABLE, 64);
    expect(c.row.pages).toHaveLength(6);
    expect(c.row.bytes).toBe(384);
    expect(c.column.pages).toHaveLength(1);
    expect(c.column.bytes).toBe(64);
    expect(c.ratio).toBe(6);
    expect(c.cheaper).toBe('column');
  });

  it('the page counts equal floor and ceil at every page size, for tables of 1 to 40 rows', () => {
    for (const pageBytes of PAGE_SIZES) {
      for (let n = 1; n <= 40; n++) {
        const t = randomTable(n, n);
        const perPage = Math.floor(pageBytes / ROW_BYTES);
        expect(rowStore(t, pageBytes).pages).toHaveLength(Math.ceil(n / perPage));
        const valuesPerPage = pageBytes / FIELD_BYTES;
        expect(columnStore(t, pageBytes).pages).toHaveLength(COLUMNS.length * Math.ceil(n / valuesPerPage));
      }
    }
  });

  it('no row straddles two pages, and every field of every row is stored exactly once in each layout', () => {
    for (const pageBytes of PAGE_SIZES) {
      for (const layout of [rowStore(DEFAULT_TABLE, pageBytes), columnStore(DEFAULT_TABLE, pageBytes)]) {
        const seen = new Map<string, number>();
        const rowPage = new Map<number, Set<number>>();
        for (const p of layout.pages) {
          for (const s of p.slots) {
            if (!s) continue;
            const key = `${s.row}:${s.col}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            if (layout.kind === 'row') rowPage.set(s.row, (rowPage.get(s.row) ?? new Set()).add(p.index));
          }
        }
        expect(seen.size).toBe(DEFAULT_TABLE.length * COLUMNS.length);
        expect([...seen.values()].every((k) => k === 1)).toBe(true);
        if (layout.kind === 'row') expect([...rowPage.values()].every((pages) => pages.size === 1)).toBe(true);
      }
    }
  });

  it('the five queries at 64 B: the point read and the insert favour the row store, the scans the column store, the single-price update ties', () => {
    const r = (q: QueryId) => {
      const c = compare(q, DEFAULT_TABLE, 64);
      return [c.row.pages.length, c.column.pages.length, c.cheaper];
    };
    expect(r('sum-price')).toEqual([6, 1, 'column']);
    expect(r('avg-qty-nl')).toEqual([6, 2, 'column']);
    expect(r('point')).toEqual([1, 5, 'row']);
    expect(r('insert')).toEqual([1, 5, 'row']);
    expect(r('update')).toEqual([1, 1, 'tie']);
  });

  it('bytes touched uses one function for both sides: on a one-column table the two layouts coincide and report the same pages', () => {
    for (const pageBytes of PAGE_SIZES) {
      for (let n = 1; n <= 40; n++) {
        const t = randomTable(n, n);
        const need = new Set(t.map((_, i) => `${i}:price`));
        const row = rowStore(t, pageBytes, ['price']);
        const col = columnStore(t, pageBytes, ['price']);
        expect(touchedPages(row, need)).toHaveLength(touchedPages(col, need).length);
        expect(row.pages).toHaveLength(col.pages.length);
      }
    }
  });
});

describe('queries read the right values from the layouts', () => {
  const naive = (q: QueryId, t: Table) => {
    const tt = tableFor(q, t);
    if (q === 'sum-price') return tt.reduce((s, r) => s + r.price, 0);
    if (q === 'avg-qty-nl') {
      const nl = tt.filter((r) => r.country === 'NL');
      return nl.length === 0 ? null : nl.reduce((s, r) => s + r.qty, 0) / nl.length;
    }
    if (q === 'point') {
      const r = tt.find((x) => x.id === TARGET_ID)!;
      return COLUMNS.map((c) => r[c]);
    }
    return null;
  };

  it('SUM, AVG and the point lookup, computed from the row layout and from the column layout, equal a naive reduce for 200 seeded tables', () => {
    for (const seed of seeded(SEEDS)) {
      const t = randomTable(seed, 8 + (seed % 20));
      for (const q of QUERIES) {
        const pageBytes = PAGE_SIZES[seed % PAGE_SIZES.length];
        const c = compare(q.id, t, pageBytes);
        const expected = naive(q.id, t);
        expect(answerFrom(c.row.layout, c.row.pages, q.id, t), `row ${q.id} seed ${seed}`).toEqual(expected);
        expect(answerFrom(c.column.layout, c.column.pages, q.id, t), `col ${q.id} seed ${seed}`).toEqual(expected);
      }
    }
  });

  it('a layout that touched too few pages would give a wrong answer: dropping a touched page changes SUM(price)', () => {
    const c = compare('sum-price', DEFAULT_TABLE, 32);
    expect(c.row.pages.length).toBeGreaterThan(1);
    const fewer = c.row.pages.slice(1);
    expect(answerFrom(c.row.layout, fewer, 'sum-price', DEFAULT_TABLE)).not.toBe(naive('sum-price', DEFAULT_TABLE));
  });

  it('an INSERT is planned on the table with its new row appended, and writes the page that holds that row', () => {
    const c = compare('insert', DEFAULT_TABLE, 64);
    expect(c.table).toHaveLength(DEFAULT_TABLE.length + 1);
    const need = neededFields('insert', DEFAULT_TABLE);
    expect([...need].every((k) => k.startsWith('16:'))).toBe(true);
    expect(need.size).toBe(COLUMNS.length);
  });
});

describe('encodings', () => {
  const columns = (): Cell[][] => {
    const out: Cell[][] = [[], [7], [3, 3, 3, 3], Array.from({ length: 30 }, (_, i) => i * 1000)];
    for (const seed of seeded(1000)) {
      const rnd = mulberry32(seed);
      const n = randInt(1, 40, rnd);
      const span = [1, 2, 4, 20, 10000][seed % 5];
      out.push(Array.from({ length: n }, () => randInt(0, span, rnd)));
    }
    return out;
  };
  const kinds: Encoding[] = ['none', 'rle', 'dict', 'delta'];

  it('decode(encode(col)) equals col for none, run-length, dictionary and delta on 1,000 seeded columns, plus empty, single, constant and all-distinct ones', () => {
    for (const col of columns()) {
      for (const k of kinds) expect(decode(encode(col, k)), `${k} ${JSON.stringify(col)}`).toEqual(col);
    }
  });

  it('text columns round-trip through every encoding that applies, and delta refuses them', () => {
    const text: Cell[] = ['NL', 'NL', 'DE', 'NL', 'FR', 'FR'];
    for (const k of ['none', 'rle', 'dict'] as Encoding[]) expect(decode(encode(text, k))).toEqual(text);
    expect(canDelta(text)).toBe(false);
    expect(() => encode(text, 'delta')).toThrow();
  });

  it('dictionary code width is ceil(log2 distinct) from a bit-count check, and one distinct value needs 0 bits', () => {
    for (let d = 1; d <= 300; d++) {
      let bitsNeeded = 0;
      while (2 ** bitsNeeded < d) bitsNeeded++;
      expect(codeWidth(d)).toBe(bitsNeeded);
      expect(codeWidth(d)).toBe(d === 1 ? 0 : Math.ceil(Math.log2(d)));
    }
    expect(codeWidth(0)).toBe(0);
    expect(encodedBits(encode([5, 5, 5, 5], 'dict'))).toBe(32); // one dictionary entry, and four codes of no bits
  });

  it('hand-worked sizes on the default table: country sorted is 4 runs = 20 B, in insert order 14 runs = 70 B, a dictionary of 4 is 20 B, sorted prices as deltas 122 bits = 16 B', () => {
    const sorted = columnOf(sortRows(DEFAULT_TABLE, 'country'), 'country');
    expect(sorted.join('')).toBe('DEDEDEDEFRFRFRNLNLNLNLNLNLUSUSUS');
    expect(encodedBytes(encode(sorted, 'rle'))).toBe(20);
    expect(encodedBytes(encode(columnOf(DEFAULT_TABLE, 'country'), 'rle'))).toBe(70);
    expect(encodedBytes(encode(columnOf(DEFAULT_TABLE, 'country'), 'dict'))).toBe(20);
    const prices = columnOf(sortRows(DEFAULT_TABLE, 'price'), 'price') as number[];
    expect(prices).toEqual([8, 9, 12, 15, 17, 23, 28, 30, 33, 42, 45, 52, 60, 66, 75, 99]);
    const steps = prices.slice(1).map((p, i) => p - prices[i]);
    expect(Math.max(...steps)).toBe(24);
    expect(zigzag(24)).toBe(48);
    expect(encodedBits(encode(prices, 'delta'))).toBe(32 + 15 * 6);
    expect(encodedBytes(encode(prices, 'delta'))).toBe(16);
    expect(encodedBytes(encode(columnOf(DEFAULT_TABLE, 'id'), 'none'))).toBe(64);
  });

  it('a sorted column never encodes bigger than the same values in insert order under run-length, over 200 seeded columns', () => {
    for (const seed of seeded(SEEDS)) {
      const t = randomTable(seed, 16);
      const unsorted = encodedBytes(encode(columnOf(t, 'country'), 'rle'));
      const sorted = encodedBytes(encode(columnOf(sortRows(t, 'country'), 'country'), 'rle'));
      expect(sorted).toBeLessThanOrEqual(unsorted);
    }
  });

  it('broken variant: a delta that drops the sign bit (no zigzag) fails the round trip on a falling column', () => {
    const falling = [50, 40, 45, 10];
    const unsigned = falling.slice(1).map((v, i) => Math.abs(v - falling[i]));
    const rebuilt = unsigned.reduce<number[]>((out, d) => [...out, out[out.length - 1] + d], [falling[0]]);
    expect(rebuilt).not.toEqual(falling);
    expect(decode(encode(falling, 'delta'))).toEqual(falling);
  });

  it('every column of the default table is numeric or text as the encoder assumes', () => {
    for (const c of COLUMNS) expect(canDelta(columnOf(DEFAULT_TABLE, c))).toBe(isNumeric(c));
  });
});

describe('zone maps', () => {
  const naiveSum = (t: Table, th: number) => t.filter((r) => r.qty > th).reduce((s, r) => s + r.price, 0);

  it('skipping never changes the answer: the filtered sum equals a naive scan, on 200 seeded tables, every threshold and every sort', () => {
    for (const seed of seeded(SEEDS)) {
      const t = randomTable(seed, 16);
      for (const sort of SORT_KEYS) {
        const rows = sortRows(t, sort.value);
        for (let th = 0; th <= THRESHOLD_MAX; th++) {
          const withSkip = filteredSum(rows, th, 'max');
          expect(withSkip.sum).toBe(naiveSum(t, th));
          expect(withSkip.sum).toBe(filteredSum(rows, th, 'off').sum);
        }
      }
    }
  });

  it('the skipped count is the number of groups whose max is at most the threshold, counted from the raw rows', () => {
    for (const seed of seeded(SEEDS)) {
      const rows = sortRows(randomTable(seed, 16), 'qty');
      for (let th = 0; th <= THRESHOLD_MAX; th++) {
        let expected = 0;
        for (let g = 0; g < rows.length / GROUP_ROWS; g++) {
          const qtys = rows.slice(g * GROUP_ROWS, (g + 1) * GROUP_ROWS).map((r) => r.qty);
          if (Math.max(...qtys) <= th) expected++;
        }
        const run = filteredSum(rows, th, 'max');
        expect(run.skippedGroups).toHaveLength(expected);
        expect(run.bytesSkipped).toBe(expected * CHUNKS_PER_GROUP * CHUNK_BYTES);
        expect(run.bytesSkipped + run.bytesRead).toBe(4 * CHUNKS_PER_GROUP * CHUNK_BYTES);
      }
    }
  });

  it('hand-worked: the default table in insert order skips 0 groups at qty > 8, and sorted by qty skips 3 (groups of 4 sorted: maxima 3, 5, 8, 12)', () => {
    expect(filteredSum(DEFAULT_TABLE, 8, 'max').skippedGroups).toEqual([]);
    expect(rowGroups(sortRows(DEFAULT_TABLE, 'qty')).map((g) => g.qtyMax)).toEqual([3, 5, 8, 12]);
    expect(filteredSum(sortRows(DEFAULT_TABLE, 'qty'), 8, 'max').skippedGroups).toEqual([0, 1, 2]);
  });

  it('broken variant: a skip rule that tests the min instead of the max drops rows the filter needs, so its answers differ', () => {
    let differs = 0;
    for (const seed of seeded(SEEDS)) {
      const t = randomTable(seed, 16);
      for (let th = 0; th <= THRESHOLD_MAX; th++) if (filteredSum(t, th, 'min').sum !== naiveSum(t, th)) differs++;
    }
    expect(differs).toBeGreaterThan(0);
    expect(filteredSum(DEFAULT_TABLE, 8, 'min').sum).not.toBe(naiveSum(DEFAULT_TABLE, 8));
  });
});

describe('vectorised scans count calls, not seconds', () => {
  it('one call per row is n and one per batch is ceil(n / 1024), checked against batch sizes that sum to n', () => {
    for (const n of [1, 2, 1023, 1024, 1025, 2048, 5000, 1_000_000, 1_000_000_000]) {
      expect(callsPerRow(n)).toBe(n);
      expect(callsPerBatch(n)).toBe(batchSizes(n).length);
      expect(batchSizes(n).reduce((a, b) => a + b, 0)).toBe(n);
      expect(batchSizes(n).every((s) => s >= 1 && s <= BATCH_VALUES)).toBe(true);
    }
    expect(callsPerBatch(1_000_000)).toBe(977);
  }, 20_000);
});
