import { BUGGY, intendedCost, type Input } from './program';
import { approveCurrent, type CodeVariant, type Suite } from './suite';

export type PresetId = 'smoke' | 'weak' | 'precise' | 'snapshot' | 'empty';

export interface Preset {
  id: PresetId;
  label: string;
  /** The code the preset runs against (the snapshot preset needs the off-by-one). */
  variant: CodeVariant;
  suite: Suite;
}

/** Two calls that between them walk every line and every branch of `cost`. */
const WALK_EVERYTHING: Input[] = [
  { weight: 5, express: false },
  { weight: 15, express: true },
];

/** Boundary-minded inputs: both express values, the weight at the threshold, just past it, and well past it. */
const PRECISE_INPUTS: Input[] = [
  { weight: 0, express: true },
  { weight: 10, express: false },
  { weight: 11, express: false },
  { weight: 25, express: true },
];

const SNAPSHOT_INPUTS: Input[] = [
  { weight: 5, express: false },
  { weight: 10, express: false },
  { weight: 11, express: false },
  { weight: 15, express: true },
  { weight: 25, express: false },
];

const intended = (inputs: Input[]) => inputs.map((i) => ({ ...i, expected: intendedCost(i.weight, i.express) }));

export const PRESETS: readonly Preset[] = [
  { id: 'smoke', label: 'Just call it', variant: 'cost', suite: { mode: 'none', cases: intended(WALK_EVERYTHING) } },
  { id: 'weak', label: 'Returns a number', variant: 'cost', suite: { mode: 'weak', cases: intended(WALK_EVERYTHING) } },
  { id: 'precise', label: 'Small precise suite', variant: 'cost', suite: { mode: 'exact', cases: intended(PRECISE_INPUTS) } },
  {
    id: 'snapshot',
    label: 'Approve current output',
    variant: 'buggy',
    suite: approveCurrent(BUGGY, { mode: 'exact', cases: intended(SNAPSHOT_INPUTS) }),
  },
  { id: 'empty', label: 'Empty suite', variant: 'cost', suite: { mode: 'exact', cases: [] } },
];

export const presetOf = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

/** What the lesson opens on: the suite that calls the function twice and asserts nothing. */
export const OPENING = presetOf('smoke');
