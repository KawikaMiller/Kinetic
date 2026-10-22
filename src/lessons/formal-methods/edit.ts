/** Editing a spec's program: pure helpers for the step rows (add, remove, move up or down, set a guard or an effect). */
import { MAX_STEPS, type Effect, type Spec, type Step } from './spec';

export type Edited = { ok: true; spec: Spec } | { ok: false; message: string };

export function addStep(spec: Spec): Edited {
  if (spec.steps.length >= MAX_STEPS) return { ok: false, message: `At most ${MAX_STEPS} steps: remove one first.` };
  return { ok: true, spec: { ...spec, steps: [...spec.steps, { guard: 'true', effect: 'none' }] } };
}

/** Removing a step keeps the critical pc on the same step when it can, and the program at least one step long. */
export function removeStep(spec: Spec, index: number): Edited {
  if (spec.steps.length <= 1) return { ok: false, message: 'The program needs at least 1 step.' };
  const steps = spec.steps.filter((_, i) => i !== index);
  const shifted = index < spec.critical ? spec.critical - 1 : spec.critical;
  return { ok: true, spec: { ...spec, steps, critical: Math.min(shifted, steps.length - 1) } };
}

/** Swap a step with its neighbour. The critical pc stays on its number: it marks a position in the program, not a step. */
export function moveStep(spec: Spec, index: number, direction: -1 | 1): Edited {
  const other = index + direction;
  if (other < 0 || other >= spec.steps.length) return { ok: false, message: `Step ${index} is already ${direction < 0 ? 'first' : 'last'}.` };
  const steps = spec.steps.map((s, i) => (i === index ? spec.steps[other] : i === other ? spec.steps[index] : s));
  return { ok: true, spec: { ...spec, steps } };
}

export const setStep = (spec: Spec, index: number, patch: Partial<Step>): Spec => ({ ...spec, steps: spec.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
export const setEffect = (spec: Spec, index: number, effect: Effect): Spec => setStep(spec, index, { effect });
