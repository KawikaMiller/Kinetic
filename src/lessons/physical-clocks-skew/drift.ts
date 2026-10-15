/**
 * physical-clocks-skew, scene 1: what the drift scene shows, derived from the controls. Pure.
 */
import {
  MS_PER_SECOND, POLLS_SHOWN, UNSYNCED_HORIZON_MS, asymmetryError, driftMsPerDay, firstEstimate, skewSeries, wallClockDemo, worstDriftError, worstSkew,
  type ClockSpec, type SkewPoint, type StepDemo, type SyncMode,
} from './clocks';
import { runExchange } from './ntp';

export const NODE_NAMES = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;
/** Tens of ppm is the ballpark for ordinary quartz clocks (from memory; check a datasheet): these two presets are illustrative. */
export const GOOD_CLOCKS: readonly ClockSpec[] = [
  { offsetMs: 0, driftPpm: 3 }, { offsetMs: 0, driftPpm: -2 }, { offsetMs: 0, driftPpm: 5 }, { offsetMs: 0, driftPpm: -4 }, { offsetMs: 0, driftPpm: 1 },
];
export const BAD_CLOCKS: readonly ClockSpec[] = [
  { offsetMs: 400, driftPpm: 150 }, { offsetMs: -250, driftPpm: -120 }, { offsetMs: 0, driftPpm: 90 }, { offsetMs: 800, driftPpm: -200 }, { offsetMs: -600, driftPpm: 60 },
];

export interface DriftState {
  clocks: readonly ClockSpec[];
  node: number;
  mode: SyncMode;
  /** The poll interval is 2^pollExp seconds. */
  pollExp: number;
  forwardMs: number;
  returnMs: number;
}

export const POLL_EXP = { min: 0, max: 10 } as const;
export const DEFAULT_DRIFT: DriftState = { clocks: BAD_CLOCKS, node: 3, mode: 'off', pollExp: 6, forwardMs: 20, returnMs: 20 };

export const pollSecondsOf = (s: DriftState): number => 2 ** s.pollExp;

export interface DriftView {
  horizonMs: number;
  series: SkewPoint[][];
  /** Vertices just after a correction, for the selected node. */
  corrections: SkewPoint[];
  worst: number;
  /** The selected node's clock. */
  clock: ClockSpec;
  perDayMs: number;
  /** A closed-form peak between syncs for the selected node: drift x poll. */
  driftTimesPollMs: number;
  asymmetryMs: number;
  /** The first correction's effect on a program reading the wall clock (sync on only). */
  demo: StepDemo | null;
  exchange: ReturnType<typeof runExchange>['exchange'];
  /** The error of that exchange's estimate against the true offset, ms. */
  exchangeError: number;
}

export function driftView(s: DriftState): DriftView {
  const poll = pollSecondsOf(s);
  const clock = s.clocks[s.node];
  const horizonMs = s.mode === 'off' ? UNSYNCED_HORIZON_MS : POLLS_SHOWN * poll * MS_PER_SECOND;
  const opts = { mode: s.mode, pollSeconds: poll, forwardMs: s.forwardMs, returnMs: s.returnMs, horizonMs };
  const series = s.clocks.map((c) => skewSeries(c, opts));
  const mine = series[s.node];
  const corrections = s.mode === 'step' ? mine.filter((p, i) => i > 0 && p.t === mine[i - 1].t) : [];
  // The worst error once every node has had a chance to sync: the second half of the window.
  const settled = s.mode === 'off' ? series.flat() : series.flatMap((p) => p.filter((v) => v.t >= horizonMs / 2));
  const { exchange } = runExchange({ clock, forwardMs: s.forwardMs, returnMs: s.returnMs });
  const first = s.mode === 'off' ? null : firstEstimate(clock, { pollSeconds: poll, forwardMs: s.forwardMs, returnMs: s.returnMs });
  return {
    horizonMs,
    series,
    corrections,
    worst: worstSkew(settled),
    clock,
    perDayMs: driftMsPerDay(clock.driftPpm),
    driftTimesPollMs: worstDriftError(clock.driftPpm, poll),
    asymmetryMs: asymmetryError(s.forwardMs, s.returnMs),
    demo: first && s.mode !== 'off' ? wallClockDemo(clock, s.mode, first.tau, 1, first.theta) : null,
    exchange,
    // The server's clock is perfect, so the true offset of the server from this client is minus the client's skew at the start.
    exchangeError: exchange.theta - -clock.offsetMs,
  };
}
