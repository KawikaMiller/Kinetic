/**
 * The critical path method on a small task graph: a forward pass, a backward pass and slack, with the refusals a
 * learner-edited graph needs (a cycle, a duplicate, a bad duration, too many tasks). Pure; durations are whole working days.
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import type { Result } from '../../core/result';

export interface Task {
  id: string;
  label: string;
  days: number;
}

/** A dependency: `from` must finish before `to` starts. */
export type Edge = readonly [from: string, to: string];

export interface Plan {
  tasks: readonly Task[];
  edges: readonly Edge[];
}

export const MAX_TASKS = 14;
export const DAYS = { min: 1, max: 40 };

/** The eight-task preset. The critical path is design, api, integrate, tests, release (16 days). */
export const PRESET: Plan = {
  tasks: [
    { id: 'design', label: 'Design', days: 3 },
    { id: 'api', label: 'API', days: 5 },
    { id: 'schema', label: 'Schema', days: 2 },
    { id: 'ui', label: 'UI', days: 4 },
    { id: 'polish', label: 'Polish', days: 2 },
    { id: 'integrate', label: 'Integrate', days: 3 },
    { id: 'tests', label: 'Tests', days: 4 },
    { id: 'release', label: 'Release', days: 1 },
  ],
  edges: [
    ['design', 'api'], ['design', 'schema'], ['design', 'ui'], ['ui', 'polish'], ['api', 'integrate'],
    ['schema', 'integrate'], ['polish', 'tests'], ['integrate', 'tests'], ['tests', 'release'],
  ],
};

export const parseDays = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: DAYS.min,
    max: DAYS.max,
    messages: {
      empty: 'A task needs a duration: type a whole number of days.',
      invalid: () => 'Type a whole number of days, like 3.',
      tooSmall: () => `A task takes at least ${DAYS.min} day.`,
      tooBig: () => `Keep a task to ${DAYS.max} days or fewer.`,
    },
  });

const byId = (plan: Plan) => new Map(plan.tasks.map((t) => [t.id, t]));
const successors = (plan: Plan, id: string) => plan.edges.filter(([a]) => a === id).map(([, b]) => b);
const predecessors = (plan: Plan, id: string) => plan.edges.filter(([, b]) => b === id).map(([a]) => a);

