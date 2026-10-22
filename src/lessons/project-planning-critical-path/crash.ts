import type { Crash } from './captions';
import { PRESET, cpm, setDays } from './cpm';

export const CHANGE = { min: -3, max: 6 };
export const BASE = cpm(PRESET);
export const BASE_CRITICAL = new Set(BASE.critical);

/** The preset with one task's duration changed by up to `delta` days, against the preset itself. */
export function crashOf(taskId: string, delta: number): Crash {
  const days = PRESET.tasks.find((t) => t.id === taskId)!.days;
  const plan = setDays(PRESET, taskId, days + delta);
  const after = cpm(plan);
  /** A task keeps at least one day, so the change that really applied can be smaller than the one asked for. */
  const applied = plan.tasks.find((t) => t.id === taskId)!.days - days;
  return { taskId, delta: applied, before: BASE, after, newlyCritical: after.critical.filter((id) => !BASE_CRITICAL.has(id)) };
}
