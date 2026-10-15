/**
 * stream-windowing: the streaming engine, one arrival at a time. Pure; the state is a plain value (never mutated in place).
 *
 * Event-time windows with a bounded-out-of-orderness watermark: the watermark is the largest event time seen minus `bound`. An
 * arrival is judged against the watermark as it stood before it, then the watermark is advanced, and every window whose end the
 * watermark has reached fires. An event for a window the watermark already passed is late: it still counts while the watermark is
 * below the window's end plus `lateness` (a late firing), and is dropped from that window after (kept in a side output when asked).
 * Windows are retained until the watermark passes their end plus `lateness`. Sessions merge when an event bridges two of them.
 */
import type { Evt } from './events';
import { ANY_KEY, assign, offlineWindows, sameSpan, type Bucket, type Span, type WindowSpec } from './windows';

export interface StreamCfg {
  spec: WindowSpec;
  bound: number;
  lateness: number;
  sideOutput: boolean;
}

export const BOUND_RANGE = { min: 0, max: 30 } as const;
export const LATENESS_RANGE = { min: 0, max: 30 } as const;
export const STRAGGLER_BEHIND = 20;
export const DEFAULT_BOUND = 5;
export const DEFAULT_LATENESS = 0;
/** A lateness at least as long as the longest possible delay: nothing is dropped. */
export const ROOMY_LATENESS = 30;

export interface Win extends Span {
  ids: number[];
  fired: boolean;
  /** Processing time (the arrival of the event that moved the watermark) when it first fired. */
  firedAt: number | null;
  /** Late events counted into it after it fired. */
  lateCount: number;
}

export type Fate = 'on-time' | 'late' | 'dropped';

export interface LogLine {
  id: number;
  at: number;
  tone: 'ok' | 'info' | 'bad' | 'violet';
  text: string;
}

export interface Stream {
  cfg: StreamCfg;
  /** Every event of the run in arrival order. */
  arrivals: readonly Evt[];
  /** How many have been processed. */
  k: number;
  /** Largest event time seen; -Infinity before the first. */
  maxTime: number;
  watermark: number;
  /** The watermark after each processed arrival: for the "never moves backwards" check. */
  history: readonly number[];
  windows: readonly Win[];
  /** How each processed event was treated: dropped if any window refused it, else late if any took it late. */
  fates: Readonly<Record<number, Fate>>;
  /** Windows that refused an event: [window, event id]. */
  refusals: readonly { span: Span; id: number }[];
  side: readonly number[];
  log: readonly LogLine[];
}

export const newStream = (arrivals: readonly Evt[], cfg: StreamCfg): Stream => ({
  cfg, arrivals, k: 0, maxTime: -Infinity, watermark: -Infinity, history: [], windows: [], fates: {}, refusals: [], side: [], log: [],
});

export const done = (s: Stream): boolean => s.k >= s.arrivals.length;

const span = (w: Span): string => (w.key === ANY_KEY ? `[${w.start}, ${w.end})` : `${w.key} [${w.start}, ${w.end})`);

