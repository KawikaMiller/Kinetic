import { describe, expect, it } from 'vitest';
import { lintLesson } from '../../core/lessonContent';
import { lintTier3Lesson } from '../../core/lessonContentT3';
import { TOPICS } from '../../core/curriculum';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements } from '../../core/testing/sceneKeys';
import { encodingCaption, layoutCaption, rowsCaption, skipCaption, vectorCaption, winTally } from './captions';
import { ENCODING_LABELS, encodingsFor, sizeReport } from './encode';
import { costs, encodingFacts, skipFacts, tiedQueries, vectorFacts } from './facts';
import { initialEncodingScene, initialLayoutScene, initialRowsScene, initialSkipScene, initialVectorScene } from './init';
import lesson from './index';
import { PAGE_SIZES, QUERIES, answerFrom, compare, type QueryId } from './layout';
import { COLUMNS, DEFAULT_TABLE, SORT_KEYS, columnOf, sortRows, withCell } from './table';
import { BATCH_VALUES, callsPerBatch, callsPerRow } from './vector';
import { THRESHOLD_MAX, filteredSum } from './zones';

const plain = (node: Parameters<typeof captionText>[0]) => captionText(node, { strict: true });

describe('each scene opens on the state its try-this assumes (a pure function, switched through all five scenes)', () => {
  it('layouts: SUM(price) on 64-byte pages with the original table', () => {
    expect(initialLayoutScene()).toEqual({ query: 'sum-price', pageBytes: 64, table: DEFAULT_TABLE });
  });
  it('rows: the whole-row lookup on 64-byte pages', () => {
    expect(initialRowsScene()).toEqual({ query: 'point', pageBytes: 64 });
  });
  it('encodings: rows in insert order, nothing encoded, country shown', () => {
    const s = initialEncodingScene();
    expect(s.sort).toBe('none');
    expect(s.shown).toBe('country');
    expect(COLUMNS.every((c) => s.picks[c] === 'none')).toBe(true);
  });
  it('skip: rows in insert order and a threshold of 8', () => {
    expect(initialSkipScene()).toEqual({ sort: 'none', threshold: 8 });
  });
  it('vector: a million values, typed with its thousands separators', () => {
    expect(initialVectorScene()).toEqual({ n: 1_000_000, text: '1,000,000' });
  });
  it('every scene the Stage returns carries its own key', () => {
    const scenes = sceneElements('columnar-storage');
    expect(scenes).toHaveLength(5);
    expect(scenes.every((s) => s.keyed)).toBe(true);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: SUM(price) touches 6 pages (384 B) against 1 page (64 B), 6 times fewer; INSERT flips it to 1 page against 5', () => {
    const sum = costs('sum-price');
    expect(sum).toMatchObject({ rowPages: 6, rowBytes: 384, colPages: 1, colBytes: 64, ratio: 6, cheaper: 'column' });
    const insert = costs('insert');
    expect(insert).toMatchObject({ rowPages: 1, colPages: 5, cheaper: 'row' });
    expect(lesson.tryThis[0]).toContain('touches 6 pages (384 B) and the column store 1 page (64 B), 6 times fewer bytes');
    expect(lesson.tryThis[0]).toContain('1 page in the row store and 5 pages in the column store');
    const c = compare('sum-price', initialLayoutScene().table, initialLayoutScene().pageBytes);
    expect(plain(layoutCaption('sum-price', c))).toContain('the column store touches 6× fewer bytes');
  });

  it('try-this 2: the whole-row read is 1 page against 5, and UPDATE one price is the one query where the layouts tie', () => {
    expect(costs('point')).toMatchObject({ rowPages: 1, colPages: 5 });
    expect(tiedQueries()).toEqual(['update']);
    expect(lesson.tryThis[1]).toContain('1 page in the row store, 5 pages in the column store');
    expect(lesson.tryThis[1]).toContain('UPDATE one price is the query where the layouts tie');
    const s = initialRowsScene();
    const c = compare(s.query, DEFAULT_TABLE, s.pageBytes);
    expect(plain(rowsCaption(s.query, c, winTally(DEFAULT_TABLE, s.pageBytes)))).toContain('the row store touches 5× fewer bytes');
  });

  it('try-this 3: run-length on country takes 70 B in insert order (more than 64 B raw) and 20 B once sorted by country', () => {
    const f = encodingFacts();
    expect(f).toEqual({ raw: 64, unsorted: 70, sorted: 20 });
    expect(lesson.tryThis[2]).toContain('it takes 70 B, more than the 64 B raw');
    expect(lesson.tryThis[2]).toContain('the same encoding takes 20 B');
    const s = initialEncodingScene();
    const r = sizeReport(columnOf(sortRows(DEFAULT_TABLE, s.sort), 'country'), 'rle');
    expect(plain(encodingCaption('country', 'rle', s.sort, r.before, r.after, r.roundTrips, r.encoded))).toContain('64 B raw becomes 70 B (14 runs), 6 B bigger than the raw column');
  });

  it('try-this 4: at qty > 8 in insert order 0 groups are skipped; sorted by qty 3 are, and the sum is the same', () => {
    const f = skipFacts();
    expect(f.asIs.skippedGroups).toHaveLength(0);
    expect(f.sorted.skippedGroups).toHaveLength(3);
    expect(f.sorted.sum).toBe(f.asIs.sum);
    expect(f.sorted.sum).toBe(DEFAULT_TABLE.filter((r) => r.qty > 8).reduce((s, r) => s + r.price, 0));
    expect(lesson.tryThis[3]).toContain('0 row groups are skipped');
    expect(lesson.tryThis[3]).toContain(`Set Sort rows to By qty: 3 are, and the sum stays ${f.sorted.sum}`);
    const s = initialSkipScene();
    expect(plain(skipCaption(filteredSum(sortRows(DEFAULT_TABLE, s.sort), s.threshold, 'max'), s.threshold, s.sort))).toContain('0 of 4 row groups skipped');
  });

  it('try-this 5: a million values is 1,000,000 calls against 977; 1,024 values is 1 batch; 1,025 is 2', () => {
    expect(vectorFacts()).toEqual({ n: 1_000_000, perRow: 1_000_000, perBatch: 977 });
    expect(vectorFacts(BATCH_VALUES).perBatch).toBe(1);
    expect(vectorFacts(BATCH_VALUES + 1).perBatch).toBe(2);
    expect(lesson.tryThis[4]).toContain('takes 1,000,000 calls one row at a time and 977 per batch');
    expect(lesson.tryThis[4]).toContain('Type 1,024 and the batch count is 1; type 1,025 and it is 2');
  });
});

