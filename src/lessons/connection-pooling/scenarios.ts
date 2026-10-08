import type { Config } from './model';

export type ScenarioId = 'nopool' | 'small' | 'right' | 'toobig' | 'leak';

export interface Scenario {
  id: ScenarioId;
  label: string;
  config: Config;
}

/** Each preset is a starting point: every slider can still be moved. */
export const SCENARIOS: readonly Scenario[] = [
  { id: 'nopool', label: 'No pool', config: { rate: 400, instances: 2, poolSize: 10, dbMax: 100, queryMs: 2, usePool: false, leak: false } },
  { id: 'small', label: 'Pool too small', config: { rate: 250, instances: 2, poolSize: 2, dbMax: 100, queryMs: 20, usePool: true, leak: false } },
  { id: 'right', label: 'About right', config: { rate: 250, instances: 2, poolSize: 5, dbMax: 100, queryMs: 20, usePool: true, leak: false } },
  { id: 'toobig', label: 'Too big, many instances', config: { rate: 150, instances: 20, poolSize: 50, dbMax: 500, queryMs: 20, usePool: true, leak: false } },
  { id: 'leak', label: 'A leak', config: { rate: 100, instances: 2, poolSize: 10, dbMax: 100, queryMs: 20, usePool: true, leak: true } },
];

export const scenarioConfig = (id: ScenarioId): Config => ({ ...SCENARIOS.find((s) => s.id === id)!.config });
