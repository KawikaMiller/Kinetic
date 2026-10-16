/**
 * The toy database behind backups-disaster-recovery: a seeded history of timestamped operations, snapshots taken from it,
 * a log archive shipped in segments, and restore (the latest snapshot before a target, then replay of the archived log).
 * All times are minutes since Monday 00:00 UTC.
 */
import { mulberry32 } from '../../core/random';

export const MIN_PER_HOUR = 60;
export const WEEK_MIN = 7 * 24 * MIN_PER_HOUR;
export const WEEK_HOURS = 7 * 24;
export const CALENDAR_START = '2026-03-02T00:00:00Z';
export const KEYS = 8;
/** The weekly full backup is taken on Monday at 02:00. */
export const FULL_AT = 2 * MIN_PER_HOUR;
/** A bad deployment drops the table at Thursday 14:07. */
export const BAD_DEPLOY_AT = (3 * 24 + 14) * MIN_PER_HOUR + 7;
/** The disaster the scene opens on: Thursday 14:37. */
export const DEFAULT_DISASTER_AT = (3 * 24 + 14) * MIN_PER_HOUR + 37;

export type OpKind = 'set' | 'del' | 'drop';
export interface Op {
  t: number;
  kind: OpKind;
  key?: number;
  value?: number;
}
export type State = Record<number, number>;

export function applyOp(state: State, op: Op): State {
  if (op.kind === 'drop') return {};
  const next = { ...state };
  if (op.kind === 'del') delete next[op.key!];
  else next[op.key!] = op.value!;
  return next;
}

/** The database as a never-failed copy had it at time `t` (operations at or before `t` applied): the oracle. */
export const fold = (history: readonly Op[], t: number, from: State = {}, after = -1): State =>
  history.filter((o) => o.t > after && o.t <= t).reduce(applyOp, from);

export const OPS_MIN = 40;
export const OPS_MAX = 70;

/** A week of operations at seeded minutes, in time order; with `withDrop` the bad deployment drops the table at Thursday 14:07. */
export function seededHistory(seed: number, withDrop = false): Op[] {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const n = OPS_MIN + pick(OPS_MAX - OPS_MIN + 1);
  const ops: Op[] = Array.from({ length: n }, () => {
    const t = 1 + pick(WEEK_MIN - 1);
    const key = 1 + pick(KEYS);
    return rnd() < 0.2 ? { t, kind: 'del' as const, key } : { t, kind: 'set' as const, key, value: 1 + pick(999) };
  });
  if (withDrop) ops.push({ t: BAD_DEPLOY_AT, kind: 'drop' });
  return ops.sort((a, b) => a.t - b.t || (a.kind === 'drop' ? 1 : 0) - (b.kind === 'drop' ? 1 : 0));
}

// ── snapshots ─────────────────────────────────────────────────────────

export interface Snapshot {
  t: number;
  /** The first is the weekly full backup; the rest are incrementals since it. */
  kind: 'full' | 'incremental';
}

export const MIN_SNAPSHOT_H = 6;
export const MAX_SNAPSHOT_H = 48;

export function snapshotsFor(intervalH: number): Snapshot[] {
  const out: Snapshot[] = [{ t: FULL_AT, kind: 'full' }];
  for (let t = FULL_AT + intervalH * MIN_PER_HOUR; t <= WEEK_MIN; t += intervalH * MIN_PER_HOUR) out.push({ t, kind: 'incremental' });
  return out;
}

// ── the log archive ───────────────────────────────────────────────────

export const MIN_LOG_MIN = 5;
export const MAX_LOG_MIN = 60;

/** Segment j holds the operations in (j L, (j + 1) L] and is on the archive from time (j + 1) L, unless it is lost. */
export const segmentEnd = (j: number, logMin: number) => (j + 1) * logMin;
export const segmentOf = (t: number, logMin: number) => Math.max(0, Math.ceil(t / logMin) - 1);

export interface RestoreInput {
  history: readonly Op[];
  snapshots: readonly Snapshot[];
  /** Is the log archive on, and how often does it ship a segment. */
  logMin: number | null;
  /** Segments that never reached the archive. */
  gaps: ReadonlySet<number>;
  /** When the disaster strikes: nothing after it is on the archive. */
  disasterAt: number;
}

export interface Restored {
  /** The database after the restore. */
  state: State;
  /** The time the restored database stands at: the target, or earlier when the restore had to stop. */
  reached: number;
  /** The snapshot the restore started from, or null when it started from an empty database and the whole log. */
  base: Snapshot | null;
  /** The first missing segment the replay hit, or null. */
  stoppedAtGap: number | null;
  /** Why it stopped short of the target, or null when it reached it. */
  reason: string | null;
}

