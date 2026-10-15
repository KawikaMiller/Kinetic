/**
 * physical-clocks-skew, scene 1: the arithmetic of a drifting clock and of NTP's four-timestamp exchange.
 *
 * A node's clock reads `local(t) = offset + t * (1 + drift * 1e-6)` for true time `t` (all times in ms). Its skew is
 * `local(t) - t = offset + t * drift * 1e-6`. NTP's estimate is theta = ((t1 - t0) + (t2 - t3)) / 2 and the round-trip
 * delay is delta = (t3 - t0) - (t2 - t1) (the formulas of the NTP specification, RFC 5905; from memory, verify).
 * Nothing here reads a wall clock: true time is an argument.
 */

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_DAY = 86_400;
/** Slider bounds (AC: hostile input). */
export const DRIFT_PPM_MAX = 200;
export const OFFSET_MS_MAX = 1000;
export const POLL_SECONDS = { min: 1, max: 1024 } as const;
export const PATH_MS_MAX = 200;
/** Simulated time without any sync, shown on the skew plot: six hours. */
export const UNSYNCED_HORIZON_MS = 6 * 3600 * MS_PER_SECOND;
/** With sync on, the plot shows this many polls. */
export const POLLS_SHOWN = 24;
/** The made-up rate at which the slewing variant absorbs a correction, as a fraction (500 ppm = 0.0005). Illustrative. */
export const SLEW_RATE = 400e-6;

export interface ClockSpec {
  offsetMs: number;
  driftPpm: number;
}

export const localTime = (c: ClockSpec, t: number): number => c.offsetMs + t * (1 + c.driftPpm * 1e-6);
export const skewAt = (c: ClockSpec, t: number): number => localTime(c, t) - t;

/** How far a clock with this drift runs away in a day, ms: 1 ppm is 86.4 ms a day. */
export const driftMsPerDay = (ppm: number): number => ppm * 1e-6 * SECONDS_PER_DAY * MS_PER_SECOND;

export interface NtpSample {
  theta: number;
  delta: number;
}

/** The estimate of the server's offset from the client, and the round-trip delay, from the four timestamps. */
export const ntpEstimate = (t0: number, t1: number, t2: number, t3: number): NtpSample => ({
  theta: (t1 - t0 + (t2 - t3)) / 2,
  delta: t3 - t0 - (t2 - t1),
});

/** What an asymmetric path does to the estimate when both clocks are perfect: (forward - return) / 2. */
export const asymmetryError = (forwardMs: number, returnMs: number): number => (forwardMs - returnMs) / 2;

/** The worst error a client reaches between syncs: its drift over one poll interval. */
export const worstDriftError = (driftPpm: number, pollSeconds: number): number => Math.abs(driftPpm) * 1e-6 * pollSeconds * MS_PER_SECOND;

export type SyncMode = 'off' | 'step' | 'slew';

export interface SkewPoint {
  /** True time, ms. */
  t: number;
  /** The clock's skew from true time, ms. */
  skew: number;
}

export interface SeriesOptions {
  mode: SyncMode;
  pollSeconds: number;
  forwardMs: number;
  returnMs: number;
  horizonMs: number;
}

/**
 * The skew of a client that polls a perfect server every `pollSeconds`, as the vertices of a piecewise-linear curve.
 * Each exchange starts at a poll time tau and the client applies its estimate when the reply arrives, at tau + dF + dR:
 * `step` adds theta at once (so the clock can jump backwards), `slew` absorbs it at SLEW_RATE (so it never does).
 * The estimate is theta = (dF - dR) / 2 - skew(tau + delta / 2): the clock error at the middle of the exchange, plus the asymmetry.
 */
export function skewSeries(clock: ClockSpec, o: SeriesOptions): SkewPoint[] {
  const drift = clock.driftPpm * 1e-6;
  const out: SkewPoint[] = [{ t: 0, skew: clock.offsetMs }];
  let t = 0;
  let skew = clock.offsetMs;
  let pending = 0;
  const advanceTo = (to: number) => {
    while (t < to) {
      const slewing = pending !== 0;
      const slewEnd = slewing ? t + Math.abs(pending) / SLEW_RATE : Infinity;
      const stop = Math.min(to, slewEnd);
      const dt = stop - t;
      skew += dt * (drift + (slewing ? Math.sign(pending) * SLEW_RATE : 0));
      if (slewing) pending -= Math.sign(pending) * SLEW_RATE * dt;
      t = stop;
      if (slewing && t >= slewEnd - 1e-9) pending = 0;
      out.push({ t, skew });
    }
  };
  if (o.mode === 'off') return [out[0], { t: o.horizonMs, skew: skewAt(clock, o.horizonMs) }];
  const delta = o.forwardMs + o.returnMs;
  // The client polls on its own oscillator: one poll interval of its local time is `poll / (1 + drift)` of true time.
  const period = (o.pollSeconds * MS_PER_SECOND) / (1 + drift);
  for (let tau = period; tau <= o.horizonMs; tau += period) {
    advanceTo(tau + delta);
    const rateNow = drift + (pending === 0 ? 0 : Math.sign(pending) * SLEW_RATE);
    const theta = asymmetryError(o.forwardMs, o.returnMs) - (skew - rateNow * (delta / 2));
    if (o.mode === 'step') {
      skew += theta;
      out.push({ t, skew });
    } else {
      pending += theta;
    }
  }
  advanceTo(o.horizonMs);
  return out;
}

/** The largest absolute skew in a series. */
export const worstSkew = (series: readonly SkewPoint[]): number => Math.max(...series.map((p) => Math.abs(p.skew)));

export interface StepDemo {
  /** The wall clock just before the step, ms (a reading of the node's own clock). */
  before: number;
  /** The wall clock just after, same instant. */
  after: number;
  /** How far the wall clock moved: negative means it went backwards. */
  moved: number;
  /** A monotonic clock over the same instant is never stepped: it moves forward by the real elapsed time at the oscillator's rate (a real one may also be slewed by a small rate; this demo does not model that). */
  monotonicAdvance: number;
}

/** The first estimate a client with `clock` makes: its first poll starts one local poll interval in. */
export function firstEstimate(clock: ClockSpec, o: Omit<SeriesOptions, 'mode' | 'horizonMs'>): { tau: number; theta: number } {
  const tau = (o.pollSeconds * MS_PER_SECOND) / (1 + clock.driftPpm * 1e-6);
  const mid = skewAt(clock, tau + (o.forwardMs + o.returnMs) / 2);
  return { tau, theta: asymmetryError(o.forwardMs, o.returnMs) - mid };
}

/**
 * What the first correction does to a program reading the wall clock: it reads, the client applies `theta`, it reads again `gapMs`
 * of true time later. `step` adds theta at once, so a clock that is ahead of the server is stepped back; `slew` only changes how
 * fast the clock runs, so the second reading is later than the first.
 */
export function wallClockDemo(clock: ClockSpec, mode: 'step' | 'slew', atMs: number, gapMs: number, theta: number): StepDemo {
  const before = localTime(clock, atMs);
  const base = localTime(clock, atMs + gapMs);
  const after = mode === 'step' ? base + theta : base + Math.sign(theta) * Math.min(Math.abs(theta), SLEW_RATE * gapMs);
  return { before, after, moved: after - before, monotonicAdvance: gapMs * (1 + clock.driftPpm * 1e-6) };
}
