/**
 * Mentoring and delegation: an INVENTED toy board. Every constant below is made up to show a trade-off; none is a
 * measurement of real people (the lesson says so on screen). Pure and seeded.
 */
import { mulberry32 } from '../../core/random';

export type Area = 'services' | 'interface';
export const AREAS: readonly { id: Area; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'interface', label: 'Interface' },
];

export type PersonTone = 'amber' | 'pink' | 'sky' | 'orange';
export interface Person {
  id: string;
  name: string;
  tone: PersonTone;
  /** Starting skill, 1 to 5, in each area. */
  skill: Readonly<Record<Area, number>>;
}

export const TEAM: readonly Person[] = [
  { id: 'ana', name: 'Ana', tone: 'amber', skill: { services: 3, interface: 2 } },
  { id: 'ben', name: 'Ben', tone: 'pink', skill: { services: 2, interface: 4 } },
  { id: 'cy', name: 'Cy', tone: 'sky', skill: { services: 1, interface: 1 } },
  { id: 'di', name: 'Di', tone: 'orange', skill: { services: 4, interface: 3 } },
];

export type Criticality = 'low' | 'medium' | 'high';
export interface Task {
  id: string;
  label: string;
  area: Area;
  /** 1 to 5. */
  complexity: number;
  criticality: Criticality;
}

/** One of each arrives every week, for 8 weeks. */
export const TASKS: readonly Task[] = [
  { id: 'flaky', label: 'Fix a flaky checkout test', area: 'services', complexity: 2, criticality: 'low' },
  { id: 'ratelimit', label: 'Add a rate limit to the API', area: 'services', complexity: 4, criticality: 'high' },
  { id: 'settings', label: 'Build the settings page', area: 'interface', complexity: 3, criticality: 'medium' },
  { id: 'forms', label: 'Migrate form validation', area: 'interface', complexity: 4, criticality: 'high' },
  { id: 'report', label: 'Speed up a slow report query', area: 'services', complexity: 3, criticality: 'medium' },
  { id: 'empty', label: 'Polish the empty states', area: 'interface', complexity: 1, criticality: 'low' },
];

export const CAPACITY_HOURS = 40;
export const WEEKS = 8;
/** A queue longer than this reads as overflowing (invented line). */
export const QUEUE_WARN = 3;
/** Hours it takes you to do a task yourself, per point of complexity. */
export const DO_HOURS_PER_COMPLEXITY = 4;
/** Hours of coaching per point the task sits above the person's skill. */
export const COACH_HOURS_PER_GAP = 6;
/** Share of a bounced task you redo yourself (they got part of the way). Invented. */
export const REDO_SHARE = 0.5;
export const SKILL_STEP = 0.5;
export const SKILL_MAX = 5;
export const REVIEW_HOURS: Record<Criticality, number> = { low: 0.5, medium: 1.5, high: 3 };

export const doHours = (t: Task): number => DO_HOURS_PER_COMPLEXITY * t.complexity;

// ---------------------------------------------------------------- delegation level and context

/** The seven levels of Management 3.0 (one view, from memory), from most control to least. */
export const LEVELS = ['Tell', 'Sell', 'Consult', 'Agree', 'Advise', 'Inquire', 'Delegate'] as const;
export const LEVEL_MAX = LEVELS.length - 1;
/** 1 at Tell, 0 at Delegate: how much of the work you keep control of. */
export const controlOf = (level: number): number => (LEVEL_MAX - level) / LEVEL_MAX;
/** Your hours per delegated task scale from half (Delegate) to one and a half (Tell). */
export const hoursFactor = (level: number): number => 0.5 + controlOf(level);
/** More control makes the finished task slightly more likely to come back right. */
export const controlBoost = (level: number): number => 0.85 + 0.15 * controlOf(level);

