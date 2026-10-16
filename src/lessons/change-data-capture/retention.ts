/** Scene 4: what a lagging or dead reader costs the source's disk. A pure function of time. */

export const RECORD_BYTES = 512;
export const SEGMENT_RECORDS = 64;
/** What the source keeps for its own crash recovery when no reader needs more. */
export const RECOVERY_RECORDS = 128;
export const WRITES_PER_TICK = 50;
export const MAX_TICKS = 100;
export const DISK_BUDGET_BYTES = 1024 * 1024;

export interface RetentionConfig {
  /** The source keeps every record after the reader's saved position (a slot), or only what crash recovery needs. */
  slot: boolean;
  /** Records the reader lags behind the newest while it is alive. */
  lagRecords: number;
  /** The tick the reader dies (MAX_TICKS + 1: it never does). */
  deadAt: number;
}

export interface RetentionPoint {
  tick: number;
  written: number;
  /** The reader's saved position, in records. */
  saved: number;
  retainedRecords: number;
  bytes: number;
  /** The reader could resume from its saved position. */
  resumable: boolean;
  overBudget: boolean;
}

const segmentsOf = (records: number) => Math.ceil(records / SEGMENT_RECORDS) * SEGMENT_RECORDS;

export function retentionAt(c: RetentionConfig, tick: number): RetentionPoint {
  const written = WRITES_PER_TICK * tick;
  const aliveUntil = Math.min(tick, c.deadAt);
  const saved = Math.max(0, WRITES_PER_TICK * aliveUntil - c.lagRecords);
  const need = written - saved;
  const retainedRecords = segmentsOf(c.slot ? Math.max(need, RECOVERY_RECORDS) : Math.min(RECOVERY_RECORDS, Math.max(written, 0)));
  const bytes = retainedRecords * RECORD_BYTES;
  return { tick, written, saved, retainedRecords, bytes, resumable: c.slot || need <= RECOVERY_RECORDS, overBudget: bytes > DISK_BUDGET_BYTES };
}

export const retentionSeries = (c: RetentionConfig) => Array.from({ length: MAX_TICKS + 1 }, (_, t) => retentionAt(c, t));
