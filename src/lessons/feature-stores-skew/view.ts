import { pctText } from '../../core/format';
import { DEFAULT_SEED, DEFAULT_WINDOW_DAYS, LATE_SHARE, SILENT_USER_SHARE, USERS, dayLabel, makeEvents, type EventTable } from './events';
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
  if (v.count === 0) return `${onCount(sources) === 0 ? 'All four skew sources are off' : 'With these sources on'}: the two pipelines agree, 0 of ${total} rows differ.${idleSentence(v, sources) ? ` ${idleSentence(v, sources)}` : ''}`;
  const first = v.first;
  const why = first && first.causes.length ? `The first is user ${first.row.user + 1} at ${dayLabel(first.row.asOf)}. ${capitalise(first.causes[0].text)}.` : '';
  return [`${v.count.toLocaleString('en-US')} of ${total} rows (${pctText(v.share, 1)}) differ between the batch and the streaming pipeline.`, why, idleSentence(v, sources)].filter(Boolean).join(' ');
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export interface IdleSource {
  source: Source;
  reason: string;
}

/** The switched-on sources that alone change no row, each with the reason the data gives. */
export function idleSources(v: PipelineView, sources: SourceSet): IdleSource[] {
  const anyLate = v.table.events.some((e) => e.arrived > e.at);
  const silent = Math.round(v.table.users * SILENT_USER_SHARE);
  const reasons: Record<Source, string> = {
    boundary: 'no event sits exactly on a window start',
    late: anyLate ? 'no late event falls inside a window' : 'no event is late (late events are at 0%)',
    day: 'no event falls in the hours where the UTC day and the local day differ',
    null: silent === 0 ? `no user is silent: ${pctText(SILENT_USER_SHARE, 0)} of ${v.table.users} users rounds to 0 users, and it takes 5 users or more to make one` : 'every user has events in the rows shown',
  };
  return v.each.filter((e) => sources[e.source] && e.count === 0).map((e) => ({ source: e.source, reason: reasons[e.source] }));
}

const idleSentence = (v: PipelineView, sources: SourceSet): string => {
  const idle = idleSources(v, sources);
  return idle.length ? `Switched on but changing no row here: ${idle.map((i) => `${SOURCE_LABEL[i.source]} (${i.reason})`).join('; ')}.` : '';
};

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
  const tail = sameAuc(l) ? `, the same number as the honest feature because a model with a positive weight keeps the feature's ranking` : '';
  return `${head} The AUC figures come from a separate seeded dataset of ${l.rows.toLocaleString('en-US')} rows, so the join buttons do not change them: a leaky feature (it counts purchases up to 7 days after the label) scores AUC ${auc(l.leakyOffline)} offline, the honest feature ${auc(l.correctOffline)}, and the leaky-trained model served with the honest feature ${auc(l.online)}${tail}.`;
}

/** True when the served model's AUC equals the honest feature's: it must for a positive weight, and the page says so only then. */
export const sameAuc = (l: LeakResult): boolean => l.online !== null && l.correctOffline !== null && Math.abs(l.online - l.correctOffline) < 1e-9;

/** The timeline dot colour of an event: the window-start boundary wins over lateness, as the first-row caption explains it that way. */
export const dotTone = (e: { at: number; arrived: number }, windowStart: number): 'hi' | 'violet' | 'sky' =>
  e.at === windowStart ? 'hi' : e.arrived > e.at ? 'violet' : 'sky';

export const sourceName = (s: Source): string => SOURCE_LABEL[s];
