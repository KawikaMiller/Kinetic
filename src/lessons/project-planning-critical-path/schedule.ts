/** Scheduling a task graph on n engineers: a list-scheduling rule, two lower bounds and a brute-force optimum for small graphs. */
import { bottomLevel, cpm, totalWork, type Plan } from './cpm';

export const MAX_ENGINEERS = 6;
/** Brute force enumerates precedence-feasible task orders, so it is only offered up to this many tasks. */
export const BRUTE_FORCE_LIMIT = 8;

export interface Slot {
  id: string;
  engineer: number;
  start: number;
  end: number;
}

export interface Placement {
  slots: Slot[];
  makespan: number;
}

const preds = (plan: Plan, id: string) => plan.edges.filter(([, b]) => b === id).map(([a]) => a);

/**
 * List scheduling: whenever an engineer is free, give them the ready task with the longest remaining chain (ties
 * to the earlier task in the list). One engineer per task at a time, no pre-emption.
 */
export function listSchedule(plan: Plan, engineers: number): Placement {
  const priority = bottomLevel(plan);
  const order = new Map(plan.tasks.map((t, i) => [t.id, i]));
  const finish = new Map<string, number>();
  const started = new Set<string>();
  const freeAt = new Array<number>(engineers).fill(0);
  const slots: Slot[] = [];
  let t = 0;
  while (started.size < plan.tasks.length) {
    const ready = plan.tasks
      .filter((task) => !started.has(task.id) && preds(plan, task.id).every((p) => finish.has(p) && finish.get(p)! <= t))
      .sort((a, b) => priority[b.id] - priority[a.id] || order.get(a.id)! - order.get(b.id)!);
    for (const task of ready) {
      const engineer = freeAt.findIndex((f) => f <= t);
      if (engineer < 0) break;
      freeAt[engineer] = t + task.days;
      finish.set(task.id, t + task.days);
      started.add(task.id);
      slots.push({ id: task.id, engineer, start: t, end: t + task.days });
    }
    const later = [...freeAt, ...finish.values()].filter((x) => x > t);
    t = later.length ? Math.min(...later) : t + 1;
  }
  return { slots, makespan: Math.max(0, ...slots.map((s) => s.end)) };
}

/** The two lower bounds on any schedule: the critical path, and the work shared out as evenly as whole days allow. */
export function lowerBounds(plan: Plan, engineers: number): { criticalPath: number; workShare: number; best: number } {
  const criticalPath = cpm(plan).length;
  const workShare = Math.ceil(totalWork(plan) / engineers);
  return { criticalPath, workShare, best: Math.max(criticalPath, workShare) };
}

/**
 * The best makespan over every precedence-feasible task order, each task placed as early as an engineer is free
 * (serial schedule generation), which reaches an optimal schedule. Null above BRUTE_FORCE_LIMIT tasks.
 */
export function optimalMakespan(plan: Plan, engineers: number): number | null {
  if (plan.tasks.length > BRUTE_FORCE_LIMIT) return null;
  const tasks = plan.tasks;
  let best = Infinity;
  const busy: [number, number][][] = Array.from({ length: engineers }, () => []);
  const finish = new Map<string, number>();
  const free = (engineer: number, from: number, len: number) => {
    let s = from;
    for (const [a, b] of [...busy[engineer]].sort((x, y) => x[0] - y[0])) if (s < b && s + len > a) s = b;
    return s;
  };
  const place = (done: Set<string>, makespan: number) => {
    if (makespan >= best) return;
    if (done.size === tasks.length) {
      best = makespan;
      return;
    }
    for (const task of tasks) {
      if (done.has(task.id) || !preds(plan, task.id).every((p) => done.has(p))) continue;
      const ready = Math.max(0, ...preds(plan, task.id).map((p) => finish.get(p)!));
      let bestStart = Infinity;
      let bestEngineer = 0;
      for (let e = 0; e < engineers; e++) {
        const s = free(e, ready, task.days);
        if (s < bestStart) [bestStart, bestEngineer] = [s, e];
      }
      busy[bestEngineer].push([bestStart, bestStart + task.days]);
      finish.set(task.id, bestStart + task.days);
      done.add(task.id);
      place(done, Math.max(makespan, bestStart + task.days));
      done.delete(task.id);
      finish.delete(task.id);
      busy[bestEngineer].pop();
    }
  };
  place(new Set(), 0);
  return best;
}