export type Context = 'none' | 'brief' | 'full';
export const CONTEXTS: { value: Context; label: string }[] = [
  { value: 'none', label: 'No context' },
  { value: 'brief', label: 'A brief' },
  { value: 'full', label: 'Full context' },
];
/** Your hours to brief someone, and the share of tasks that bounce back for lack of it. */
export const CONTEXT_HOURS: Record<Context, number> = { none: 0, brief: 1, full: 3 };
export const CONTEXT_BOUNCE: Record<Context, number> = { none: 0.5, brief: 0.15, full: 0.05 };

// ---------------------------------------------------------------- skill against complexity

export type Band = 'easy' | 'matched' | 'stretch' | 'hard' | 'beyond';
/** How far the task sits above the person's skill: positive is harder than they are. */
export const gapOf = (skill: number, complexity: number): number => complexity - skill;

export function bandOf(gap: number): Band {
  if (gap <= -1) return 'easy';
  if (gap <= 0) return 'matched';
  if (gap <= 1) return 'stretch';
  if (gap <= 2) return 'hard';
  return 'beyond';
}

export const BAND_SUCCESS: Record<Band, number> = { easy: 0.92, matched: 0.8, stretch: 0.55, hard: 0.2, beyond: 0.05 };
export const BAND_LABEL: Record<Band, string> = { easy: 'well within reach', matched: 'matched', stretch: 'a stretch', hard: 'far above them', beyond: 'far beyond them' };

/** The chance a delegated task comes back done rather than bounced to you. */
export function chanceDone(skill: number, complexity: number, level: number, context: Context): number {
  return BAND_SUCCESS[bandOf(gapOf(skill, complexity))] * (1 - CONTEXT_BOUNCE[context]) * controlBoost(level);
}

/** Your hours to start one delegated task this week: briefing and review, scaled by the level, plus coaching on the gap. */
export function overheadHours(task: Task, skill: number, level: number, context: Context): number {
  return (CONTEXT_HOURS[context] + REVIEW_HOURS[task.criticality]) * hoursFactor(level) + COACH_HOURS_PER_GAP * Math.max(0, gapOf(skill, task.complexity));
}

// ---------------------------------------------------------------- the eight weeks

export type Assignee = 'me' | 'none' | string;
export interface Plan {
  assignments: Readonly<Record<string, Assignee>>;
  level: number;
  context: Context;
}

export interface WeekRow {
  week: number;
  /** Your hours used, never above CAPACITY_HOURS. */
  hours: number;
  /** Tasks left in your own queue at the end of the week, bounced ones included. */
  queue: number;
  completed: number;
  bounced: number;
  /** Delegated tasks that could not start because you had no hours left to brief them. */
  waiting: number;
  /** Each person's mean skill across the two areas at the end of the week. */
  skills: Readonly<Record<string, number>>;
  /** Tasks sitting in each person's queue at the end of the week. */
  personQueues: Readonly<Record<string, number>>;
  unstarted: number;
}

export interface Run {
  weeks: WeekRow[];
  /** Skill at the end, per person and area. */
  skills: Record<string, Record<Area, number>>;
  totals: { completed: number; bounced: number; unstarted: number };
}

const meanSkill = (s: Record<Area, number>) => (s.services + s.interface) / AREAS.length;

