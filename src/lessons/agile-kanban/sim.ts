// A small, seeded flow simulation of a team's kanban board. Time is in days.
// Pure logic, no React: advance(world, dt) mutates the world; tested in sim.test.ts.
//
// The model (illustrative numbers):
// - Cards arrive in the backlog at `arrivalRate` per day (a Poisson process).
// - WORKERS developers share the "In progress" cards; REVIEWERS review the "Review" cards.
// - Juggling more than one card each costs focus (context switching), so a person's
//   effective capacity is 1 / (1 + SWITCH_COST × (cards per person − 1)).
// - Kanban pulls a card from the backlog whenever In progress is under its WIP limit.
//   Scrum pulls a sprint's worth of cards at each planning (every SPRINT_DAYS).
import { createSampler } from '../../core/sim';
import { clamp } from '../../core/math';
import { expSample, mulberry32 } from '../../core/random';

type Rnd = () => number;

export const WORKERS = 3;
export const REVIEWERS = 1;
/** Fraction of capacity lost per extra card a person juggles (illustrative, after Weinberg). */
export const SWITCH_COST = 0.2;
export const DEV_MEAN_DAYS = 2;
export const REVIEW_MEAN_DAYS = 0.4;
export const DEV_RANGE: [number, number] = [0.5, 8];
export const REVIEW_RANGE: [number, number] = [0.1, 2];
export const INITIAL_BACKLOG = 12;
export const SPRINT_DAYS = 10; // two working weeks
export const SPRINT_COMMIT = 14; // cards pulled at planning, about the team's capacity per sprint
export const BLOCK_DAYS = 6; // how long a blocked card waits on the other team
/** Stats are measured over this trailing window. */
export const WINDOW_DAYS = 40;
export const CFD_DAYS = 60;
export const CFD_EVERY = 0.5;
export const UNLIMITED = Infinity;

export type Stage = 'backlog' | 'dev' | 'review' | 'done';
export type Process = 'kanban' | 'scrum';

export interface Card {
  id: number;
  stage: Stage;
  devTotal: number;
  devLeft: number;
  reviewTotal: number;
  reviewLeft: number;
  arrivedAt: number;
  startedAt: number | null;
  /** When it joined the review queue (reviews are first come, first served). */
  reviewSince: number | null;
  doneAt: number | null;
  /** Waiting on another team until this day (still occupies a WIP slot). */
  blockedUntil: number | null;
  /** Scrum: committed to the current sprint at planning (the sprint backlog). */
  committed: boolean;
}

export interface Counts {
  t: number;
  arrived: number;
  started: number;
  reviewing: number;
  done: number;
}

export interface Completion {
  t: number;
  /** Start of work to done. */
  cycle: number;
  /** Arrival in the backlog to done: what the person who asked for it waits. */
  lead: number;
}

export interface SprintMark {
  t: number;
  /** Cards finished during the sprint that just ended, shown at its review. */
  demoed: number;
}

export interface World {
  t: number;
  rnd: Rnd;
  nextId: number;
  nextArrival: number;
  arrivalRate: number;
  wipLimit: number;
  process: Process;
  cards: Card[];
  /** The most recent finished cards (for the board's Done column). */
  recentDone: Card[];
  counts: Omit<Counts, 't'>;
  /** Time-integral of cards in flight (In progress + Review), for Little's law. */
  flightIntegral: number;
  flightSamples: { t: number; integral: number }[];
  completions: Completion[];
  cfd: ReturnType<typeof createSampler<Counts>>;
  sprints: SprintMark[];
  nextSprintAt: number;
  /** Start of the sprint in progress (null before the first planning). */
  sprintStartedAt: number | null;
  doneAtLastReview: number;
}

const RECENT_DONE = 12;

export function createWorld(o: { seed?: number; arrivalRate?: number; wipLimit?: number; process?: Process } = {}): World {
  const rnd = mulberry32(o.seed ?? 7);
  const w: World = {
    t: 0,
    rnd,
    nextId: 1,
    nextArrival: 0,
    arrivalRate: o.arrivalRate ?? 1.2,
    wipLimit: o.wipLimit ?? 3,
    process: o.process ?? 'kanban',
    cards: [],
    recentDone: [],
    counts: { arrived: 0, started: 0, reviewing: 0, done: 0 },
    flightIntegral: 0,
    flightSamples: [],
    completions: [],
    cfd: createSampler<Counts>({ every: CFD_EVERY, cap: Math.round(CFD_DAYS / CFD_EVERY) + 1 }),
    sprints: [],
    nextSprintAt: 0,
    sprintStartedAt: null,
    doneAtLastReview: 0,
  };
  for (let i = 0; i < INITIAL_BACKLOG; i++) addCard(w);
  w.nextArrival = expSample(1 / w.arrivalRate, rnd);
  return w;
}

