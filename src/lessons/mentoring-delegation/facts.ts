/** Every number the lesson text quotes, computed from the model at the default state. */
import { choose, startWalk } from '../../core/scenario';
import { CAPACITY_HOURS, DEFAULT_PRESET, PRESETS, QUEUE_WARN, SEED, TASKS, WEEKS, hoursSummary, payback, simulate, startPlacement } from './model';
import { FEEDBACK, METER } from './scenario';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.plan;
const base = simulate(DEFAULT_PRESET.plan, SEED);
const noContext = simulate({ ...DEFAULT_PRESET.plan, context: 'none' }, SEED);
const myself = simulate(preset('myself'), SEED);
const flaky = payback(TASKS.find((t) => t.id === 'flaky')!, 'cy', DEFAULT_PRESET.plan.level, DEFAULT_PRESET.plan.context);
const solved = choose(FEEDBACK, startWalk(FEEDBACK), 'solve');
const sbi = choose(FEEDBACK, startWalk(FEEDBACK), 'sbi');
const hours = hoursSummary(startPlacement());

export const FACTS = {
  weeks: WEEKS,
  capacity: CAPACITY_HOURS,
  seed: SEED,
  queueWarn: QUEUE_WARN,
  defaultDone: base.totals.completed,
  defaultBounced: base.totals.bounced,
  defaultQueue: base.weeks[WEEKS - 1].queue,
  noContextBounced: noContext.totals.bounced,
  myselfQueue: myself.weeks[WEEKS - 1].queue,
  myselfMinPerWeek: Math.min(...myself.weeks.map((w) => w.completed)),
  myselfMaxPerWeek: Math.max(...myself.weeks.map((w) => w.completed)),
  flakyReps: flaky.reps,
  solveHours: solved.meters[METER.hours],
  solveDelivery: solved.meters[METER.delivery],
  sbiClarity: sbi.meters[METER.clarity],
  moved: hours.moved,
  returned: hours.returned,
  kept: hours.kept,
} as const;
