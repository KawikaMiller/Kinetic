/**
 * What each scene opens in (pure, so a test can switch through all of them and check nothing leaks between scenes)
 * and the sentences each scene's caption is built from.
 */
import { decimal, pctText } from '../../core/format';
import {
  BROKEN_SEED, CRASH_AT_MS, HEARTBEAT_MS, PAUSE, defaultSetup, defaultSwim, expectedFalseInRun, judge,
  type DetectorSetup, type Guess, type RunKind, type SwimSetup, type SweepPoint, type TwinRuns, type Verdict,
} from './model';

export interface TimeoutState {
  controls: DetectorSetup;
  ran: RunKind | null;
  /** Measured sweep points, kept with the jitter they were measured at. */
  dots: { jitterMs: number; points: SweepPoint[] } | null;
}
export const initialTimeout = (): TimeoutState => ({ controls: defaultSetup(), ran: null, dots: null });

export interface CrashPauseState {
  seed: number;
  pauseMs: number;
  decideAt: number;
  answered: { guess: Guess; decideAt: number } | null;
}
export const DECIDE = { min: CRASH_AT_MS, max: CRASH_AT_MS + PAUSE.max + 500, step: 50 } as const;
export const DEFAULT_DECIDE_AT = 5_400;
export const initialCrashPause = (): CrashPauseState => ({ seed: BROKEN_SEED, pauseMs: PAUSE.default, decideAt: DEFAULT_DECIDE_AT, answered: null });

export interface PhiState {
  seed: number;
  jitterMs: number;
  phi: number;
}
export const initialPhi = (): PhiState => ({ seed: BROKEN_SEED, jitterMs: defaultSetup().jitterMs, phi: defaultSetup().phi });

export const initialSwim = (): SwimSetup => defaultSwim();

export const ms = (v: number): string => `${Math.round(v)} ms`;

export function timeoutCaption(s: TimeoutState, falseCount: number | null): string {
  const c = s.controls;
  const rule = c.rule === 'fixed' ? `M suspects P after ${c.timeoutMs} ms of silence` : `M suspects P when phi reaches ${c.phi}`;
  if (s.ran === null) return `Heartbeats leave P every ${HEARTBEAT_MS} ms and arrive after a random delay of about ${c.jitterMs} ms. ${rule}. Press Run 10 s to watch it guess.`;
  if (c.rule === 'phi') return `${rule}, which waits ${decimal(c.phi, 0)} nines of the model's tail; run again after moving the jitter and the wait moves with it.`;
  const expected = decimal(expectedFalseInRun(c.timeoutMs, c.jitterMs, 10_000), 2);
  const kind = s.ran === 'quiet' ? 'no fault' : s.ran === 'crash' ? 'P crashes' : 'P pauses';
  return `${kind}: ${falseCount ?? 0} false suspicion${falseCount === 1 ? '' : 's'} of a live peer; the closed form expects ${expected} per 10 s at T = ${c.timeoutMs} ms.`;
}

export function crashPauseCaption(twin: TwinRuns, state: CrashPauseState): string {
  const x = twin.partsAt === null ? 'never' : `${Math.round(twin.partsAt)} ms`;
  if (state.answered === null) return `Run A crashes P at ${CRASH_AT_MS} ms; run B pauses it for ${state.pauseMs} ms. M's heartbeat lists are identical until ${x}. Pick a decision time and answer.`;
  const v: Verdict = judge(twin, state.answered.decideAt, state.answered.guess);
  return v.text;
}

export const swimCaption = (s: SwimSetup, exact: number): string =>
  `Each period M pings B; if no ack arrives it asks ${s.k} helper${s.k === 1 ? '' : 's'} to ping B for it. With ${pctText(s.loss, 0)} of messages lost${s.cut === 'none' ? '' : ' and the M to B link cut'}, M wrongly suspects B in ${pctText(exact, 2)} of periods.`;

export const CLOSED_FORM_NOTE = 'The curve counts heartbeats in the order P sent them; M sees them in the order they arrive, where a late one can be overtaken, so the measured dots sit a few per cent under it.';