function addCard(w: World) {
  const dev = clamp(expSample(DEV_MEAN_DAYS, w.rnd), ...DEV_RANGE);
  const rev = clamp(expSample(REVIEW_MEAN_DAYS, w.rnd), ...REVIEW_RANGE);
  w.cards.push({
    id: w.nextId++,
    stage: 'backlog',
    devTotal: dev,
    devLeft: dev,
    reviewTotal: rev,
    reviewLeft: rev,
    arrivedAt: w.t,
    startedAt: null,
    reviewSince: null,
    doneAt: null,
    blockedUntil: null,
    committed: false,
  });
  w.counts.arrived++;
}

export const inStage = (w: World, s: Stage) => w.cards.filter((c) => c.stage === s);
/** Cards started but not finished: In progress + Review, blocked ones included. */
export const inFlight = (w: World) => w.cards.filter((c) => c.stage === 'dev' || c.stage === 'review').length;
export const isBlocked = (c: Card, t: number) => c.blockedUntil !== null && t < c.blockedUntil;

/** A person's effective capacity when juggling `perPerson` cards at once. */
export const efficiency = (perPerson: number) => 1 / (1 + SWITCH_COST * Math.max(0, perPerson - 1));

/** Work (person-days per day) each of `k` active cards gets from `people` who share them equally. */
export function sharePerCard(k: number, people: number): number {
  if (k === 0) return 0;
  const perPerson = k / people;
  return Math.min(1, (people * efficiency(perPerson)) / k);
}

function start(w: World, c: Card) {
  c.stage = 'dev';
  c.startedAt = w.t;
  w.counts.started++;
}

function pull(w: World) {
  const backlog = inStage(w, 'backlog');
  if (w.process === 'kanban') {
    let room = w.wipLimit - inStage(w, 'dev').length;
    for (const c of backlog) {
      if (room <= 0) break;
      start(w, c);
      room--;
    }
    return;
  }
  // Scrum: only planning (every SPRINT_DAYS) adds cards to the sprint; new arrivals wait for the next one.
  if (w.t + 1e-9 >= w.nextSprintAt) {
    if (w.sprintStartedAt !== null) {
      w.sprints.push({ t: w.nextSprintAt, demoed: w.counts.done - w.doneAtLastReview });
      w.doneAtLastReview = w.counts.done;
    }
    const carried = backlog.filter((c) => c.committed).length + inFlight(w);
    backlog.filter((c) => !c.committed).slice(0, Math.max(0, SPRINT_COMMIT - carried)).forEach((c) => (c.committed = true));
    w.sprintStartedAt = w.nextSprintAt;
    w.nextSprintAt += SPRINT_DAYS;
  }
  // Within the sprint, each developer picks up one committed card at a time.
  let free = WORKERS - inStage(w, 'dev').length;
  for (const c of backlog) {
    if (free <= 0) break;
    if (!c.committed) continue;
    start(w, c);
    free--;
  }
}

/** Developers share every unblocked In-progress card (juggling costs focus). */
function develop(w: World, dt: number) {
  const active = inStage(w, 'dev').filter((c) => !isBlocked(c, w.t));
  const share = sharePerCard(active.length, WORKERS) * dt;
  for (const c of active) {
    c.devLeft -= share;
    if (c.devLeft <= 0) {
      c.stage = 'review';
      c.reviewSince = w.t;
      w.counts.reviewing++;
    }
  }
}

/** The cards reviewers are working on right now: the oldest REVIEWERS in the queue. */
export const inReview = (w: World) =>
  inStage(w, 'review').sort((a, b) => a.reviewSince! - b.reviewSince! || a.id - b.id).slice(0, REVIEWERS);

/** Each reviewer finishes one review before starting the next; the rest wait in line. */
function review(w: World, dt: number) {
  for (const c of inReview(w)) {
    c.reviewLeft -= dt;
    if (c.reviewLeft <= 0) finish(w, c);
  }
}

function finish(w: World, c: Card) {
  c.stage = 'done';
  c.doneAt = w.t;
  w.counts.done++;
  w.completions.push({ t: w.t, cycle: w.t - c.startedAt!, lead: w.t - c.arrivedAt });
  w.recentDone.push(c);
  if (w.recentDone.length > RECENT_DONE) w.recentDone.shift();
}

