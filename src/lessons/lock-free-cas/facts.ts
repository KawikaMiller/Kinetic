import { ADVERSARY_ROUNDS, SUSPEND_STEPS, adversaryRun, executionStats, firstAttempt, suspendedRun } from './counter';
import { PRESETS, search } from './stack';

const program = (id: string) => PRESETS.find((p) => p.id === id)!.programs;
const reuse = program('reuse');
const repush = program('repush');
const run = (programs: typeof reuse, mode: 'plain' | 'tagged' | 'hazard') => search(programs, { mode });
const depth = (r: ReturnType<typeof run>) => r.violation?.path.length ?? 0;

/** Every number the lesson text quotes, computed from the model at import time. */
const plain = run(reuse, 'plain');
const adversary = adversaryRun('cas');

export const FACTS = {
  executions2: executionStats(2).executions,
  executions3: executionStats(3).executions,
  retrying2: firstAttempt(2).retrying,
  interleavings2: firstAttempt(2).interleavings,
  reuseDepth: depth(plain),
  reuseMessage: plain.violation?.message ?? '',
  reuseTaggedStates: run(reuse, 'tagged').states,
  reuseHazardStates: run(reuse, 'hazard').states,
  repushPlainDepth: depth(run(repush, 'plain')),
  repushHazardDepth: depth(run(repush, 'hazard')),
  rounds: ADVERSARY_ROUNDS,
  suspendSteps: SUSPEND_STEPS,
  adversaryFailed: adversary.failed[0],
  adversaryT1: adversary.completed[0],
  adversaryT2: adversary.completed[1],
  lockT2: suspendedRun('lock').completed[1],
  fetchAddT1Steps: adversaryRun('fetch_add').t1Steps ?? 0,
};