/** The weekly states, as a pure function of the plan and the seed. One random draw per person per week is always consumed, so two plans share their luck. */
export function simulate(plan: Plan, seed: number): Run {
  const rnd = mulberry32(seed);
  const skills: Record<string, Record<Area, number>> = Object.fromEntries(TEAM.map((p) => [p.id, { ...p.skill }]));
  const mine: { remaining: number }[] = [];
  const queues: Record<string, string[]> = Object.fromEntries(TEAM.map((p) => [p.id, []]));
  const weeks: WeekRow[] = [];
  const totals = { completed: 0, bounced: 0, unstarted: 0 };

  for (let week = 1; week <= WEEKS; week++) {
    const draws = TEAM.map(() => rnd());
    let unstarted = 0;
    for (const t of TASKS) {
      const who = plan.assignments[t.id] ?? 'none';
      if (who === 'me') mine.push({ remaining: doHours(t) });
      else if (who !== 'none' && queues[who]) queues[who].push(t.id);
      else unstarted++;
    }
    let left = CAPACITY_HOURS;
    let completed = 0;
    let bounced = 0;
    let waiting = 0;
    TEAM.forEach((person, i) => {
      const head = queues[person.id][0];
      if (head === undefined) return;
      const task = TASKS.find((t) => t.id === head)!;
      const skill = skills[person.id][task.area];
      const need = overheadHours(task, skill, plan.level, plan.context);
      if (need > left + 1e-9) {
        waiting++;
        return;
      }
      left -= need;
      queues[person.id].shift();
      if (draws[i] < chanceDone(skill, task.complexity, plan.level, plan.context)) {
        completed++;
        if (bandOf(gapOf(skill, task.complexity)) === 'stretch') skills[person.id][task.area] = Math.min(SKILL_MAX, skill + SKILL_STEP);
      } else {
        bounced++;
        mine.unshift({ remaining: REDO_SHARE * doHours(task) });
      }
    });
    while (left > 0 && mine.length > 0) {
      const work = Math.min(left, mine[0].remaining);
      mine[0].remaining -= work;
      left -= work;
      if (mine[0].remaining <= 0) {
        mine.shift();
        completed++;
      }
    }
    totals.completed += completed;
    totals.bounced += bounced;
    totals.unstarted += unstarted;
    weeks.push({
      week,
      hours: CAPACITY_HOURS - left,
      queue: mine.length,
      completed,
      bounced,
      waiting,
      skills: Object.fromEntries(TEAM.map((p) => [p.id, meanSkill(skills[p.id])])),
      personQueues: Object.fromEntries(TEAM.map((p) => [p.id, queues[p.id].length])),
      unstarted,
    });
  }
  return { weeks, skills, totals };
}

// ---------------------------------------------------------------- the pay-back point

export const PAYBACK_MAX_REPS = 24;

export interface Payback {
  /** First repetition at which the running total of delegating is below the running total of doing it yourself; null if none within the cap. */
  reps: number | null;
  perRep: { rep: number; delegate: number; self: number }[];
}

/**
 * Expected hours of delegating the same task to the same person again and again, against doing it yourself each time.
 * Delegation costs the briefing, review and coaching plus, when it bounces, the full redo. After each repetition the
 * person's skill grows by the expected step (the step times the chance it came back done) only while the task is a stretch.
 */
export function payback(task: Task, personId: string, level: number, context: Context): Payback {
  const person = TEAM.find((p) => p.id === personId)!;
  let skill = person.skill[task.area];
  let cumDelegate = 0;
  let cumSelf = 0;
  const perRep: Payback['perRep'] = [];
  let reps: number | null = null;
  for (let rep = 1; rep <= PAYBACK_MAX_REPS; rep++) {
    const done = chanceDone(skill, task.complexity, level, context);
    const hours = overheadHours(task, skill, level, context) + (1 - done) * REDO_SHARE * doHours(task);
    cumDelegate += hours;
    cumSelf += doHours(task);
    perRep.push({ rep, delegate: hours, self: doHours(task) });
    if (reps === null && cumDelegate < cumSelf) reps = rep;
    if (bandOf(gapOf(skill, task.complexity)) === 'stretch') skill = Math.min(SKILL_MAX, skill + SKILL_STEP * done);
  }
  return { reps, perRep };
}

// ---------------------------------------------------------------- presets

/** Each task to the person whose skill is a match or a stretch for it; two tasks stay with you. */
const WITH_REVIEW: Record<string, string> = { ratelimit: 'di', forms: 'ben', report: 'ana', flaky: 'cy', settings: 'me', empty: 'me' };
/** Everything handed off: Di and Cy each get a second task, so their queues build. */
const EVERYTHING: Record<string, string> = { ...WITH_REVIEW, settings: 'di', empty: 'cy' };