describe('captions and stats are computed from the model over the whole control cross product', () => {
  it('layouts and rows: every query x page size says the cheaper side is the one with fewer bytes, and quotes both byte counts', () => {
    for (const pageBytes of PAGE_SIZES) {
      for (const q of QUERIES) {
        const c = compare(q.id, DEFAULT_TABLE, pageBytes);
        const text = plain(layoutCaption(q.id, c));
        expect(text, `${q.id} ${pageBytes}`).toContain(`${c.row.bytes} B`);
        expect(text).toContain(`${c.column.bytes} B`);
        expect(text.includes('a tie'), `${q.id} ${pageBytes}`).toBe(c.row.bytes === c.column.bytes);
        if (c.cheaper !== 'tie') {
          const cheap = c.cheaper === 'row' ? c.row.bytes : c.column.bytes;
          const dear = c.cheaper === 'row' ? c.column.bytes : c.row.bytes;
          expect(cheap).toBeLessThan(dear);
          expect(text).toContain(`the ${c.cheaper} store touches`);
        }
        const tally = winTally(DEFAULT_TABLE, pageBytes);
        expect(tally.row + tally.column + tally.tie).toBe(QUERIES.length);
        const rows = plain(rowsCaption(q.id, c, tally));
        expect(rows.includes('neither layout wins them all'), `${q.id} ${pageBytes}`).toBe(tally.row > 0 && tally.column > 0);
      }
    }
  });

  it('neither layout wins everywhere at every page size (the claim of the key idea), and the update ties at all three', () => {
    for (const pageBytes of PAGE_SIZES) {
      const t = winTally(DEFAULT_TABLE, pageBytes);
      expect(t.row).toBeGreaterThan(0);
      expect(t.column).toBeGreaterThan(0);
      expect(compare('update', DEFAULT_TABLE, pageBytes).cheaper).toBe('tie');
    }
  });

  it('encodings: every sort x column x applicable encoding says smaller, bigger or the same as the bytes do, and the decode round trip is true', () => {
    for (const sort of SORT_KEYS) {
      for (const col of COLUMNS) {
        for (const kind of encodingsFor(col)) {
          const r = sizeReport(columnOf(sortRows(DEFAULT_TABLE, sort.value), col), kind);
          const text = plain(encodingCaption(col, kind, sort.value, r.before, r.after, r.roundTrips, r.encoded));
          const id = `${sort.value} ${col} ${kind}`;
          expect(text, id).toContain(`stored ${ENCODING_LABELS[kind].toLowerCase()}`);
          expect(text.includes('bigger than the raw column'), id).toBe(r.after > r.before);
          expect(text.includes('smaller'), id).toBe(r.after < r.before);
          expect(text.includes('gives the same column'), id).toBe(true);
        }
      }
    }
  });

  it('skip: every threshold x sort says the number of groups its model skipped, and the bytes', () => {
    for (const sort of SORT_KEYS) {
      for (let th = 0; th <= THRESHOLD_MAX; th++) {
        const run = filteredSum(sortRows(DEFAULT_TABLE, sort.value), th, 'max');
        const text = plain(skipCaption(run, th, sort.value));
        expect(text, `${sort.value} ${th}`).toContain(`${run.skippedGroups.length} of 4 row groups skipped`);
        expect(text).toContain(`the sum comes out ${run.sum}`);
      }
    }
  });

  it('vector: the caption quotes the same call counts as the stats for sizes from 1 to a billion', () => {
    for (const n of [1, 500, 1024, 1025, 99_999, 1_000_000, 1_000_000_000]) {
      const text = plain(vectorCaption(n, callsPerRow(n), callsPerBatch(n)));
      expect(text).toContain(`${callsPerRow(n).toLocaleString('en-US')} calls`);
      expect(text).toContain(`${callsPerBatch(n).toLocaleString('en-US')} ${callsPerBatch(n) === 1 ? 'call' : 'calls'} in batches`);
      expect(text.includes('the last batch holds'), String(n)).toBe(n % BATCH_VALUES !== 0);
    }
  });
});

