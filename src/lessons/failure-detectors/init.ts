/**
 * What each scene opens in (pure, so a test can switch through all of them and check nothing leaks between scenes)
 * and the sentences each scene's caption is built from.
 */
import { decimal, integer, pctText, power } from '../../core/format';
import {
  BROKEN_SEED, CRASH_AT_MS, HEARTBEAT_MS, PAUSE, SWEEP_SEEDS, defaultSetup, defaultSwim, expectedFalseInRun, falsePerMinute, judge,
  type DetectorSetup, type Guess, type PhiReadout, type RunKind, type SwimCut, type SwimSetup, type SweepPoint, type TwinRuns, type Verdict,
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

export function timeoutCaption(s: TimeoutState, falseCount: number | null, waitThenMs: number | null = null): string {
  const c = s.controls;
  const rule = c.rule === 'fixed' ? `M suspects P after ${c.timeoutMs} ms of silence` : `M suspects P when phi reaches ${c.phi}`;
  if (s.ran === null) return `Heartbeats leave P every ${HEARTBEAT_MS} ms and arrive after a random delay of about ${c.jitterMs} ms. ${rule}. Press Run 10 s to watch it guess.`;
  if (c.rule === 'phi') {
    const early = falseCount !== null && falseCount > 0 && waitThenMs !== null
      ? ` M suspected a live peer after only ${decimal(waitThenMs, 0)} ms of silence: early in a run it has few gaps, so its estimate was shorter then than the implied timeout shown, which is the one after the whole run.`
      : '';
    return `${rule}, which waits ${decimal(c.phi, 0)} nines of the model's tail; run again after moving the jitter and the wait moves with it.${early}`;
  }
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

export const CUT_NAMES: Record<SwimCut, string> = {
  none: 'no cut',
  both: 'the link between M and B cut both ways',
  'm-to-b': 'the link cut in the M to B direction only',
  'b-to-m': 'the link cut in the B to M direction only',
};

export const swimCaption = (s: SwimSetup, exact: number): string =>
  `Each period M pings B; if no ack arrives it asks ${s.k} helper${s.k === 1 ? '' : 's'} to ping B for it. With ${pctText(s.loss, 0)} of messages lost${s.cut === 'none' ? '' : ` and ${CUT_NAMES[s.cut]}`}, M wrongly suspects B in ${pctText(exact, 2)} of periods.`;

/** The exact-stat sub-line: the enumeration counts the 2 direct messages even when a cut means they cannot matter. */
export const swimExactSub = (s: SwimSetup, patterns: number): string =>
  `exact: all ${integer(patterns)} loss patterns of the ${2 + 4 * s.k} messages, per period${s.cut === 'none' ? '' : ' (with the link cut the 2 direct messages cannot succeed; only the helper paths count)'}`;

const percentOf = (r: number): string => `${decimal(r * 100, 0)}%`;

interface DotRatio {
  timeoutMs: number;
  ratio: number;
}

/** Measured over closed form at the sweep's shortest and longest T where the curve is above zero (the dots fall away as T grows). */
export function dotRatios(points: readonly SweepPoint[], jitterMs: number): { from: DotRatio; to: DotRatio } | null {
  const usable = points.filter((p) => falsePerMinute(p.timeoutMs, jitterMs) > 0);
  const first = usable[0];
  const last = usable.at(-1);
  if (first === undefined || last === undefined || first === last) return null;
  const r = (p: SweepPoint): DotRatio => ({ timeoutMs: p.timeoutMs, ratio: p.falsePerMin / falsePerMinute(p.timeoutMs, jitterMs) });
  return { from: r(first), to: r(last) };
}

/** The note under the trade-off plot: the dots' distance from the curve is read from the measured points, not typed. */
export function closedFormNote(points: readonly SweepPoint[] | null, jitterMs: number): string {
  const base = 'The curve counts heartbeats in the order P sent them; M sees them in the order they arrive, where a late heartbeat can be overtaken so the long gap never appears.';
  const ratios = points === null ? null : dotRatios(points, jitterMs);
  if (ratios === null) return `${base} Measure to see how far under the curve the dots fall: the gap grows as T grows.`;
  return `${base} Here the dots are ${percentOf(ratios.from.ratio)} of the curve at T = ${ratios.from.timeoutMs} ms and ${percentOf(ratios.to.ratio)} at T = ${ratios.to.timeoutMs} ms (jitter ${jitterMs} ms): close at short T, well under it at long T.`;
}

/** Scene 1's seed-sweep line: how many of the 200 seeds break rule 0 in this configuration (rule 29), and what kind of check it was (rule 28). */
export function seedSweepText(c: Pick<DetectorSetup, 'rule' | 'timeoutMs' | 'jitterMs' | 'phi'>, failing: readonly number[]): string {
  const rule = c.rule === 'fixed' ? `T = ${c.timeoutMs} ms` : `phi ${c.phi}`;
  const lowest = failing.length === 0 ? 'no seed fails' : `lowest failing seed ${failing[0]}`;
  return `At ${rule} and jitter ${c.jitterMs} ms rule 0 (accuracy) fails on ${failing.length} of ${SWEEP_SEEDS} seeds (10 s fault-free runs; ${lowest}). Sampled over seeds 1 to ${SWEEP_SEEDS}, not exhaustive: nothing in this lesson checks every schedule.`;
}

export const oneInText = (p: number): string => `1 in ${integer(1 / p)}`;

const PHI_TAIL_RATIO = { high: 1.5, low: 1 / 1.5 } as const;

/** The scene-3 hint: where the true tail sits against the model's 1 in 10^phi, decided from the closed form. */
export function phiTailHint(r: Pick<PhiReadout, 'actual'>, phi: number): string {
  const ratio = r.actual / 10 ** -phi;
  const side = ratio > PHI_TAIL_RATIO.high ? 'above' : ratio < PHI_TAIL_RATIO.low ? 'below' : 'about equal to';
  const tail = side === 'above' ? 'so the model under-states how often a gap is late' : side === 'below' ? 'so here the normal curve is the pessimistic one' : 'so the two agree at this phi';
  return `Phi is the model's statement, not a promise: real gaps are not normal. Here a gap is ${HEARTBEAT_MS} ms plus the difference of two exponential delays, which has a heavier tail than a normal curve. At phi ${phi} the true chance a gap beats the timeout is ${oneInText(r.actual)} (closed form), ${side} the model's 1 in ${power(phi, 10)}, ${tail}. Move phi to see it change sides.`;
}

const GAP_COMPARE_MIN_EXPECTED = 20;

/** Sub-line for the measured phi stat: the closed form's expected count, and how the arrival-order measurement compares when there are enough events to compare. */
export function phiMeasuredSub(r: Pick<PhiReadout, 'actual' | 'exceeded' | 'gaps'>): string {
  const expected = r.actual * r.gaps;
  const share = r.gaps === 0 ? 0 : (r.exceeded / r.gaps) * 100;
  const base = `gaps over the timeout, sampled over ${SWEEP_SEEDS} seeds (${decimal(share, 2)}%); the closed form expects ${decimal(expected, expected < 10 ? 1 : 0)}`;
  return expected >= GAP_COMPARE_MIN_EXPECTED ? `${base}, so arrival order gives ${decimal((r.exceeded / expected) * 100, 0)}% of it` : `${base}, too few to compare`;
}
