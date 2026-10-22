import { power } from '../../core/format';
import { NAIVE, PETERSON, atomicLockClosedForm, atomicLockStates, check, randomTest, type Check, type Spec } from './spec';

const guarded = (guard: string): Spec => ({ ...PETERSON, steps: PETERSON.steps.map((s, k) => (k === 2 ? { ...s, guard } : s)) });
const steps = (c: Check): number => (c.kind === 'violation' || c.kind === 'deadlock' ? c.steps : 0);
const states = (c: Check): number => (c.kind === 'refused' ? 0 : c.states);

const peterson = check(PETERSON);
const naiveRandom = randomTest(NAIVE);

/** Every number the lesson text quotes, computed from the model at import time. */
export const FACTS = {
  petersonStates: states(peterson),
  naiveSteps: steps(check(NAIVE)),
  trueGuardSteps: steps(check(guarded('true'))),
  noTurnSteps: steps(check(guarded('flagOther == 0'))),
  growth: [2, 3, 4, 5, 6].map((n) => atomicLockStates(n).states),
  closed: (n: number) => `${power(n)} + ${n} x ${power(n - 1)} = ${atomicLockClosedForm(n)}`,
  naiveRandomFailing: 'error' in naiveRandom ? 0 : naiveRandom.failing,
  naiveRandomLowest: 'error' in naiveRandom ? 0 : (naiveRandom.lowestFailingSeed ?? 0),
};
