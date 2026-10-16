/** Captions and verdict sentences, every number from the model on screen. Plain strings, so tests can read them. */
import type { CheckpointRun, GroupRun } from './cost';
import { committedIn, crash, losersIn, recoverySteps, txName, violations, type Image, type Machine, type RecoveryEvent, type Violation } from './wal';
import { dirtyCount } from './view';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function machineCaption(m: Machine): string {
  const tail = m.log.length - m.durable;
  const last = m.events.at(-1);
  const head = `${plural(m.log.length, 'log record')}, ${m.durable === 0 ? 'none durable' : `durable up to LSN ${m.durable}`}${tail > 0 ? `, ${plural(tail, 'record')} still in memory` : ''}; ${plural(dirtyCount(m), 'dirty page')} in the pool.`;
  return last ? `${head} Last: ${last}.` : `${head} Write a page, or load a preset, then press Crash now.`;
}

export interface CrashReport {
  image: Image;
  recovered: Image;
  events: RecoveryEvent[];
  violations: Violation[];
  redone: number;
  skipped: number;
  undone: number;
}

export function crashReport(m: Machine, torn: boolean): CrashReport {
  const image = crash(m, torn);
  const r = recoverySteps(image);
  const count = (k: RecoveryEvent['kind']) => r.events.filter((e) => e.kind === k).length;
  return { image, recovered: r.image, events: r.events, violations: violations(m, image, r.image.disk), redone: count('redo'), skipped: count('skip'), undone: count('undo') };
}

export function verdictText(r: CrashReport, acked: number[]): string {
  const winners = committedIn(r.image.log);
  const losers = losersIn(r.image.log);
  const head = `Recovery redid ${plural(r.redone, 'record')}, skipped ${plural(r.skipped, 'record')} whose page was already up to date and undid ${plural(r.undone, 'write')} of ${plural(losers.length, 'loser')}. ${plural(winners.length, 'transaction')} committed on disk, ${acked.length} acknowledged.`;
  if (r.violations.length === 0) return `${head} The recovered pages equal a serial replay of the committed transactions: nothing acknowledged was lost and nothing uncommitted survived.`;
  return `${head} ${r.violations.map((v) => `${v.rule === 'D' ? 'Durability broken' : v.rule === 'A' ? 'Atomicity broken' : 'Mismatch'}: ${v.message}`).join('. ')}.`;
}

export function eventText(e: RecoveryEvent): string {
  switch (e.kind) {
    case 'redo': return `Redo LSN ${e.lsn}: page ${e.page} was behind it, so it is set to ${e.value}`;
    case 'skip': return `Skip LSN ${e.lsn}: page ${e.page} already has page LSN ${e.pageLsn}, so redoing it would change nothing`;
    case 'undo': return `Undo LSN ${e.undoOf} of ${txName(e.tx)}: page ${e.page} goes back to ${e.value}, logged as LSN ${e.lsn}`;
    default: return `${txName(e.tx)} is fully undone: abort record at LSN ${e.lsn}`;
  }
}

export function recoveryCaption(event: RecoveryEvent | null, crashed: boolean, index: number, total: number): string {
  if (crashed) return `Crash during recovery. Pages written so far stay on disk, and so do the undo records recovery logged. Recovery starts over from the same log.`;
  if (event === null) return `Step ${index} of ${total}: the crash left these pages and this log. Press play to run recovery.`;
  return `Step ${index} of ${total}: ${eventText(event)}.`;
}

export function groupCaption(latencyMs: number, committers: number, plain: GroupRun, grouped: GroupRun): string {
  const f = (v: number) => Math.round(v).toLocaleString('en-US');
  return `With an fsync of ${latencyMs} ms and ${plural(committers, 'committer')}: ${f(plain.throughput)} commits a second when each commit waits for its own fsync (${plural(plain.fsyncs, 'fsync')}), ${f(grouped.throughput)} when waiting committers share one (${plural(grouped.fsyncs, 'fsync')}).`;
}

export function checkpointCaption(run: CheckpointRun): string {
  const every = run.interval === 0 ? 'No checkpoint' : `A checkpoint every ${run.interval} records`;
  return `${every}: ${plural(run.checkpoints, 'checkpoint')} cost ${plural(run.pageWrites, 'page write')}; wherever the crash falls, recovery scans at most ${plural(run.worstScanned, 'record')} of ${run.records} (${run.averageScanned} on average over ${run.crashPoints} crash points).`;
}
