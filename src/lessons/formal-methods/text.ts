import { exhaustiveText, sampledText, truncatedText } from '../../core/checkPhrases';
import { SEEDS_FROM, SEEDS_TO, type Check, type RandomRun, type Spec } from './spec';

export const NOT_CHECKED = 'Liveness (a process that never gets in while others do) is a separate claim and is not checked here.';
export const MODEL_NOT_CODE = 'This checked a model of the lock, not your code.';

/** What the exhaustive check found, in words: one of holds, truncated, violated, deadlock or refused. */
export function checkText(c: Check, spec: Spec): string {
  switch (c.kind) {
    case 'holds': return `${exhaustiveText(c.states, `${spec.n} processes, ${spec.steps.length} steps`)}. ${MODEL_NOT_CODE}`;
    case 'truncated': return `${truncatedText(c.states)}.`;
    case 'violation': return `Violated: the shortest path has ${c.steps} steps. The property that failed: ${spec.invariant}.`;
    case 'deadlock': return `Deadlock after ${c.steps} steps: no process can take a step. Unsafe and stuck are different failures.`;
    default: return `Refused: ${c.message}`;
  }
}

/** The seeded random-testing leg, for contrast with the exhaustive one. */
export function randomText(r: RandomRun | { error: string }): string {
  if ('error' in r) return `Random testing did not run: ${r.error}`;
  if (r.failing === 0) return `Random testing: ${sampledText(r.total, r.total, SEEDS_FROM, SEEDS_TO)}. That says those schedules passed, nothing more.`;
  return `Random testing: ${r.failing} of ${r.total} seeded schedules (seeds ${SEEDS_FROM} to ${SEEDS_TO}) reached a failing state; the lowest failing seed is ${r.lowestFailingSeed}.`;
}