describe('no hidden control feeds a number', () => {
  it('the edit fields (row, value, column) do not change the comparison until Change is pressed: the model takes only the table, query and page size', () => {
    const base = compare('sum-price', DEFAULT_TABLE, 64);
    const again = compare('sum-price', DEFAULT_TABLE, 64);
    expect(again.row.bytes).toBe(base.row.bytes);
    expect(again.column.bytes).toBe(base.column.bytes);
  });

  it('an edit changes the answer but never the page counts (fields are a fixed 4 bytes)', () => {
    for (const q of ['sum-price', 'avg-qty-nl', 'point', 'insert', 'update'] as QueryId[]) {
      const edited = DEFAULT_TABLE.map((r, i) => (i === 6 ? { ...r, price: 9999, qty: 0 } : r));
      const a = compare(q, DEFAULT_TABLE, 64);
      const b = compare(q, edited, 64);
      expect(b.row.bytes).toBe(a.row.bytes);
      expect(b.column.bytes).toBe(a.column.bytes);
    }
  });

  it('a learner edit changes only the chosen cell, and the answers follow it', () => {
    const edited = withCell(DEFAULT_TABLE, 6, 'price', 9999);
    expect(edited).toHaveLength(DEFAULT_TABLE.length);
    expect(edited.filter((r, i) => r !== DEFAULT_TABLE[i]).map((r) => r.id)).toEqual([7]);
    const c = compare('sum-price', edited, 64);
    expect(answerFrom(c.row.layout, c.row.pages, 'sum-price', edited)).toBe(DEFAULT_TABLE.reduce((s, r) => s + r.price, 0) - DEFAULT_TABLE[6].price + 9999);
  });

  it('the encoding picks for other columns and the column shown do not change one column\'s size', () => {
    const rows = sortRows(DEFAULT_TABLE, 'country');
    const alone = sizeReport(columnOf(rows, 'country'), 'rle').after;
    for (const other of ['none', 'rle', 'dict'] as const) {
      sizeReport(columnOf(rows, 'product'), other);
      expect(sizeReport(columnOf(rows, 'country'), 'rle').after).toBe(alone);
    }
  });
});

const ownSource = Object.values(import.meta.glob<string>('./index.tsx', { query: '?raw', import: 'default', eager: true })).join('');

describe('lesson content', () => {
  it('passes the K-2 content lint and the Tier 3 lint (absolutes, chips, try-this tests), run here so a fix pass needs only this folder', () => {
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(lintTier3Lesson(lesson, { domainReview: false, source: ownSource, tryThisTests: lesson.tryThis.map((_, i) => i + 1) })).toEqual([]);
  });

  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