/** Process the next arrival. Returns a new stream; the argument is untouched. */
export function step(s: Stream): Stream {
  if (done(s)) return s;
  const ev = s.arrivals[s.k];
  const W = s.watermark;
  const { lateness } = s.cfg;
  let windows = s.windows.map((w) => ({ ...w, ids: [...w.ids] }));
  const refusals = [...s.refusals];
  const log = [...s.log];
  let lateTaken = false;
  let refused = false;
  const note = (tone: LogLine['tone'], text: string) => log.push({ id: log.length, at: ev.arrival, tone, text });

  const spans: Span[] = s.cfg.spec.kind === 'session' ? [{ key: ev.key, start: ev.time, end: ev.time + s.cfg.spec.gap }] : assign(ev.time, s.cfg.spec);
  for (const sp of spans) {
    const touching = s.cfg.spec.kind === 'session' ? windows.filter((w) => w.key === sp.key && w.start < sp.end && sp.start < w.end) : windows.filter((w) => sameSpan(w, sp));
    const start = Math.min(sp.start, ...touching.map((w) => w.start));
    const end = Math.max(sp.end, ...touching.map((w) => w.end));
    if (W >= end + lateness) {
      refusals.push({ span: sp, id: ev.id });
      refused = true;
      note('bad', `event ${ev.id} (time ${ev.time}) is too late for ${span(sp)}: dropped${s.cfg.sideOutput ? ', sent to the side output' : ''}`);
      continue;
    }
    const wasFired = touching.some((w) => w.fired);
    // A window the watermark has already reached is fired; a session stretched past the watermark by this event is open again.
    const fired = (wasFired || W >= end) && end <= W;
    const merged: Win = {
      key: sp.key, start, end, ids: [...new Set([...touching.flatMap((w) => w.ids), ev.id])].sort((a, b) => a - b),
      fired, firedAt: fired ? (touching.find((w) => w.fired)?.firedAt ?? ev.arrival) : null, lateCount: touching.reduce((n, w) => n + w.lateCount, 0),
    };
    if (wasFired || W >= end) {
      merged.lateCount++;
      lateTaken = true;
      note('info', `late event ${ev.id} (time ${ev.time}) updates ${span({ ...sp, start, end })}: a late firing, now ${merged.ids.length}`);
    }
    windows = [...windows.filter((w) => !touching.includes(w)), merged];
  }

  const maxTime = Math.max(s.maxTime, ev.time);
  const watermark = maxTime - s.cfg.bound;
  windows = windows
    .map((w) => {
      if (w.fired || w.end > watermark) return w;
      note('ok', `window ${span(w)} fired: ${w.ids.length}`);
      return { ...w, fired: true, firedAt: ev.arrival };
    })
    .sort((a, b) => a.key.localeCompare(b.key) || a.start - b.start);

  return {
    ...s,
    k: s.k + 1,
    maxTime,
    watermark,
    history: [...s.history, watermark],
    windows,
    fates: { ...s.fates, [ev.id]: refused ? 'dropped' : lateTaken ? 'late' : 'on-time' },
    refusals,
    side: s.cfg.sideOutput && refused ? [...s.side, ev.id] : s.side,
    log,
  };
}

export const runTo = (s: Stream, k: number): Stream => {
  let next = s;
  while (next.k < Math.min(k, next.arrivals.length)) next = step(next);
  return next;
};

/** Windows still held: not yet past their end plus the allowed lateness. */
export const heldWindows = (s: Stream): Win[] => s.windows.filter((w) => w.end + s.cfg.lateness > s.watermark);

export interface Result {
  span: Span;
  /** Events the streaming job counted. */
  streamed: number;
  /** Events the offline answer counts. */
  truth: number;
}

/** Per window of the offline answer, what the stream counted; a window the stream never produced counts 0. */
export function compare(s: Stream, events: readonly Evt[]): Result[] {
  const truth: Bucket[] = offlineWindows(events, s.cfg.spec);
  return truth.map((t) => ({ span: { key: t.key, start: t.start, end: t.end }, truth: t.ids.length, streamed: s.windows.find((w) => sameSpan(w, t))?.ids.length ?? 0 }));
}

/** Windows the stream produced that the offline answer has no window for (a session split or merged differently). */
export const strayWindows = (s: Stream, events: readonly Evt[]): Win[] => {
  const truth = offlineWindows(events, s.cfg.spec);
  return s.windows.filter((w) => !truth.some((t) => sameSpan(w, t)));
};

/** Mean and longest wait, in seconds of processing time, from a window's end to the arrival that fired it. */
export function fireDelay(s: Stream): { mean: number; longest: number; windows: number } {
  const waits = s.windows.flatMap((w) => (w.firedAt === null ? [] : [Math.max(0, w.firedAt - w.end)]));
  return { mean: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0, longest: Math.max(0, ...waits), windows: waits.length };
}

export const droppedCount = (s: Stream): number => s.refusals.length;

/** Safety: the watermark never moves backwards and is the largest event time minus the bound; no event sits twice in a window. Null while it holds. */
export function checkStream(s: Stream): string | null {
  for (let i = 1; i < s.history.length; i++) if (s.history[i] < s.history[i - 1]) return `the watermark moved backwards, from ${s.history[i - 1]} to ${s.history[i]}, at arrival ${i + 1}`;
  const seen = s.arrivals.slice(0, s.k);
  const expected = seen.length ? Math.max(...seen.map((e) => e.time)) - s.cfg.bound : -Infinity;
  if (s.watermark !== expected) return `the watermark is ${s.watermark}, not the largest event time minus the bound (${expected})`;
  for (const w of s.windows) if (new Set(w.ids).size !== w.ids.length) return `an event is counted twice in window ${span(w)}`;
  if (s.cfg.spec.kind === 'tumbling') {
    const where = new Map<number, number>();
    for (const w of s.windows) for (const id of w.ids) where.set(id, (where.get(id) ?? 0) + 1);
    for (const [id, n] of where) if (n > 1) return `event ${id} is counted in ${n} tumbling windows`;
  }
  return null;
}