/** A route from `from` to `to` along dependencies, or null. */
export function findRoute(plan: Plan, from: string, to: string): string[] | null {
  const seen = new Set<string>();
  const walk = (id: string, route: string[]): string[] | null => {
    if (id === to) return route;
    if (seen.has(id)) return null;
    seen.add(id);
    for (const next of successors(plan, id)) {
      const found = walk(next, [...route, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(from, [from]);
}

/** Tasks in an order where every dependency comes first, or null when the graph has a cycle. */
export function topoOrder(plan: Plan): string[] | null {
  const indegree = new Map(plan.tasks.map((t) => [t.id, predecessors(plan, t.id).length]));
  const order: string[] = [];
  const ready = plan.tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of successors(plan, id)) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  return order.length === plan.tasks.length ? order : null;
}

const labelOf = (plan: Plan, id: string) => byId(plan).get(id)?.label ?? id;

/** Add a dependency; a cycle is refused with the loop named. */
export function addEdge(plan: Plan, from: string, to: string): Result<Plan> {
  if (from === to) return { ok: false, error: `${labelOf(plan, from)} cannot depend on itself.` };
  if (plan.edges.some(([a, b]) => a === from && b === to)) return { ok: false, error: `${labelOf(plan, to)} already waits for ${labelOf(plan, from)}.` };
  const back = findRoute(plan, to, from);
  if (back) {
    const loop = [...back, to].map((id) => labelOf(plan, id)).join(' to ');
    return { ok: false, error: `That would make a cycle: ${loop}. A task cannot wait for itself, even through others.` };
  }
  return { ok: true, value: { ...plan, edges: [...plan.edges, [from, to]] } };
}

/** Add a task with a typed duration; a missing or out-of-range duration and a full graph are refused. */
export function addTask(plan: Plan, label: string, daysText: string): Result<Plan> {
  if (plan.tasks.length >= MAX_TASKS) return { ok: false, error: `The graph is full: ${MAX_TASKS} tasks is the limit here.` };
  const days = parseDays(daysText);
  if (!days.ok) return { ok: false, error: days.error };
  const n = plan.tasks.length + 1;
  let id = `task${n}`;
  while (plan.tasks.some((t) => t.id === id)) id += 'x';
  return { ok: true, value: { ...plan, tasks: [...plan.tasks, { id, label: label.trim() || `Task ${n}`, days: days.value }] } };
}

/** Change one task's duration, kept inside the allowed range. */
export const setDays = (plan: Plan, id: string, days: number): Plan => ({
  ...plan,
  tasks: plan.tasks.map((t) => (t.id === id ? { ...t, days: Math.min(DAYS.max, Math.max(DAYS.min, days)) } : t)),
});

export interface Schedule {
  es: Record<string, number>;
  ef: Record<string, number>;
  ls: Record<string, number>;
  lf: Record<string, number>;
  slack: Record<string, number>;
  length: number;
  critical: string[];
}

/** Forward pass, backward pass and slack (LS minus ES). The plan must be acyclic. */
export function cpm(plan: Plan): Schedule {
  const order = topoOrder(plan);
  if (!order) throw new Error('cpm needs an acyclic plan');
  const tasks = byId(plan);
  const es: Record<string, number> = {};
  const ef: Record<string, number> = {};
  for (const id of order) {
    es[id] = Math.max(0, ...predecessors(plan, id).map((p) => ef[p]));
    ef[id] = es[id] + tasks.get(id)!.days;
  }
  const length = Math.max(0, ...Object.values(ef));
  const ls: Record<string, number> = {};
  const lf: Record<string, number> = {};
  for (const id of [...order].reverse()) {
    const next = successors(plan, id);
    lf[id] = next.length ? Math.min(...next.map((n) => ls[n])) : length;
    ls[id] = lf[id] - tasks.get(id)!.days;
  }
  const slack = Object.fromEntries(order.map((id) => [id, ls[id] - es[id]]));
  return { es, ef, ls, lf, slack, length, critical: plan.tasks.filter((t) => slack[t.id] === 0).map((t) => t.id) };
}

/** Length of the longest chain from each task to the end, the task included: the "remaining critical path". */
export function bottomLevel(plan: Plan): Record<string, number> {
  const order = topoOrder(plan)!;
  const tasks = byId(plan);
  const out: Record<string, number> = {};
  for (const id of [...order].reverse()) out[id] = tasks.get(id)!.days + Math.max(0, ...successors(plan, id).map((n) => out[n]));
  return out;
}

export const totalWork = (plan: Plan) => plan.tasks.reduce((s, t) => s + t.days, 0);

// ---------------------------------------------------------------- calendar mapping (working days to UTC hours)

/** Day 0 is a Monday; the calendar axis counts hours since this instant, in UTC. */
export const CALENDAR_START = '2026-03-02T00:00:00Z';
const DAYS_PER_WEEK = 7;
const WORK_DAYS_PER_WEEK = 5;
const HOURS_PER_DAY = 24;

/** The calendar day (counted from the Monday start) of a working-day index: weekends are skipped. */
export const calendarDay = (workingDay: number): number =>
  Math.floor(workingDay / WORK_DAYS_PER_WEEK) * DAYS_PER_WEEK + (workingDay % WORK_DAYS_PER_WEEK);

/** Hours since the start at which a task beginning on working day `es` begins. */
export const startHours = (es: number): number => calendarDay(es) * HOURS_PER_DAY;
/** Hours since the start at which a task whose last working day is `ef - 1` ends (the end of that day). */
export const endHours = (ef: number): number => (calendarDay(ef - 1) + 1) * HOURS_PER_DAY;
