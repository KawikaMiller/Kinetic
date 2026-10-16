/** warehouse-lake-lakehouse: each scene's opening state as a pure function, so a test can switch through all five scenes and pin it. */
import { DEFAULT_CONTENTION_SEED } from './contention';
import type { Mode, Rule } from './pipeline';
import { DEFAULT_STAR_SEED, type QuestionId } from './star';
import { initialLake, type Lake } from './tableformat';
import type { Placement } from './workload';

/** Everything on the row store: the placement most people start with, and the one with the most to show. */
export const initialWorkloadScene = (): { placement: Placement; seed: number } => ({ placement: { points: 'row', scans: 'row' }, seed: DEFAULT_CONTENTION_SEED });
export const initialPipelineScene = (): { mode: Mode; rule: Rule } => ({ mode: 'etl', rule: 'v1' });
export const initialStarScene = (): { question: QuestionId; snowflake: boolean; seed: number } => ({ question: 'region-month', snowflake: false, seed: DEFAULT_STAR_SEED });
export const initialLakeScene = (): { lake: Lake; layer: boolean; viewing: number | null } => ({ lake: initialLake(), layer: true, viewing: null });

export type NeedId = 'schema' | 'transactions' | 'open' | 'cost' | 'bi';
export const ALL_NEEDS: NeedId[] = ['schema', 'transactions', 'open', 'cost', 'bi'];
/** The comparison scene opens with every property counted. */
export const initialNameScene = (): { needs: NeedId[] } => ({ needs: [...ALL_NEEDS] });
