/** etl-orchestration: each scene's opening state as a pure function, so a test can switch through all five scenes and pin it. */
import { HORIZON_HOURS, type Fail, type Mode, type Op, type Task } from './engine';
import { BROKEN_SEED, opsForSeed } from './scenario';
import type { Style } from './shape';

/** The first scene opens with the whole week drawn. */
export const initialWeekScene = (): { at: number } => ({ at: HORIZON_HOURS });

export const DEFAULT_FAIL_DAY = 2;
export const DEFAULT_FAIL_TASK: Task = 'clean';
export interface FailureState {
  failures: Record<string, Fail>;
  ops: Op[];
  retries: number;
  kind: Fail['kind'];
  day: number;
  task: Task;
  flaky: boolean;
  seed: number;
  at: number;
}
export const initialFailureScene = (): FailureState => ({ failures: {}, ops: [], retries: 0, kind: 'permanent', day: DEFAULT_FAIL_DAY, task: DEFAULT_FAIL_TASK, flaky: false, seed: 0, at: HORIZON_HOURS });

/** Scene 3 opens in the broken mode (append) with the pinned seed's schedule of reruns and late data. */
export const initialLoadScene = (): { mode: Mode; seed: number; ops: Op[]; day: number } => ({ mode: 'append', seed: BROKEN_SEED, ops: opsForSeed(BROKEN_SEED), day: 0 });
export const initialShapeScene = (): { style: Style; changed: boolean } => ({ style: 'etl', changed: false });
/** Scene 5 opens at noon on the last day of the first window, with no pause. */
export const SCHEDULE_OPEN_HOUR = 24 * 4 + 12;
export const initialScheduleScene = (): { now: number; paused: boolean; catchup: boolean } => ({ now: SCHEDULE_OPEN_HOUR, paused: false, catchup: false });
