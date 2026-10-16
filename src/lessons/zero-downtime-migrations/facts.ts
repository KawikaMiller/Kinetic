/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { correctRun, deployStarts } from './clocks';
import { DEFAULT_BATCH, MAX_BATCH, DEFAULT_LOCK_TIMEOUT_S, batchRun, lockRun } from './lock';
import { ALL_ORDERS } from './model';
import { CLOCKS_OPEN, LOCKS_OPEN, MIGRATION_OPEN, cleanCount, presetOrder, runOf } from './view';

export function presetFacts(id: string) {
  const r = runOf(presetOrder(id), MIGRATION_OPEN.deploy, MIGRATION_OPEN.seed);
  return { errors: r.errors, stale: r.staleReads, lost: r.lostRows.length, clean: r.clean };
}

export const cleanAtOpen = () => cleanCount(MIGRATION_OPEN.deploy, MIGRATION_OPEN.seed);

export function clocksFacts() {
  const at = (d: number) => ({ clean: cleanCount(d, MIGRATION_OPEN.seed), textbookClean: correctRun(d).clean });
  return { open: at(CLOCKS_OPEN.deploy), none: at(0), all: deployStarts().map((d) => ({ d, ...at(d) })), total: ALL_ORDERS.length };
}

export function lockFacts() {
  const wait = lockRun({ big: LOCKS_OPEN.big, lockTimeoutS: null });
  const short = lockRun({ big: LOCKS_OPEN.big, lockTimeoutS: DEFAULT_LOCK_TIMEOUT_S });
  const small = lockRun({ big: false, lockTimeoutS: null });
  return { wait, short, small, batch100: batchRun(DEFAULT_BATCH), batch1000: batchRun(MAX_BATCH), batch1: batchRun(1) };
}
