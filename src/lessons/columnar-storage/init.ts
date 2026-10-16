/** columnar-storage: each scene's opening state as a pure function, so a test can switch through every scene and pin it. */
import { DEFAULT_PAGE_BYTES, type PageBytes, type QueryId } from './layout';
import { ENCODING_LABELS, type Encoding } from './encode';
import { COLUMNS, DEFAULT_TABLE, type Column, type SortKey, type Table } from './table';
import { DEFAULT_THRESHOLD } from './zones';
import { DEFAULT_N } from './vector';

export const initialLayoutScene = (): { query: QueryId; pageBytes: PageBytes; table: Table } => ({ query: 'sum-price', pageBytes: DEFAULT_PAGE_BYTES, table: DEFAULT_TABLE });
export const initialRowsScene = (): { query: QueryId; pageBytes: PageBytes } => ({ query: 'point', pageBytes: DEFAULT_PAGE_BYTES });
export const initialEncodingScene = (): { sort: SortKey; picks: Record<Column, Encoding>; shown: Column } => ({
  sort: 'none',
  picks: Object.fromEntries(COLUMNS.map((c) => [c, 'none'])) as Record<Column, Encoding>,
  shown: 'country',
});
export const initialSkipScene = (): { sort: SortKey; threshold: number } => ({ sort: 'none', threshold: DEFAULT_THRESHOLD });
export const initialVectorScene = (): { n: number; text: string } => ({ n: DEFAULT_N, text: DEFAULT_N.toLocaleString('en-US') });

export const ENCODING_OPTIONS = (Object.keys(ENCODING_LABELS) as Encoding[]).map((value) => ({ value, label: ENCODING_LABELS[value] }));
