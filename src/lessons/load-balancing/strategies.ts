import { TOKENS } from '../../core/palette';

export type StrategyId = 'rr' | 'random' | 'least' | 'p2c' | 'wrr';

/** Every strategy, in display order. The colour is shared by the canvas label and the chart. */
export const STRATEGIES: readonly { id: StrategyId; label: string; color: string }[] = [
  { id: 'rr', label: 'Round robin', color: TOKENS.orange },
  { id: 'random', label: 'Random', color: TOKENS.violet },
  { id: 'least', label: 'Least conn', color: TOKENS.ok },
  { id: 'p2c', label: 'Power of 2', color: TOKENS.info },
  { id: 'wrr', label: 'Weighted RR', color: TOKENS.hi },
];

export const strategy = (id: StrategyId) => STRATEGIES.find((s) => s.id === id)!;
