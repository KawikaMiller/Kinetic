/** What the scenes draw, as pure functions of the model, plus each scene's opening state. */
import type { LogRow } from '../../components/logRows';
import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import {
  INSTANCES, NEW_COLUMN, OLD_COLUMN, PRESETS, ROWS, STEP_IDS, cleanOrderCount, runMigration, type Run, type Snapshot, type SqlEvent, type StepId,
} from './model';
import { CLIENT_TIMEOUT_S, type LockRun } from './lock';


export const MIGRATION_OPEN = { order: [] as StepId[], deploy: 60, seed: 7 } as const;
export const LOCKS_OPEN = { big: true, timeout: false, batch: 100 } as const;
export const CLOCKS_OPEN = { deploy: 60 } as const;

export const STEP_LABEL: Record<StepId, string> = {
  expand: '1. Expand: add the new column',
  dualWrite: '2. Dual-write: v2 writes both columns',
  backfill: '3. Backfill: copy old into new',
  switchReads: '4. Switch reads to the new column',
  stopWriting: '5. Stop writing the old column',
  contract: '6. Contract: drop the old column',
};
export const STEP_SHORT: Record<StepId, string> = { expand: 'Expand', dualWrite: 'Dual-write', backfill: 'Backfill', switchReads: 'Switch reads', stopWriting: 'Stop writing', contract: 'Contract' };

/** The statement each step stands for; the three v2 release steps run no SQL themselves, so they show the statement v2 then sends. */
export const STEP_CODE: Record<StepId, string> = {
  expand: `ALTER TABLE users ADD COLUMN ${NEW_COLUMN} INTEGER;`,
  dualWrite: `-- v2 now sends: UPDATE users SET ${OLD_COLUMN} = ?, ${NEW_COLUMN} = ? WHERE id = ?;`,
  backfill: `UPDATE users SET ${NEW_COLUMN} = ${OLD_COLUMN} WHERE id BETWEEN ? AND ?;`,
  switchReads: `-- v2 now reads: SELECT ${NEW_COLUMN} FROM users WHERE id = ?;`,
  stopWriting: `-- v2 now sends: UPDATE users SET ${NEW_COLUMN} = ? WHERE id = ?;`,
  contract: `ALTER TABLE users DROP COLUMN ${OLD_COLUMN};`,
};
export const CODE_LINES = STEP_IDS.map((s) => STEP_CODE[s]);

export type CodeState = 'idle' | 'done' | 'now' | 'bad';

/** A code line's state at a frame: the step applied there is now (bad if its statement failed), earlier applied steps are done. */
export function codeState(run: Run, frame: number, step: StepId): CodeState {
  const applied = run.order.slice(0, frame);
  if (!applied.includes(step)) return 'idle';
  const failed = run.events.some((e) => e.step === step && !e.ok);
  if (run.order[frame - 1] === step) return failed ? 'bad' : 'now';
  return failed ? 'bad' : 'done';
}

export const eventsOf = (run: Run, frame: number): SqlEvent[] => run.events.filter((e) => e.frame === frame);

export function requestRows(events: readonly SqlEvent[]): LogRow[] {
  return events.map((e) => ({
    id: `e${e.id}`,
    source: e.who,
    sourceTone: e.who === 'v1' ? ('info' as const) : e.who === 'v2' ? ('violet' as const) : ('hi' as const),
    tone: !e.ok ? ('bad' as const) : e.stale ? ('orange' as const) : undefined,
    text: e.text,
  }));
}

export interface CellLook {
  text: string;
  tone: Tone;
  fill: 'tint' | 'outline';
}

/** A table cell: the old column dim once dropped and info before, the new column ok once populated, orange where it disagrees with the last write. */
export function tableCell(s: Snapshot, row: number, col: 0 | 1): CellLook {
  if (col === 0) return s.hasName ? { text: String(s.rows[row].name), tone: 'info', fill: 'tint' } : { text: '', tone: 'dim', fill: 'outline' };
  if (!s.hasFull) return { text: '', tone: 'dim', fill: 'outline' };
  const v = s.rows[row].full;
  if (v === null) return { text: 'NULL', tone: 'dim', fill: 'outline' };
  return { text: String(v), tone: v === s.truth[row] ? 'ok' : 'orange', fill: 'tint' };
}

