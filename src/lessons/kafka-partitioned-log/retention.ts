/**
 * kafka-partitioned-log, scene 4: one partition's log as segments, and the two ways a log is trimmed. Pure.
 *
 * The log is a list of segments of at most SEGMENT_SIZE records. Retention (here by count, the size flavour; time works the
 * same way on segment age) deletes whole oldest segments and moves the log start offset. Compaction keeps only the newest record
 * of each key in the closed segments (the open segment is never touched), leaving gaps in the offsets, and a tombstone, a record
 * with a null value, is the newest record of its key like any other. Offsets are never renumbered by either.
 */

export const SEGMENT_SIZE = 4;
export const MIN_KEPT_SEGMENTS = 1;
export const MAX_KEPT_SEGMENTS = 4;
export const DEFAULT_KEPT_SEGMENTS = 2;
/** The most records the scene holds before it says so and stops taking more. */
export const MAX_APPENDS = 40;
export const KEYS = ['a', 'b', 'c'] as const;
export type RetKey = (typeof KEYS)[number];

export type RetPolicy = 'retention' | 'compaction';

export interface LogRecord {
  offset: number;
  key: string;
  /** Null is a tombstone: the key is deleted. */
  value: number | null;
}

export interface SegLog {
  /** What is on disk, oldest first; the last segment is open. */
  segments: LogRecord[][];
  /** Everything ever appended, in order: the oracle the on-disk log is checked against. */
  history: LogRecord[];
  /** The first offset a reader may ask for: retention moves it, compaction does not. */
  logStart: number;
}

export const emptyLog = (): SegLog => ({ segments: [], history: [], logStart: 0 });

export const logEnd = (log: SegLog): number => log.history.length;
export const onDisk = (log: SegLog): LogRecord[] => log.segments.flat();

export type Appended = { ok: true; log: SegLog } | { ok: false; error: string };

/** Append one update (`value` null for a tombstone) to the open segment, rolling a new one when it is full. */
export function append(log: SegLog, key: string, value: number | null): Appended {
  if (log.history.length >= MAX_APPENDS) return { ok: false, error: `This scene stops at ${MAX_APPENDS} appends. Reset the log to start again.` };
  const record: LogRecord = { offset: log.history.length, key, value };
  const segments = log.segments.map((s) => [...s]);
  const open = segments.at(-1);
  if (!open || open.length >= SEGMENT_SIZE) segments.push([record]);
  else open.push(record);
  return { ok: true, log: { ...log, segments, history: [...log.history, record] } };
}

/** Retention: delete the oldest whole segments until `keep` remain; the open segment always stays. Moves the log start. */
export function applyRetention(log: SegLog, keep: number): SegLog {
  const kept = Math.max(MIN_KEPT_SEGMENTS, keep);
  if (log.segments.length <= kept) return log;
  const segments = log.segments.slice(log.segments.length - kept);
  return { ...log, segments, logStart: segments[0][0].offset };
}

/** Compaction: in every closed segment, drop a record when a later record on disk has the same key. Empty segments go. */
export function applyCompaction(log: SegLog): SegLog {
  const newest = new Map<string, number>();
  for (const r of onDisk(log)) newest.set(r.key, r.offset);
  const last = log.segments.length - 1;
  const segments = log.segments
    .map((seg, i) => (i === last ? seg : seg.filter((r) => newest.get(r.key) === r.offset)))
    .filter((seg) => seg.length > 0);
  return { ...log, segments };
}

/** Replay records into a `Map`: a value sets the key, a tombstone deletes it. */
export function replay(records: readonly LogRecord[]): Map<string, number> {
  const state = new Map<string, number>();
  for (const r of records) {
    if (r.value === null) state.delete(r.key);
    else state.set(r.key, r.value);
  }
  return state;
}

export const sameState = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/** The keys whose state differs between the full history and the log on disk. */
export const stateDiff = (log: SegLog): string[] => {
  const full = replay(log.history);
  const disk = replay(onDisk(log));
  return [...new Set([...full.keys(), ...disk.keys()])].filter((k) => full.get(k) !== disk.get(k)).sort();
};

export type Read = { kind: 'record'; record: LogRecord } | { kind: 'out-of-range'; logStart: number } | { kind: 'end' };

/** What a consumer asking for `position` gets: the first record on disk at or after it, or an error if it is below the log start. */
export function readFrom(log: SegLog, position: number): Read {
  if (position < log.logStart) return { kind: 'out-of-range', logStart: log.logStart };
  const record = onDisk(log).find((r) => r.offset >= position);
  return record ? { kind: 'record', record } : { kind: 'end' };
}

/** Offsets that exist inside the log's range but are not on disk: the holes compaction leaves, and nothing else. */
export function gaps(log: SegLog): number[] {
  const have = new Set(onDisk(log).map((r) => r.offset));
  return Array.from({ length: log.history.length }, (_, o) => o).filter((o) => o >= log.logStart && !have.has(o));
}

/** The starting log of the scene: `a` is updated all the time, `b` now and then, `c` once, so the two policies treat them differently. */
export const PRELOAD_KEYS = ['a', 'b', 'a', 'a', 'a', 'c', 'a', 'b', 'a', 'a', 'a', 'b', 'a'] as const;
/** Where the consumer starts: below the log start that retention reaches with the default settings. */
export const DEFAULT_POSITION = 2;

/** The starting log: update number i (from 0) of `PRELOAD_KEYS` sets its key to i + 1. */
export const preloaded = (): SegLog => {
  let log = emptyLog();
  PRELOAD_KEYS.forEach((key, i) => {
    const r = append(log, key, i + 1);
    if (r.ok) log = r.log;
  });
  return log;
};
