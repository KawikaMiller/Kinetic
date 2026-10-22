import {
  ASOF_HOUR, DEFAULT_WINDOW_DAYS, FIRST_ASOF_DAY, HOURS_PER_DAY, LAST_ASOF_DAY, LOCAL_OFFSET_HOURS, asOfTime, dayLabel, type EventTable, type PurchaseEvent,
} from './events';

/**
 * The feature functions. `featureValue` is the single shared definition: a half-open window (t - w, t], only events
 * that have ARRIVED by t, days cut at UTC midnight. Each skew source swaps one of those conventions in one pipeline.
 * Two functions in this page, not a streaming system: both pipelines are plain functions over the same table.
 */

export type Source = 'boundary' | 'late' | 'day' | 'null';
export const SOURCES: readonly Source[] = ['boundary', 'late', 'day', 'null'];

export const SOURCE_LABEL: Record<Source, string> = {
  boundary: 'window boundary',
  late: 'late events',
  day: 'day boundary',
  null: 'null handling',
};

/** Conventions of one pipeline. The shared definition is all false and 0. */
export interface Spec {
  /** Count an event exactly on the window start (a closed window). */
  closedWindow: boolean;
  /** Count events by their event time even when they had not arrived by the as-of time. */
  ignoreArrival: boolean;
  /** Local time is UTC minus this many hours for the "today" feature. */
  dayOffsetHours: number;
}

export const SHARED: Spec = { closedWindow: false, ignoreArrival: false, dayOffsetHours: 0 };

export interface FeatureValues {
  orders7d: number;
  ordersToday: number;
}

/** The imputed value a model sees in place of a null. */
export const NULL_IMPUTED = -1;

/** Purchases in the window before `asOf` and purchases since the start of the day containing it, under `spec`. */
export function featureValue(events: readonly PurchaseEvent[], asOf: number, spec: Spec, windowDays: number = DEFAULT_WINDOW_DAYS): FeatureValues {
  const start = asOf - windowDays;
  const offset = spec.dayOffsetHours / HOURS_PER_DAY;
  const dayStart = Math.floor(asOf - offset) + offset;
  let orders7d = 0;
  let ordersToday = 0;
  for (const e of events) {
    if (e.at > asOf) continue;
    if (!spec.ignoreArrival && e.arrived > asOf) continue;
    if (spec.closedWindow ? e.at >= start : e.at > start) orders7d += 1;
    if (e.at >= dayStart) ordersToday += 1;
  }
  return { orders7d, ordersToday };
}

export interface Row {
  user: number;
  day: number;
  asOf: number;
  offline: FeatureValues;
  online: FeatureValues;
  differs: boolean;
}

export type SourceSet = Readonly<Record<Source, boolean>>;
export const NO_SOURCES: SourceSet = { boundary: false, late: false, day: false, null: false };
export const only = (s: Source): SourceSet => ({ ...NO_SOURCES, [s]: true });

/** What each pipeline does under a set of skew sources. Offline is the batch job; online is the streaming job. */
export function pipelines(sources: SourceSet): { offline: Spec; online: Spec } {
  return {
    offline: { closedWindow: sources.boundary, ignoreArrival: sources.late, dayOffsetHours: 0 },
    online: { closedWindow: false, ignoreArrival: false, dayOffsetHours: sources.day ? LOCAL_OFFSET_HOURS : 0 },
  };
}

const same = (a: FeatureValues, b: FeatureValues) => a.orders7d === b.orders7d && a.ordersToday === b.ordersToday;

/** Every (user, as-of) row, offline against online. `shared` makes both pipelines the shared definition whatever the sources say. */
export function buildRows(table: EventTable, sources: SourceSet, shared: boolean, windowDays: number = DEFAULT_WINDOW_DAYS): Row[] {
  const { offline: offSpec, online: onSpec } = shared ? { offline: SHARED, online: SHARED } : pipelines(sources);
  const rows: Row[] = [];
  for (let user = 0; user < table.users; user += 1) {
    const events = table.byUser[user];
    for (let day = FIRST_ASOF_DAY; day <= LAST_ASOF_DAY; day += 1) {
      const asOf = asOfTime(day);
      const offline = featureValue(events, asOf, offSpec, windowDays);
      let online = featureValue(events, asOf, onSpec, windowDays);
      if (!shared && sources.null && events.length === 0) online = { orders7d: NULL_IMPUTED, ordersToday: online.ordersToday };
      rows.push({ user, day, asOf, offline, online, differs: !same(offline, online) });
    }
  }
  return rows;
}

export const divergence = (rows: readonly Row[]): { count: number; share: number } => {
  const count = rows.filter((r) => r.differs).length;
  return { count, share: rows.length === 0 ? 0 : count / rows.length };
};

export interface SourceFraction {
  source: Source;
  count: number;
  share: number;
}

/** Each source on its own (the others off): how many rows it alone makes diverge. */
export function perSource(table: EventTable, windowDays: number = DEFAULT_WINDOW_DAYS): SourceFraction[] {
  return SOURCES.map((source) => ({ source, ...divergence(buildRows(table, only(source), false, windowDays)) }));
}

export interface Explanation {
  row: Row;
  causes: { source: Source; text: string }[];
}

/** The first diverging row and, for each switched-on source that alone makes it diverge, a sentence naming the event or the rule. */
export function explainFirst(table: EventTable, rows: readonly Row[], sources: SourceSet, windowDays: number = DEFAULT_WINDOW_DAYS): Explanation | null {
  const row = rows.find((r) => r.differs);
  if (!row) return null;
  const events = table.byUser[row.user];
  const start = row.asOf - windowDays;
  const causes: Explanation['causes'] = [];
  for (const source of SOURCES.filter((s) => sources[s])) {
    const alone = buildRows({ ...table, users: row.user + 1 }, only(source), false, windowDays).find((r) => r.user === row.user && r.day === row.day);
    if (!alone?.differs) continue;
    if (source === 'boundary') {
      const edge = events.find((e) => e.at === start && e.arrived <= row.asOf);
      causes.push({ source, text: edge ? `the event at ${dayLabel(edge.at)} sits exactly on the window start: the batch job counts it, the streaming job does not` : 'an event sits exactly on the window start' });
    } else if (source === 'late') {
      const late = events.find((e) => e.arrived > row.asOf && e.at > start && e.at <= row.asOf);
      causes.push({ source, text: late ? `the event at ${dayLabel(late.at)} arrived at ${dayLabel(late.arrived)}, after the as-of time: the batch job recomputes after it arrived, the streaming job had not seen it` : 'an event arrived after the as-of time' });
    } else if (source === 'day') {
      causes.push({ source, text: `events between 00:00 and ${String(LOCAL_OFFSET_HOURS).padStart(2, '0')}:00 UTC are today for the batch job (UTC days) and yesterday for the streaming job (local days, UTC minus ${LOCAL_OFFSET_HOURS} hours)` });
    } else {
      causes.push({ source, text: `user ${row.user + 1} has no events: the batch job says 0, the streaming job returns null and the model sees ${NULL_IMPUTED}` });
    }
  }
  return { row, causes };
}

export const ASOF_LABEL = `${String(ASOF_HOUR).padStart(2, '0')}:00 UTC`;
export { FIRST_ASOF_DAY, LAST_ASOF_DAY };
