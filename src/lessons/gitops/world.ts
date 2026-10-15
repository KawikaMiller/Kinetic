/**
 * The interactive world of scenes 1 to 3, pure: git (the desired state), the cluster (the live state) and a controller that wakes every
 * `interval` seconds, compares the whole of both and applies one action. Time is whole simulated seconds.
 */
import { LOAD_NORMAL, LOAD_SPIKE, REPLICA_CAPACITY, apply, hasDrift, reconcile, specText, DESIRED_START, type Action, type Spec, type State } from './reconcile';

export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 60;
/** Scene 3's sync interval, in seconds. */
export const TRAP_INTERVAL = 5;
export const LOG_LIMIT = 40;
/** Scene 2's sync interval, in seconds. */
export const DRIFT_INTERVAL = 10;

export type Mode = 'loop' | 'drift' | 'trap';

export interface LogEntry {
  id: number;
  t: number;
  text: string;
  tone: 'hi' | 'bad' | 'ok' | 'info' | 'violet';
}

export interface World {
  t: number;
  desired: State;
  live: State;
  autoSync: boolean;
  paused: boolean;
  interval: number;
  prune: boolean;
  /** The resource the controller touched at the last tick. */
  acting: string | null;
  driftSeconds: number;
  /** Seconds spent paused while the cluster had drifted: drift nobody was looking at. */
  unnoticedSeconds: number;
  /** The out-of-sync report has been made for this drift, so it is not repeated every run. */
  alerted: boolean;
  log: LogEntry[];
  nextId: number;
}

export const initWorld = (o: Partial<Pick<World, 'autoSync' | 'interval' | 'prune'>> = {}): World => ({
  t: 0,
  desired: DESIRED_START,
  live: DESIRED_START,
  autoSync: true,
  paused: false,
  interval: INTERVAL_MIN,
  prune: true,
  acting: null,
  driftSeconds: 0,
  unnoticedSeconds: 0,
  alerted: false,
  log: [],
  nextId: 1,
  ...o,
});

function say(w: World, text: string, tone: LogEntry['tone']): World {
  return { ...w, log: [...w.log, { id: w.nextId, t: w.t, text, tone }].slice(-LOG_LIMIT), nextId: w.nextId + 1 };
}

export const describeAction = (a: Action): string => (a.type === 'delete' ? `delete ${a.key}` : `${a.type} ${a.key}: ${specText(a.spec)}`);

/** One controller run: nothing when paused; otherwise compare everything and apply one action, or only report when auto-sync is off. */
function run(w: World): World {
  if (w.paused) return w;
  const plan = reconcile(w.desired, w.live, { prune: w.prune });
  if (plan.actions.length === 0) return { ...w, alerted: false };
  if (!w.autoSync) return w.alerted ? w : say({ ...w, alerted: true }, `out of sync: ${plan.actions.length} change${plan.actions.length === 1 ? '' : 's'} pending, auto-sync is off`, 'bad');
  const action = plan.actions[0];
  return say({ ...w, live: apply(w.live, action), acting: action.key }, `controller: ${describeAction(action)}`, 'hi');
}

/** Advance one second. The controller runs when the clock reaches a multiple of the interval. */
export function tick(w: World): World {
  let next: World = { ...w, t: w.t + 1, acting: null };
  if (next.t % next.interval === 0) next = run(next);
  const drifted = hasDrift(next.desired, next.live, next.prune);
  return {
    ...next,
    driftSeconds: next.driftSeconds + (drifted ? 1 : 0),
    unnoticedSeconds: next.unnoticedSeconds + (drifted && next.paused ? 1 : 0),
  };
}

/** Seconds until the controller next runs. */
export const secondsToRun = (w: World): number => w.interval - (w.t % w.interval);

/** Advance to the next controller run. */
export function toNextRun(w: World): World {
  let next = w;
  for (let i = secondsToRun(w); i > 0; i--) next = tick(next);
  return next;
}

/** Commit the draft to git: it becomes the desired state. */
export const commit = (w: World, draft: State): World => say({ ...w, desired: draft }, 'git: commit changes the desired state', 'info');

/** Someone changes the cluster by hand (null deletes the resource). */
export function manual(w: World, key: string, spec: Spec | null, what: string): World {
  const live: Record<string, Spec> = { ...w.live };
  if (spec === null) delete live[key];
  else live[key] = spec;
  return say({ ...w, live }, `by hand: ${what}`, 'bad');
}

export const setPaused = (w: World, paused: boolean): World =>
  say({ ...w, paused }, paused ? 'override logged: sync paused on purpose' : 'override logged: sync resumed', 'violet');

export const REPLICAS_OF = (s: State, key: string): number => s[key]?.replicas ?? 0;

/** The share of requests that fail: the web deployment's capacity against the traffic, 0 when it can keep up. */
export function failingShare(live: State, spike: boolean): number {
  const load = spike ? LOAD_SPIKE : LOAD_NORMAL;
  const capacity = REPLICAS_OF(live, 'web') * REPLICA_CAPACITY;
  return Math.max(0, 1 - capacity / load);
}

/** The world a live scene starts from, and resets to: scene 1 syncs every second, scene 2 every `DRIFT_INTERVAL` seconds, scene 3 every `TRAP_INTERVAL`. */
export const startWorld = (mode: Mode): World => (mode === 'drift' ? initWorld({ interval: DRIFT_INTERVAL }) : mode === 'trap' ? initWorld({ interval: TRAP_INTERVAL }) : initWorld());
