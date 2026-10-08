/**
 * The scripted constraints of a phone: the network comes and goes, background time runs out,
 * and waking the radio costs battery. The numbers are illustrative, chosen to show the shape of
 * each trade-off, not measured on a device.
 */

/** Seconds of background time the lesson gives a task before the OS ends it (the real limits vary by platform, version and device). */
export const BACKGROUND_BUDGET_S = 30;
export const WORK_RANGE = { min: 5, max: 60 } as const;

export interface BackgroundRun {
  /** Seconds of the task that ran. */
  done: number;
  finished: boolean;
  /** Seconds of work the app must do again: all of it when nothing was checkpointed, none of what was. */
  redo: number;
  /** Seconds still to do after the cut-off. */
  remaining: number;
}

/** A background task needs `workS` seconds; the OS ends it at `budgetS`. Checkpointing keeps what ran. */
export function runInBackground(workS: number, checkpointed: boolean, budgetS = BACKGROUND_BUDGET_S): BackgroundRun {
  const done = Math.min(workS, budgetS);
  const finished = workS <= budgetS;
  return { done, finished, remaining: workS - done, redo: finished || checkpointed ? 0 : done };
}

export const POLL_RANGE = { min: 1, max: 60 } as const;
/** Battery percent one wake-up costs: the radio powers up, a request goes out and the answer is read. */
export const WAKE_COST_PCT = 0.02;
export const MESSAGES_PER_DAY = 12;
const MINUTES_PER_DAY = 24 * 60;

export interface PollingDay {
  wakeups: number;
  /** Wake-ups that found nothing new. */
  empty: number;
  batteryPct: number;
}

/** A day of asking the server every `everyMin` minutes whether anything is new. */
export function pollingDay(everyMin: number): PollingDay {
  const wakeups = Math.floor(MINUTES_PER_DAY / everyMin);
  const empty = Math.max(0, wakeups - MESSAGES_PER_DAY);
  return { wakeups, empty, batteryPct: wakeups * WAKE_COST_PCT };
}

/** A day of push: the app wakes once per message that actually arrives. */
export function pushDay(): PollingDay {
  return { wakeups: MESSAGES_PER_DAY, empty: 0, batteryPct: MESSAGES_PER_DAY * WAKE_COST_PCT };
}

export type FeedStatus = 'idle' | 'loaded' | 'failed';
export interface Feed {
  status: FeedStatus;
  /** A refresh failed and is waiting for the network to come back. */
  pending: boolean;
  /** How many times the feed actually loaded. */
  loads: number;
}
export const EMPTY_FEED: Feed = { status: 'idle', pending: false, loads: 0 };

/** The learner presses Refresh. Offline, it fails and waits. */
export const refreshFeed = (feed: Feed, online: boolean): Feed =>
  online ? { status: 'loaded', pending: false, loads: feed.loads + 1 } : { ...feed, status: 'failed', pending: true };

/** The network changes. Coming back online finishes a refresh that was waiting. */
export const setNetwork = (feed: Feed, online: boolean): Feed => (online && feed.pending ? refreshFeed(feed, true) : feed);
