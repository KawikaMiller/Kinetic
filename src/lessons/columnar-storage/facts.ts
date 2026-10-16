/** columnar-storage: the numbers the try-this entries and captions quote, each computed from the model at the scene's default state. */
import { encode, encodedBytes } from './encode';
import { DEFAULT_PAGE_BYTES, QUERIES, compare, type QueryId } from './layout';
import { DEFAULT_TABLE, columnOf, sortRows } from './table';
import { DEFAULT_THRESHOLD, filteredSum } from './zones';
import { DEFAULT_N, callsPerBatch, callsPerRow } from './vector';

/** Pages and bytes each layout touches for a query on the default table at a page size. */
export function costs(q: QueryId, pageBytes: number = DEFAULT_PAGE_BYTES) {
  const c = compare(q, DEFAULT_TABLE, pageBytes);
  return { rowPages: c.row.pages.length, rowBytes: c.row.bytes, colPages: c.column.pages.length, colBytes: c.column.bytes, cheaper: c.cheaper, ratio: c.ratio };
}

/** Which queries tie on pages at the default page size. */
export const tiedQueries = (pageBytes: number = DEFAULT_PAGE_BYTES): QueryId[] => QUERIES.filter((q) => costs(q.id, pageBytes).cheaper === 'tie').map((q) => q.id);

/** The size of the country column under run-length encoding, unsorted and sorted by country, against its raw size. */
export function encodingFacts() {
  const bytes = (sorted: boolean) => encodedBytes(encode(columnOf(sorted ? sortRows(DEFAULT_TABLE, 'country') : DEFAULT_TABLE, 'country'), 'rle'));
  return { raw: encodedBytes(encode(columnOf(DEFAULT_TABLE, 'country'), 'none')), unsorted: bytes(false), sorted: bytes(true) };
}

/** What the zone maps skip at the default threshold with the table as it is, and after sorting by quantity. */
export function skipFacts() {
  const asIs = filteredSum(DEFAULT_TABLE, DEFAULT_THRESHOLD, 'max');
  const sorted = filteredSum(sortRows(DEFAULT_TABLE, 'qty'), DEFAULT_THRESHOLD, 'max');
  return { asIs, sorted };
}

export const vectorFacts = (n: number = DEFAULT_N) => ({ n, perRow: callsPerRow(n), perBatch: callsPerBatch(n) });
