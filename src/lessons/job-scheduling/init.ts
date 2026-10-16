/**
 * The state each scene opens in (pure functions, so a test can walk through every scene and check that none
 * leaks into another), plus the small pure rules the scenes' controls use.
 */
import { parseBoundedDecimal } from '../../core/parse';
import { CRON_DEFAULT } from './cron';
import { DEFAULT_QUEUE, type QueueSetup } from './queue';
import { DEFAULT_SCHED, type SchedMode, type SchedSetup } from './sched';
import { DEFAULT_JOBS, DELAY_MAX_S, DELAY_MIN_S, DELAY_STEP_S, MAX_JOBS, type WheelJob } from './wheel';

export interface WheelState {
  jobs: WheelJob[];
  /** The delay field's text. */
  text: string;
  refusal: string | null;
}
export const DEFAULT_DELAY_TEXT = '7';
export const initialWheel = (): WheelState => ({ jobs: DEFAULT_JOBS.map((j) => ({ ...j })), text: DEFAULT_DELAY_TEXT, refusal: null });

export type DelayParse = { ok: true; value: number } | { ok: false; error: string };

/** A delay from the field: a plain decimal, 0.5 to 60 s, in whole half-seconds. */
export function parseDelay(text: string): DelayParse {
  const r = parseBoundedDecimal(text, {
    min: DELAY_MIN_S,
    max: DELAY_MAX_S,
    messages: {
      empty: 'Type a delay in seconds, like 7 or 12.5.',
      tooSmall: () => `The shortest delay is ${DELAY_MIN_S} s.`,
      tooBig: () => `The longest delay is ${DELAY_MAX_S} s.`,
    },
  });
  if (!r.ok) return r;
  const halves = r.value / DELAY_STEP_S;
  return Math.abs(halves - Math.round(halves)) > 1e-9 ? { ok: false, error: `Use whole half-seconds: ${DELAY_STEP_S}, 1, 1.5 and so on.` } : r;
}

/** Add a job with `value` seconds, or the field's text; refused with the reason when it is not a delay or the queue is full. */
export function addDelay(state: WheelState, value?: number): WheelState {
  if (state.jobs.length >= MAX_JOBS) return { ...state, refusal: `The queue holds ${MAX_JOBS} jobs: remove one before adding another.` };
  const delay = value === undefined ? parseDelay(state.text) : ({ ok: true, value } as const);
  if (!delay.ok) return { ...state, refusal: delay.error };
  const id = state.jobs.reduce((m, j) => Math.max(m, j.id), 0) + 1;
  return { ...state, jobs: [...state.jobs, { id, delay: delay.value }], refusal: null };
}

export const initialQueue = (): QueueSetup => ({ ...DEFAULT_QUEUE });
export const initialSched = (): SchedSetup => ({ ...DEFAULT_SCHED });

export interface ExprState {
  text: string;
}
export const initialExpr = (): ExprState => ({ text: CRON_DEFAULT });

const SKEW_AND_DUPLICATES = 'Clock skew and duplicated messages are separate ways to run a fire twice';
const FENCE_LIMIT = 'a fence only rejects a lower token that arrives after a higher one, and an equal token is not a lower one';

/** The line under the seed controls in the cron scene: what the pinned seed shows, and what each mode cannot stop. */
export function cronSeedHint(mode: SchedMode, pinned: number | null): string {
  if (pinned === null) {
    return 'None of the 200 seeded schedules runs a fire twice in this mode, with kills, pauses, lost messages, clock skew or duplicated messages all in the draw: the unique key depends on no clock and no message count.';
  }
  const lowest = `Seed ${pinned} is the lowest of 200 seeded schedules that runs a fire twice in this mode.`;
  if (mode === 'leader-fenced') {
    return `${lowest} No pause is involved there: lost renewals left r1 believing it still led, and its run reached the database before the new leader's (${FENCE_LIMIT}). ${SKEW_AND_DUPLICATES} that fencing does not stop; only the dedupe key does.`;
  }
  if (mode === 'leader') return `${lowest} ${SKEW_AND_DUPLICATES}; only the dedupe key stops them.`;
  return lowest;
}
