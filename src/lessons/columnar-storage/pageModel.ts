import type { Tone } from '../../core/tone';
import { PAGE_SIZES, QUERIES } from './layout';
import type { Column } from './table';

export const QUERY_OPTIONS = QUERIES.map((q) => ({ value: q.id, label: q.label }));
export const PAGE_OPTIONS = PAGE_SIZES.map((b) => ({ value: b, label: `${b} B` }));

/** One categorical hue per field (never ok or bad: those belong to the verdict). */
export const FIELD_TONE: Record<Column, Tone> = { id: 'muted', country: 'amber', product: 'pink', qty: 'sky', price: 'orange' };