/** The latest snapshot taken at or before `t`. */
export const baseFor = (snapshots: readonly Snapshot[], t: number): Snapshot | null => [...snapshots].reverse().find((s) => s.t <= t) ?? null;

/**
 * Restore to `target`: take the latest snapshot at or before it, then replay the archived log segment by segment up to the target.
 * Replay stops at the first segment that is missing or not yet shipped, and says so: it never skips over a gap.
 */
export function restore(i: RestoreInput, target: number): Restored {
  const base = baseFor(i.snapshots, Math.min(target, i.disasterAt));
  const from = base ? fold(i.history, base.t) : {};
  const start = base ? base.t : 0;
  if (i.logMin === null) {
    const reason = target > start ? 'there is no log archive, so the restore stops at the snapshot' : null;
    return { state: from, reached: start, base, stoppedAtGap: null, reason };
  }
  const L = i.logMin;
  let state = from;
  let reached = start;
  let stoppedAtGap: number | null = null;
  let reason: string | null = null;
  for (let j = segmentOf(start + 1, L); reached < target; j++) {
    if (i.gaps.has(j)) {
      stoppedAtGap = j;
      reason = `segment ${j} (${clock(j * L)} to ${clock(segmentEnd(j, L))}) is missing from the archive, and replay cannot cross a gap`;
      break;
    }
    if (segmentEnd(j, L) > i.disasterAt) {
      reason = `the segment ending ${clock(segmentEnd(j, L))} was never shipped before the disaster`;
      break;
    }
    const to = Math.min(target, segmentEnd(j, L));
    state = fold(i.history, to, state, reached);
    reached = to;
  }
  return { state, reached, base, stoppedAtGap, reason };
}

/** The latest time a restore can reach: restore to the disaster and see how far it gets. */
export const latestRecoverable = (i: RestoreInput): number => restore(i, i.disasterAt).reached;

/** RPO of this plan at this disaster: the time between the last recoverable point and the disaster, in minutes. */
export const dataLostMin = (i: RestoreInput): number => i.disasterAt - latestRecoverable(i);

// ── restore time ──────────────────────────────────────────────────────

export const FULL_GB = 400;
export const INCREMENTAL_GB = 20;
export const LOG_GB_PER_HOUR = 2;
export const MIN_THROUGHPUT = 100;
export const MAX_THROUGHPUT = 1000;
export const DEFAULT_THROUGHPUT = 500;
/** Replaying the log runs at this share of the restore throughput. */
export const REPLAY_SHARE = 0.5;

export interface RestoreTime {
  restoreGB: number;
  replayGB: number;
  restoreS: number;
  replayS: number;
  totalS: number;
}

/** RTO of a restore: restore the full plus the incrementals, then replay the log from the base to the target. */
export function restoreTime(i: RestoreInput, target: number, mbPerS: number): RestoreTime {
  const r = restore(i, target);
  const chain = r.base ? i.snapshots.filter((s) => s.t <= r.base!.t) : [];
  const restoreGB = chain.reduce((gb, s) => gb + (s.kind === 'full' ? FULL_GB : INCREMENTAL_GB), 0);
  const replayGB = ((r.reached - (r.base?.t ?? 0)) / MIN_PER_HOUR) * LOG_GB_PER_HOUR;
  const restoreS = (restoreGB * 1024) / mbPerS;
  const replayS = (replayGB * 1024) / (mbPerS * REPLAY_SHARE);
  return { restoreGB, replayGB, restoreS, replayS, totalS: restoreS + replayS };
}

// ── clock text ────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_NAMES = DAYS;
const two = (n: number) => String(n).padStart(2, '0');

/** "Thu 14:07" for a minute of the week. */
export function clock(t: number): string {
  const day = Math.min(6, Math.floor(t / (24 * MIN_PER_HOUR)));
  const inDay = t - day * 24 * MIN_PER_HOUR;
  return `${DAYS[day]} ${two(Math.floor(inDay / MIN_PER_HOUR))}:${two(inDay % MIN_PER_HOUR)}`;
}

/** Seeded gap positions: `count` distinct segments among those that lie wholly between `from` and `before`. */
export function seededGaps(seed: number, logMin: number, before: number, count = 1, from = 0): Set<number> {
  const rnd = mulberry32(seed * 977 + 13);
  const first = Math.ceil(from / logMin);
  const segments = Math.max(1, Math.floor(before / logMin) - first);
  const out = new Set<number>();
  while (out.size < Math.min(count, segments)) out.add(first + Math.floor(rnd() * segments));
  return out;
}