/** A rail beside a row: green once its new column holds the last value written, orange when it holds an older one. */
export function rowRail(s: Snapshot, row: number): { tone: Tone; label: string } | null {
  if (!s.hasFull || s.rows[row].full === null) return null;
  return s.rows[row].full === s.truth[row] ? { tone: 'ok', label: 'copied' } : { tone: 'orange', label: 'stale' };
}

export const fleetOf = (s: Snapshot): ('v1' | 'v2')[] => Array.from({ length: INSTANCES }, (_, i) => (i < s.v2 ? 'v2' : 'v1'));

export function frameCaption(run: Run, frame: number): string {
  const s = run.frames[frame];
  const last = run.frames.length - 1;
  const fleet = `${s.v2} of ${INSTANCES} instances run v2`;
  if (frame === 0) return `The table has ${ROWS} rows in ${OLD_COLUMN}. ${run.order.length === 0 ? 'Press the steps in the order you choose, or load a preset.' : `Press play to run ${run.order.length} steps while requests keep arriving.`}`;
  const requests = eventsOf(run, frame).filter((e) => e.op !== 'step');
  const failed = requests.filter((e) => !e.ok).length;
  const stale = requests.filter((e) => e.stale).length;
  const what = frame === last ? 'The migration is over and traffic carries on' : `${STEP_SHORT[run.order[frame - 1]]} ran`;
  return `${what}: ${fleet}. Of ${requests.length} requests around it, ${failed} failed and ${stale} read an older value.`;
}

export function verdictText(run: Run): string {
  const parts: string[] = [];
  if (run.skipped.length > 0) parts.push(`${run.skipped.map((s) => STEP_SHORT[s].toLowerCase()).join(', ')} never ran`);
  if (run.errors > 0) parts.push(`${run.errors} ${run.errors === 1 ? 'request failed' : 'requests failed'} on a missing column`);
  if (run.staleReads > 0) parts.push(`${run.staleReads} ${run.staleReads === 1 ? 'read returned' : 'reads returned'} an older value`);
  if (run.lostRows.length > 0) parts.push(`${run.lostRows.length} ${run.lostRows.length === 1 ? 'row ends' : 'rows end'} without the last value written`);
  return parts.length === 0 ? 'Clean: every request succeeded, every read was current and no write was lost.' : `Not clean: ${parts.join('; ')}.`;
}

export const cleanCount = (deploy: number) => cleanOrderCount(deploy);

export const presetOrder = (id: string): StepId[] => [...PRESETS.find((p) => p.id === id)!.order];
export const runOf = (order: readonly StepId[], deploy: number, seed: number) => runMigration(order, deploy, seed);

// ── locks ─────────────────────────────────────────────────────────────

export function lockBars(run: LockRun): { bars: GanttBar[]; lanes: { id: string; label: string }[]; domain: [number, number] } {
  const end = Math.max(run.done + 1, 6);
  const bars: GanttBar[] = [{ id: 'q', lane: 'query', start: 0, end: run.queryEnd, tone: 'info', label: 'long query' }];
  run.attempts.forEach((a, i) => {
    if (a.end > a.start) bars.push({ id: `a${i}`, lane: 'ddl', start: a.start, end: a.end, tone: a.outcome === 'gave-up' ? 'bad' : 'hi', kind: 'wait', label: a.outcome === 'gave-up' ? 'gave up' : 'waiting for the lock' });
  });
  const last = run.attempts.at(-1)!;
  bars.push({ id: 'hold', lane: 'ddl', start: last.end, end: run.done, tone: 'hi', label: 'ALTER' });
  run.blocked.forEach((b, i) => {
    const split = Math.min(b.end, b.start + CLIENT_TIMEOUT_S);
    bars.push({ id: `b${i}`, lane: 'queue', start: b.start, end: split, tone: 'hi', label: 'requests queue' });
    if (b.end > split) bars.push({ id: `bb${i}`, lane: 'queue', start: split, end: b.end, tone: 'bad', label: 'past the timeout' });
  });
  return { bars, lanes: [{ id: 'query', label: 'Long query' }, { id: 'ddl', label: 'ALTER TABLE' }, { id: 'queue', label: 'Queued requests' }], domain: [0, end] };
}
