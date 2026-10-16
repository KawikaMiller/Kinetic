/** mapreduce-batch: each scene's opening state as a pure function, so a test can switch through all five scenes and pin it. */
import type { Cause } from './captions';
import type { Kill } from './cluster';
import { BROKEN_SEED, FLOW_MAPPERS, FLOW_REDUCERS } from './facts';
import type { CombinerId, JobId } from './job';
import { PRESET_SHORT } from './text';

export const initialFlowScene = (): { text: string; mappers: number; reducers: number } => ({ text: PRESET_SHORT, mappers: FLOW_MAPPERS, reducers: FLOW_REDUCERS });
export const initialCombinerScene = (): { job: JobId; combiner: CombinerId } => ({ job: 'wordcount', combiner: 'off' });
/** Picking another job drops the combiner: each job offers its own list, and "no combiner" is in both. */
export const switchJob = (job: JobId): { job: JobId; combiner: CombinerId } => ({ job, combiner: 'off' });
/** `at` is null while the time cursor rests at the end of the job. */
export const initialStragglerScene = (): { cause: Cause; speculate: boolean; at: number | null } => ({ cause: 'data', speculate: false, at: null });
export const initialFailureScene = (): { kills: Kill[]; at: number } => ({ kills: [], at: 0 });
export const initialCounterScene = (): { seed: number; sideEffect: boolean; at: number | null } => ({ seed: BROKEN_SEED, sideEffect: true, at: null });
