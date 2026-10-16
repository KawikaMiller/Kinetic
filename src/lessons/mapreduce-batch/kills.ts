/** mapreduce-batch: what pressing "kill" does, as a pure function, so the refusals are tested and the stage only shows their message. */
import { WORKERS, type Kill } from './cluster';
import { worldAt, type ClusterRun } from './timeline';

export interface KillResult {
  kills: Kill[];
  /** What happened, in a sentence for the stage. */
  message: string;
  /** Whether the schedule changed. */
  changed: boolean;
}

/** Add "worker `worker` fails at `tick`" to the schedule, unless it would change nothing (the job is over, or the worker is already down). */
export function addKill(run: ClusterRun, kills: readonly Kill[], worker: number, tick: number): KillResult {
  const name = `worker ${worker + 1}`;
  const w = worldAt(run, tick);
  if (run.world.finishedAt !== null && tick >= run.world.finishedAt) {
    return { kills: [...kills], changed: false, message: `The job already finished at tick ${run.world.finishedAt}: a failure at tick ${tick} changes nothing.` };
  }
  if (!w.alive[worker]) return { kills: [...kills], changed: false, message: `${name} is already down at tick ${tick}.` };
  const next = [...kills, { worker, tick }];
  const left = w.alive.filter(Boolean).length - 1;
  return {
    kills: next,
    changed: true,
    message: left === 0 ? `${name} fails at tick ${tick}. No worker is left: the job cannot finish.` : `${name} fails at tick ${tick}; ${left} of ${WORKERS} workers are still up.`,
  };
}

/** The worker running attempt `id` at `tick`, or null when that bar is not a running task at that moment. */
export function runningWorkerAt(run: ClusterRun, id: string, tick: number): number | null {
  const a = run.world.attempts[Number(id.replace('a', ''))];
  if (!a) return null;
  const end = a.end ?? run.world.tick;
  return a.start <= tick && tick < end ? a.worker : null;
}
