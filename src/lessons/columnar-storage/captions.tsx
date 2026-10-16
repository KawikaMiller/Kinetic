/** columnar-storage: every caption, built from the model on screen. No number here is typed. */
import type { ReactNode } from 'react';
import { bytes, decimal, plural } from '../../core/format';
import { ENCODING_LABELS, type Encoded, type Encoding } from './encode';
import { QUERIES, queryOf, compare, type Comparison, type QueryId } from './layout';
import type { Column, SortKey, Table } from './table';
import { BATCH_VALUES, batchSizes } from './vector';
import { CHUNK_BYTES, CHUNKS_PER_GROUP, type FilterRun } from './zones';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const pages = (n: number) => plural(n, 'page');
const ratioText = (r: number) => `${decimal(r, 2)}×`;

/** The verdict for one query on both layouts: pages, bytes and which side is cheaper, from the one comparison. */
export function layoutCaption(q: QueryId, c: Comparison): ReactNode {
  const query = queryOf(q);
  const verb = query.writes ? 'writes' : 'reads';
  const sides = (
    <>
      the row store {verb} {hl(c.cheaper === 'row' ? 'ok' : c.cheaper === 'column' ? 'bad' : '', `${pages(c.row.pages.length)} (${bytes(c.row.bytes)})`)}, the column store {verb}{' '}
      {hl(c.cheaper === 'column' ? 'ok' : c.cheaper === 'row' ? 'bad' : '', `${pages(c.column.pages.length)} (${bytes(c.column.bytes)})`)}
    </>
  );
  const verdict =
    c.cheaper === 'tie'
      ? 'a tie: the two layouts touch the same bytes for this query'
      : `the ${c.cheaper} store touches ${ratioText(c.ratio)} fewer bytes`;
  return (
    <>
      {query.label}: {sides}; {verdict}. Bytes touched is pages times the page size, counted the same way on both sides.
    </>
  );
}

/** How many of the five queries each layout wins, from the same comparison. */
export function winTally(table: Table, pageBytes: number): { row: number; column: number; tie: number } {
  const t = { row: 0, column: 0, tie: 0 };
  for (const q of QUERIES) t[compare(q.id, table, pageBytes).cheaper]++;
  return t;
}

export function rowsCaption(q: QueryId, c: Comparison, tally: { row: number; column: number; tie: number }): ReactNode {
  return (
    <>
      {layoutCaption(q, c)} Across the five queries below the row store is cheaper in {hl('', tally.row)}, the column store in {hl('', tally.column)} and they tie in {hl('', tally.tie)}
      {tally.row > 0 && tally.column > 0 ? ': neither layout wins them all.' : '.'}
    </>
  );
}

export function encodingCaption(col: Column, kind: Encoding, sort: SortKey, before: number, after: number, roundTrips: boolean, encoded: Encoded): ReactNode {
  const sorted = sort === 'none' ? 'in insert order' : `sorted ${SORT_WORDS[sort]}`;
  const change = after === before ? 'the same size' : after < before ? `${bytes(before - after)} smaller` : `${bytes(after - before)} bigger than the raw column`;
  const runs = encoded.kind === 'rle' ? ` (${plural(encoded.runs.length, 'run')})` : encoded.kind === 'dict' ? ` (${plural(encoded.dict.length, 'distinct value')})` : '';
  return (
    <>
      {col}, {sorted}, stored {ENCODING_LABELS[kind].toLowerCase()}: {bytes(before)} raw becomes {hl(after < before ? 'ok' : after > before ? 'bad' : '', bytes(after))}
      {runs}, {change}. Decoding it back {roundTrips ? hl('ok', 'gives the same column') : hl('bad', 'does not give the same column')}.
    </>
  );
}
const SORT_WORDS: Record<Exclude<SortKey, 'none'>, string> = { country: 'by country', price: 'by price', qty: 'by quantity' };

export function skipCaption(run: FilterRun, threshold: number, sort: SortKey): ReactNode {
  const groups = run.skippedGroups.length + run.readGroups.length;
  const order = sort === 'none' ? 'in insert order' : `sorted ${SORT_WORDS[sort]}`;
  return (
    <>
      WHERE qty &gt; {threshold}, rows {order}: {hl(run.skippedGroups.length > 0 ? 'ok' : '', `${run.skippedGroups.length} of ${groups} row groups skipped`)} on their zone maps, so{' '}
      {bytes(run.bytesSkipped)} is never read and {bytes(run.bytesRead)} is: each group read costs {CHUNKS_PER_GROUP} chunks of {bytes(CHUNK_BYTES)}, and {plural(run.readGroups.length, 'group')} {run.readGroups.length === 1 ? 'is' : 'are'} read. A group is skipped when its
      largest quantity is at most {threshold}; the sum comes out {run.sum} with or without skipping.
    </>
  );
}

export function vectorCaption(n: number, perRow: number, perBatch: number): ReactNode {
  const sizes = batchSizes(n);
  const last = sizes.at(-1)!;
  return (
    <>
      Summing {n.toLocaleString('en-US')} values: {hl('bad', `${perRow.toLocaleString('en-US')} calls`)} one row at a time, {hl('ok', `${perBatch.toLocaleString('en-US')} ${perBatch === 1 ? 'call' : 'calls'}`)} in batches of {BATCH_VALUES.toLocaleString('en-US')}
      {last < BATCH_VALUES ? ` (the last batch holds ${last})` : ''}. That is counting calls, not seconds: the real speed depends on the engine and the CPU.
    </>
  );
}

