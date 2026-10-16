/** Captions for scenes 2 and 3. Pure helpers over the model. */
import { ALL_ORDERS, PANEL_SEEDS, PANEL_SIZE, STEP_IDS, runMigration, type Run } from './model';
import { CLIENT_TIMEOUT_S, type LockRun } from './lock';
import { STEP_SHORT } from './view';

export const deployStarts = (): number[] => [0, 20, 40, 60, 80, 100];
/** The textbook order on every request mix of the panel. */
export const correctRuns = (deploy: number): Run[] => PANEL_SEEDS.map((seed) => runMigration([...STEP_IDS], deploy, seed));
export const textbookClean = (deploy: number): boolean => correctRuns(deploy).every((r) => r.clean);
/** Failed and stale requests that followed step k (0-based) of the textbook order, summed over the panel. */
export const troubleAfterStep = (runs: readonly Run[], k: number): number => runs.reduce((n, r) => n + r.frames[k + 1].errors + r.frames[k + 1].stale, 0);

export function clocksCaption(deploy: number, runs: readonly Run[], clean: number): string {
  const first = STEP_IDS.findIndex((_, k) => troubleAfterStep(runs, k) > 0);
  const where = first === -1 ? 'no step is followed by a failed or stale request' : `the first trouble follows ${STEP_SHORT[STEP_IDS[first]].toLowerCase()}`;
  return `With ${deploy}% of the fleet on v2 at the start, the textbook order is ${runs.every((r) => r.clean) ? 'clean' : 'not clean'} on ${PANEL_SIZE} request mixes: ${where}. ${clean} of ${ALL_ORDERS.length} orderings of the six steps run clean on all of them.`;
}

export function lockCaption(run: LockRun, big: boolean, timeoutOn: boolean): string {
  const tries = run.attempts.length;
  const how = timeoutOn ? `${tries} ${tries === 1 ? 'attempt' : 'attempts'} with a lock timeout` : 'waiting as long as it takes';
  const past = run.timedOut > 0 ? `${run.timedOut} requests waited past the ${CLIENT_TIMEOUT_S} s client timeout` : `no request waited past the ${CLIENT_TIMEOUT_S} s client timeout`;
  return `On a ${big ? 'big' : 'small'} table the ALTER, ${how}, blocks new requests for up to ${run.longestBlockS.toFixed(1)} s, with up to ${run.peakQueue} queued; ${past}.`;
}
