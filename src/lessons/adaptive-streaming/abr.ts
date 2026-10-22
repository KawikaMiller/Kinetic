/**
 * An adaptive-bitrate player, event by event. Pure; no wall clock.
 *
 * The network is a throughput trace in Mbit/s, one sample per second (the last sample repeats past the end). The
 * player fetches the video in segments of `S` seconds, each at a rendition chosen from the bitrate ladder just before
 * the request. A segment of length L at bitrate B is B x L megabits; its download time is that size divided by the
 * trace's throughput while it downloads (the trace is integrated, so a drop in the middle of a download slows it).
 *
 * The buffer holds seconds of video. It grows by L when a segment lands and drains one second per second while the
 * video is playing. Playback starts when the first segment lands; if the buffer empties before the next segment
 * lands the video stalls until it does. The player does not request more once the buffer could not take another
 * segment under MAX_BUFFER: it waits, draining, then asks.
 *
 * Per segment, while playing and not stalling:  buffer' = buffer - downloadTime + L.
 * Over a whole run:  wall time = startup delay + video length + stalled time.
 * Every number here is an illustrative model value, not a measurement of any service.
 */
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

/** The bitrate ladder in Mbit/s: five renditions, illustrative. */
export const LADDER: readonly number[] = [0.4, 0.8, 1.6, 3.0, 5.0];
export const VIDEO_SECONDS = 120;
export const MAX_BUFFER = 30;
export const SEGMENT = { min: 2, max: 10, initial: 4 } as const;
export const TRACE_SECONDS = 150;
/** A download that finishes this close to the instant the buffer empties is on time, not a stall (floating-point noise). */
const EPS = 1e-9;

export type TraceId = 'steady' | 'drop' | 'sawtooth' | 'commute' | 'random' | 'dead';
export const TRACES: { id: TraceId; label: string; note: string }[] = [
  { id: 'steady', label: 'steady', note: '4 Mbit/s throughout.' },
  { id: 'drop', label: 'a drop', note: '6 Mbit/s, then 0.5 Mbit/s from 40 s to 80 s, then 6 again.' },
  { id: 'sawtooth', label: 'sawtooth', note: 'Climbs from 0.5 to 5.5 Mbit/s over 20 s, then falls back, over and over.' },
  { id: 'commute', label: 'a commute', note: 'A hand-made trace with tunnels and a station: it dips and recovers.' },
  { id: 'random', label: 'random walk', note: 'A seeded random walk between 0.2 and 6 Mbit/s.' },
  { id: 'dead', label: 'no data', note: 'Zero throughput: nothing ever arrives.' },
];

/** Five-second steps of the hand-made commute trace, Mbit/s. */
const COMMUTE = [3, 3, 3, 3, 2, 2, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.8, 2.5, 3, 3, 3, 0.3, 0.3, 1.5, 3, 4, 4, 3, 1, 0.6, 2, 3, 3, 3];
const WALK = { start: 3, step: 0.5, min: 0.2, max: 6 };

export function traceOf(id: TraceId, seed = 1): number[] {
  const at = (f: (t: number) => number) => Array.from({ length: TRACE_SECONDS }, (_, t) => f(t));
  if (id === 'steady') return at(() => 4);
  if (id === 'drop') return at((t) => (t >= 40 && t < 80 ? 0.5 : 6));
  if (id === 'sawtooth') return at((t) => 0.5 + 5 * ((t % 20) / 20));
  if (id === 'commute') return at((t) => COMMUTE[Math.floor(t / 5) % COMMUTE.length]);
  if (id === 'dead') return at(() => 0);
  const rnd = mulberry32(seed);
  let x = WALK.start;
  return at(() => {
    x = Math.min(WALK.max, Math.max(WALK.min, x + normal(rnd, 0, WALK.step)));
    return x;
  });
}

/** Seconds a download of `sizeMbit` starting at `t0` takes, integrating the trace; Infinity if it never completes. */
export function downloadTime(trace: readonly number[], t0: number, sizeMbit: number): number {
  let remaining = sizeMbit;
  let t = t0;
  const last = trace.length - 1;
  while (remaining > 1e-12) {
    const i = Math.floor(t);
    const rate = trace[Math.min(i, last)];
    if (i >= last) return rate <= 0 ? Infinity : t - t0 + remaining / rate;
    const avail = rate * (i + 1 - t);
    if (rate > 0 && avail >= remaining) return t - t0 + remaining / rate;
    remaining -= avail;
    t = i + 1;
  }
  return t - t0;
}

export type AlgoId = 'naive' | 'rate' | 'buffer';
export const ALGOS: { id: AlgoId; label: string; blurb: string }[] = [
  { id: 'naive', label: 'naive', blurb: 'always the highest rendition' },
  { id: 'rate', label: 'rate-based', blurb: 'the highest rendition under a safety fraction of the throughput estimate' },
  { id: 'buffer', label: 'buffer-based', blurb: 'the rendition the buffer level allows, between a reservoir and a cushion' },
];

export const SAFETY = 0.8;
export const ALPHA = 0.5;
export const RESERVOIR = 8;
export const CUSHION = 20;

/** Rate-based: the highest rendition whose bitrate is within SAFETY of the estimate; the lowest before any estimate. */
export function chooseRate(estimate: number | null): number {
  if (estimate === null) return 0;
  let pick = 0;
  LADDER.forEach((b, i) => {
    if (b <= SAFETY * estimate) pick = i;
  });
  return pick;
}

