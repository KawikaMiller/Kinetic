import { BAKE_DEFAULT, STAGE_CHOICES } from './model';

/** What the learner edits in the staged scene; the schedule scene reads the same plan. The all-at-once scene reads none of it. */
export interface PlanState {
  stages: (typeof STAGE_CHOICES)[number]['id'][];
  bake: number;
  gate: boolean;
  validate: boolean;
  autoRollback: boolean;
}

export const DEFAULT_PLAN: PlanState = { stages: ['canary', 'region', 'half'], bake: BAKE_DEFAULT, gate: true, validate: false, autoRollback: true };