/** Advance the board by `dt` days (arrivals land at step granularity). */
export function advance(w: World, dt: number) {
  w.flightIntegral += inFlight(w) * dt;
  w.t += dt;
  while (w.nextArrival <= w.t) {
    addCard(w);
    w.nextArrival += expSample(1 / w.arrivalRate, w.rnd);
  }
  pull(w);
  develop(w, dt);
  review(w, dt);
  w.cards = w.cards.filter((c) => c.stage !== 'done');
  w.flightSamples.push({ t: w.t, integral: w.flightIntegral });
  trimFront(w.flightSamples, (s) => s.t < w.t - WINDOW_DAYS - 1);
  trimFront(w.completions, (s) => s.t < w.t - WINDOW_DAYS);
  w.cfd.tick(w.t, () => ({ t: w.t, ...w.counts }));
}

function trimFront<T>(xs: T[], old: (x: T) => boolean) {
  let n = 0;
  while (n < xs.length - 1 && old(xs[n])) n++;
  if (n) xs.splice(0, n);
}

/** Block one card that's being worked on: it waits on another team but keeps its slot. */
export function blockCard(w: World): Card | null {
  const c = inStage(w, 'dev').find((x) => !isBlocked(x, w.t));
  if (!c) return null;
  c.blockedUntil = w.t + BLOCK_DAYS;
  return c;
}

export function setProcess(w: World, p: Process) {
  w.process = p;
  w.nextSprintAt = w.t;
  w.doneAtLastReview = w.counts.done;
  w.sprints = [];
  w.sprintStartedAt = null;
  for (const c of w.cards) c.committed = false;
}

/** Scrum: how many backlog cards are committed to the current sprint. */
export const sprintBacklog = (w: World) => w.cards.filter((c) => c.stage === 'backlog' && c.committed).length;

export interface Stats {
  day: number;
  backlog: number;
  dev: number;
  review: number;
  blocked: number;
  done: number;
  /** Time-averaged cards in flight over the window. */
  wip: number;
  /** Cards finished per day over the window. */
  throughput: number;
  /** Average start-to-done time of cards finished in the window, in days. */
  cycle: number;
  /** Average arrival-to-done time of cards finished in the window, in days. */
  lead: number;
  /** Little's law: average WIP ÷ throughput. */
  littleCycle: number;
  /** How many days the stats cover so far (≤ WINDOW_DAYS). */
  span: number;
}

export function stats(w: World): Stats {
  const first = w.flightSamples[0];
  const span = first ? Math.min(WINDOW_DAYS, w.t - first.t) : 0;
  const base = w.flightSamples.find((s) => s.t >= w.t - span) ?? first;
  const wip = span > 0 && base ? (w.flightIntegral - base.integral) / (w.t - base.t) : inFlight(w);
  const recent = w.completions.filter((c) => c.t > w.t - span);
  const throughput = span > 0 ? recent.length / span : 0;
  const cycle = recent.length ? recent.reduce((s, c) => s + c.cycle, 0) / recent.length : 0;
  const lead = recent.length ? recent.reduce((s, c) => s + c.lead, 0) / recent.length : 0;
  return {
    day: w.t,
    backlog: inStage(w, 'backlog').length,
    dev: inStage(w, 'dev').length,
    review: inStage(w, 'review').length,
    blocked: w.cards.filter((c) => isBlocked(c, w.t)).length,
    done: w.counts.done,
    wip,
    throughput,
    cycle,
    lead,
    littleCycle: throughput > 0 ? wip / throughput : 0,
    span,
  };
}

/** Run a long seeded simulation and measure Little's law over [from, to] days (for tests). */
export function measureLittle(o: { seed: number; wipLimit: number; days: number; warmup: number; dt?: number; arrivalRate?: number }) {
  const w = createWorld({ seed: o.seed, wipLimit: o.wipLimit, arrivalRate: o.arrivalRate });
  const dt = o.dt ?? 0.05;
  while (w.t < o.warmup) advance(w, dt);
  const startT = w.t;
  const integralAtStart = w.flightIntegral;
  const doneAtStart = w.counts.done;
  const cycles: number[] = [];
  while (w.t < o.days) {
    const before = w.counts.done;
    advance(w, dt);
    const fresh = w.counts.done - before;
    if (fresh) cycles.push(...w.completions.slice(-fresh).map((c) => c.cycle));
  }
  const span = w.t - startT;
  const wip = (w.flightIntegral - integralAtStart) / span;
  const throughput = (w.counts.done - doneAtStart) / span;
  const cycle = cycles.reduce((a, b) => a + b, 0) / cycles.length;
  return { wip, throughput, cycle, little: wip / throughput, backlog: inStage(w, 'backlog').length };
}
