/** Captions for scenes 2 and 3. Pure helpers over the model. */
import { ALL_ORDERS, DEFAULT_SEED, STEP_IDS, runMigration, type Run } from './model';
import { CLIENT_TIMEOUT_S, type LockRun } from './lock';
import { STEP_SHORT } from './view';

export const deployStarts = (): number[] => [0, 20, 40, 60, 80, 100];
export const correctRun = (deploy: number): Run => runMigration([...STEP_IDS], deploy, DEFAULT_SEED);

export function clocksCaption(deploy: number, run: Run, clean: number): string {
  const first = run.frames.slice(1, STEP_IDS.length + 1).findIndex((f) => f.errors + f.stale > 0);
  const where = first === -1 ? 'no step is followed by a failed or stale request' : `the first trouble follows ${STEP_SHORT[STEP_IDS[first]].toLowerCase()}`;
  return `With ${deploy}% of the fleet on v2 at the start, the textbook order is ${run.clean ? 'clean' : 'not clean'}: ${where}. ${clean} of ${ALL_ORDERS.length} orderings of the six steps run clean.`;
}

export function lockCaption(run: LockRun, big: boolean, timeoutOn: boolean): string {
  const tries = run.attempts.length;
  const how = timeoutOn ? `${tries} ${tries === 1 ? 'attempt' : 'attempts'} with a lock timeout` : 'waiting as long as it takes';
  const past = run.timedOut > 0 ? `${run.timedOut} requests waited past the ${CLIENT_TIMEOUT_S} s client timeout` : `no request waited past the ${CLIENT_TIMEOUT_S} s client timeout`;
  return `On a ${big ? 'big' : 'small'} table the ALTER, ${how}, blocks new requests for up to ${run.longestBlockS.toFixed(1)} s, with up to ${run.peakQueue} queued; ${past}.`;
}