export interface Preset {
  id: string;
  label: string;
  plan: Plan;
}

const allMe = Object.fromEntries(TASKS.map((t) => [t.id, 'me']));

export const PRESETS: readonly Preset[] = [
  { id: 'myself', label: 'Do everything myself', plan: { assignments: allMe, level: LEVEL_MAX, context: 'none' } },
  { id: 'nocontext', label: 'Delegate everything with no context', plan: { assignments: EVERYTHING, level: LEVEL_MAX, context: 'none' } },
  { id: 'review', label: 'Delegate with context and review', plan: { assignments: WITH_REVIEW, level: 4, context: 'brief' } },
  { id: 'handholding', label: 'All hand-holding', plan: { assignments: WITH_REVIEW, level: 0, context: 'full' } },
];

export const DEFAULT_PRESET = PRESETS[2];
export const SEED = 5;

// ---------------------------------------------------------------- scene 3: what to delegate

export interface Work {
  id: string;
  label: string;
  hoursPerWeek: number;
  /** Starting position on the 0 to 10 plane. */
  importance: number;
  unique: number;
}

export const WORK: readonly Work[] = [
  { id: 'arch', label: 'Architecture decisions', hoursPerWeek: 4, importance: 9, unique: 9 },
  { id: 'oncall', label: 'On-call triage', hoursPerWeek: 6, importance: 7, unique: 3 },
  { id: 'reviews', label: 'Routine code reviews', hoursPerWeek: 5, importance: 5, unique: 2 },
  { id: 'status', label: 'Weekly status report', hoursPerWeek: 3, importance: 3, unique: 2 },
  { id: 'hiring', label: 'Interview loops', hoursPerWeek: 4, importance: 7, unique: 6 },
  { id: 'deps', label: 'Dependency upgrades', hoursPerWeek: 4, importance: 4, unique: 1 },
  { id: 'design', label: 'Design the new pipeline', hoursPerWeek: 6, importance: 9, unique: 8 },
  { id: 'docs', label: 'Tidy old wiki pages', hoursPerWeek: 3, importance: 1, unique: 3 },
];

export const PLANE = { min: 0, max: 10, split: 5 };
/** Share of a delegated task's hours that you still spend (review, answering questions). Invented. */
export const KEEP_SHARE = 0.25;

export type Quadrant = 'keep' | 'delegate-coach' | 'question' | 'delegate-or-drop';
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  keep: 'keep: important and yours',
  'delegate-coach': 'delegate, and coach: important, not only yours',
  question: 'question it: yours, but not important',
  'delegate-or-drop': 'delegate or drop: neither',
};

export function quadrantOf(importance: number, unique: number): Quadrant {
  const important = importance >= PLANE.split;
  const yours = unique >= PLANE.split;
  if (important && yours) return 'keep';
  if (important) return 'delegate-coach';
  return yours ? 'question' : 'delegate-or-drop';
}

export interface Placement {
  importance: number;
  unique: number;
}

export interface Hours {
  /** Hours of work that leave your plate for others. */
  moved: number;
  /** Hours returned to you after you keep reviewing. */
  returned: number;
  /** Hours added to other people. */
  added: number;
  kept: number;
}

/** Work placed with low unique contribution moves to others; you keep a share of it for review. */
export function hoursSummary(placed: Readonly<Record<string, Placement>>): Hours {
  let moved = 0;
  let kept = 0;
  for (const w of WORK) {
    const p = placed[w.id];
    if (p.unique < PLANE.split) moved += w.hoursPerWeek;
    else kept += w.hoursPerWeek;
  }
  return { moved, returned: moved * (1 - KEEP_SHARE), added: moved, kept };
}

export const startPlacement = (): Record<string, Placement> => Object.fromEntries(WORK.map((w) => [w.id, { importance: w.importance, unique: w.unique }]));