/** The bitrate the buffer-based map allows at this buffer level: lowest up to the reservoir, highest past the cushion, a ramp between. */
export function bufferMap(buffer: number): number {
  const lo = LADDER[0];
  const hi = LADDER[LADDER.length - 1];
  if (buffer <= RESERVOIR) return lo;
  if (buffer >= RESERVOIR + CUSHION) return hi;
  return lo + ((buffer - RESERVOIR) / CUSHION) * (hi - lo);
}
export function chooseBuffer(buffer: number): number {
  const allowed = bufferMap(buffer);
  let pick = 0;
  LADDER.forEach((b, i) => {
    if (b <= allowed) pick = i;
  });
  return pick;
}

export function choose(algo: AlgoId, buffer: number, estimate: number | null): number {
  if (algo === 'naive') return LADDER.length - 1;
  return algo === 'rate' ? chooseRate(estimate) : chooseBuffer(buffer);
}

export interface Seg {
  index: number;
  rendition: number;
  bitrate: number;
  length: number;
  sizeMbit: number;
  /** Idle seconds spent waiting for room in the buffer before this request. */
  waited: number;
  start: number;
  end: number;
  bufferBefore: number;
  bufferAfter: number;
  /** Seconds the video was frozen waiting for this segment. */
  stall: number;
  /** The throughput this download measured, Mbit/s. */
  sample: number;
  /** The estimate the choice was made with (null before the first download) and the estimate after this one. */
  estimateBefore: number | null;
  estimate: number;
}
export interface Run {
  segs: Seg[];
  S: number;
  count: number;
  startup: number;
  stallTime: number;
  stallCount: number;
  avgBitrate: number;
  switches: number;
  /** When the last second of video has played; null when a download never completed. */
  wall: number | null;
  /** The segment that never arrived (zero throughput to the end), or null. */
  stuckAt: number | null;
}

export function simulate(trace: readonly number[], S: number, algo: AlgoId): Run {
  const count = Math.ceil(VIDEO_SECONDS / S);
  const segs: Seg[] = [];
  let t = 0;
  let buffer = 0;
  let playing = false;
  let estimate: number | null = null;
  let startup = 0;
  let stuckAt: number | null = null;
  for (let k = 0; k < count; k++) {
    const length = k < count - 1 ? S : VIDEO_SECONDS - S * (count - 1);
    let waited = 0;
    if (playing && buffer + length > MAX_BUFFER) {
      waited = buffer + length - MAX_BUFFER;
      t += waited;
      buffer -= waited;
    }
    const rendition = choose(algo, buffer, estimate);
    const bitrate = LADDER[rendition];
    const sizeMbit = bitrate * length;
    const dt = downloadTime(trace, t, sizeMbit);
    if (!Number.isFinite(dt)) {
      stuckAt = k;
      break;
    }
    const start = t;
    const end = t + dt;
    let stall = 0;
    let bufferAfter: number;
    if (!playing) {
      playing = true;
      startup = end;
      bufferAfter = length;
    } else if (dt <= buffer + EPS) {
      bufferAfter = Math.max(0, buffer - dt) + length;
    } else {
      stall = dt - buffer;
      bufferAfter = length;
    }
    const sample = sizeMbit / dt;
    const estimateBefore = estimate;
    estimate = estimate === null ? sample : ALPHA * sample + (1 - ALPHA) * estimate;
    segs.push({ index: k, rendition, bitrate, length, sizeMbit, waited, start, end, bufferBefore: buffer, bufferAfter, stall, sample, estimateBefore, estimate });
    t = end;
    buffer = bufferAfter;
  }
  const done = stuckAt === null;
  const played = segs.reduce((n, s) => n + s.length, 0);
  return {
    segs,
    S,
    count,
    startup,
    stallTime: segs.reduce((n, s) => n + s.stall, 0),
    stallCount: segs.filter((s) => s.stall > 0).length,
    avgBitrate: played > 0 ? segs.reduce((n, s) => n + s.bitrate * s.length, 0) / played : 0,
    switches: segs.filter((s, i) => i > 0 && s.rendition !== segs[i - 1].rendition).length,
    wall: done ? t + buffer : null,
    stuckAt,
  };
}

/** The buffer level at wall time `t`, from the run's own records (piecewise linear; 0 before the first segment). */
export function bufferAt(run: Run, t: number): number {
  let level = 0;
  let clock = 0;
  let playing = false;
  for (const s of run.segs) {
    if (t < s.start) {
      return playing ? Math.max(0, level - (t - clock)) : 0;
    }
    if (playing) level = Math.max(0, level - (s.start - clock));
    if (t < s.end) return playing ? Math.max(0, level - (t - s.start)) : 0;
    level = s.bufferAfter;
    clock = s.end;
    playing = true;
  }
  return playing ? Math.max(0, level - (t - clock)) : 0;
}

/** The seconds of video that have played by wall time `t`: the playing time so far, never more than the video. */
export function playedAt(run: Run, t: number): number {
  const begin = run.segs.length > 0 ? run.startup : 0;
  if (t <= begin) return 0;
  let stalled = 0;
  for (const s of run.segs) {
    if (s.stall > 0) {
      const from = s.end - s.stall;
      stalled += Math.max(0, Math.min(t, s.end) - from);
    }
  }
  const downloaded = run.segs.reduce((n, s) => n + s.length, 0);
  return Math.min(downloaded, t - begin - stalled);
}

export interface Qoe {
  startup: number;
  stallTime: number;
  stallCount: number;
  avgBitrate: number;
  switches: number;
}
export interface Weights {
  bitrate: number;
  stall: number;
  switches: number;
  startup: number;
}
export const DEFAULT_WEIGHTS: Weights = { bitrate: 1, stall: 2, switches: 0.5, startup: 0.5 };
export const WEIGHT_MAX = 5;

/** The learner's own composite score. There is no correct set of weights. */
export const score = (q: Qoe, w: Weights): number => w.bitrate * q.avgBitrate - w.stall * q.stallTime - w.switches * q.switches - w.startup * q.startup;
