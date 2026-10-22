import { pctText } from '../../core/format';
import { DEFAULT_SEED, DEFAULT_WINDOW_DAYS, LATE_SHARE, USERS, dayLabel, makeEvents, type EventTable } from './events';
import {
  NO_SOURCES, SOURCE_LABEL, SOURCES, buildRows, divergence, explainFirst, perSource, type Explanation, type Row, type Source, type SourceFraction, type SourceSet,
} from './feature';
import { JOIN_LABEL, LABEL_TIMES, LOG, join, measureLeak, type JoinKind, type JoinedRow, type LeakResult } from './join';

export const PIPELINE_OPENING = { seed: DEFAULT_SEED, users: USERS, lateShare: LATE_SHARE, windowDays: DEFAULT_WINDOW_DAYS, sources: NO_SOURCES, shared: false } as const;
export const JOIN_OPENING = { seed: DEFAULT_SEED, kind: 'point-in-time' as JoinKind };
export const SHOWN_ROWS = 12;

export interface PipelineView {
  table: EventTable;
  rows: Row[];
  count: number;
  share: number;
  each: SourceFraction[];
  first: Explanation | null;
  /** The rows to list: the first diverging ones, or the first rows when none differ. */
  listed: Row[];
}

export function pipelineView(seed: number, users: number, lateShare: number, windowDays: number, sources: SourceSet, shared: boolean): PipelineView {
  const table = makeEvents(seed, users, lateShare);
  const rows = buildRows(table, sources, shared, windowDays);
  const { count, share } = divergence(rows);
  const diverging = rows.filter((r) => r.differs);
  return {
    table, rows, count, share,
    each: perSource(table, windowDays),
    first: explainFirst(table, rows, sources, windowDays),
    listed: (diverging.length ? diverging : rows).slice(0, SHOWN_ROWS),
  };
}

const onCount = (s: SourceSet) => SOURCES.filter((k) => s[k]).length;

export function pipelineCaption(v: PipelineView, sources: SourceSet, shared: boolean): string {
  const total = v.rows.length.toLocaleString('en-US');
  if (shared) return `One shared definition: both pipelines call the same function, and ${v.count} of ${total} rows differ, whatever the skew toggles say.`;
  if (v.count === 0) return `${onCount(sources) === 0 ? 'All four skew sources are off' : 'With these sources on'}: the two pipelines agree, 0 of ${total} rows differ.`;
  const first = v.first;
  const why = first && first.causes.length ? `The first is user ${first.row.user + 1} at ${dayLabel(first.row.asOf)}: ${first.causes[0].text}.` : '';
  return `${v.count.toLocaleString('en-US')} of ${total} rows (${pctText(v.share, 1)}) differ between the batch and the streaming pipeline. ${why}`;
}

export interface JoinView {
  rows: JoinedRow[];
  leak: LeakResult;
}

export function joinView(seed: number, kind: JoinKind): JoinView {
  return { rows: join(LOG, LABEL_TIMES, kind), leak: measureLeak(makeEvents(seed)) };
}

const auc = (x: number | null) => (x === null ? 'undefined (one class only)' : x.toFixed(3));

export function joinCaption(v: JoinView, kind: JoinKind): string {
  const values = v.rows.map((r) => (r.entry === null ? 'none' : String(r.entry.value))).join(', ');
  const leaks = v.rows.filter((r) => r.leaks).length;
  const head = `${JOIN_LABEL[kind]}: ${values}${leaks > 0 ? `; ${leaks} of ${v.rows.length} rows use a value stamped after their label time` : ''}.`;
  const l = v.leak;
  return `${head} On this seeded set the model scores AUC ${auc(l.leakyOffline)} offline with the leaky join, ${auc(l.correctOffline)} with the correct join, and ${auc(l.online)} when served with the features that exist online.`;
}

export const sourceName = (s: Source): string => SOURCE_LABEL[s];
