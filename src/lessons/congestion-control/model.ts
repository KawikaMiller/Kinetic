/**
 * TCP congestion control on a per-round fluid model: a sender, one bottleneck link and a receiver, one step per
 * round trip. No ACK clocking, no delayed ACKs, no SACK: this shows the shape of the window, not packet timing.
 *
 * The link is described in segments. With a segment of 1500 bytes, the bandwidth-delay product is
 * `Mbit/s x ms / 12` segments, so the sliders (steps of 6 Mbit/s and 12 ms) give whole numbers.
 *
 * Window algorithms (Reno, CUBIC) send `cwnd` segments per round. A window above `BDP + B` overflows the buffer and
 * the excess is lost; the standing queue is `inflight - BDP`; the round trip is `RTT0 x (1 + queue / BDP)`.
 * BBR is a rate algorithm: it is stepped in slots of the base round trip, with its own queue. Constants taken from
 * memory (IW10, CUBIC C and beta, the BBR gains) are named here and chipped on screen.
 */
import { mulberry32 } from '../../core/random';

export type Algo = 'reno' | 'cubic' | 'bbr';
export type Phase = 'slow-start' | 'avoidance' | 'startup' | 'drain' | 'probe-bw';
export type LossEvent = 'loss' | 'timeout';

/** A segment's size in bytes in this lesson (a round number; a real MSS is a little smaller). */
export const SEGMENT_BYTES = 1500;
/** Initial window in segments: RFC 6928 (from memory: verify). */
export const INITIAL_WINDOW = 10;
/** The sender stops growing here and says so (a window this big cannot be reached on the slider ranges). */
export const CWND_CAP = 10_000;
/** Smallest ssthresh after a loss, in segments (RFC 5681, from memory: verify). */
export const MIN_SSTHRESH = 2;
/** CUBIC's scaling constant and multiplicative-decrease factor (RFC 9438, whose predecessor is RFC 8312: from memory, verify). */
export const CUBIC_C = 0.4;
export const CUBIC_BETA = 0.7;
/** BBR v1 (Cardwell et al., ACM Queue 2016, from memory): startup gain 2/ln 2, drain gain its inverse, the ProbeBW cycle, the cap on the window. */
export const BBR_STARTUP_GAIN = 2 / Math.LN2;
export const BBR_DRAIN_GAIN = Math.LN2 / 2;
export const BBR_PROBE_GAINS: readonly number[] = [1.25, 0.75, 1, 1, 1, 1, 1, 1];
export const BBR_CWND_GAIN = 2;
/** BtlBw is the maximum delivery rate over this many rounds. */
export const BBR_FILTER_ROUNDS = 10;
/** Startup ends when the bandwidth estimate has not grown by this factor for BBR_FULL_ROUNDS rounds in a row. */
export const BBR_FULL_GROWTH = 1.25;
export const BBR_FULL_ROUNDS = 3;
/** Drain ends when the queue is down to this many segments. */
export const BBR_DRAINED_QUEUE = 1;

export interface LinkSetup {
  mbps: number;
  rttMs: number;
  /** The buffer in BDPs. */
  bufferBdp: number;
  /** Chance that a segment is lost for a reason other than a full buffer, 0 to 0.02. */
  loss: number;
  /** Every loss is a timeout (the whole window is lost) instead of three duplicate ACKs; only Reno's scene offers it. */
  timeouts: boolean;
  seed: number;
}

export const RANGES = {
  mbps: { min: 6, max: 120, step: 6 },
  rttMs: { min: 12, max: 240, step: 12 },
  bufferBdp: { min: 0.1, max: 2, step: 0.1 },
  loss: { min: 0, max: 0.02, step: 0.0025 },
} as const;

export const DEFAULT_LINK: LinkSetup = { mbps: 12, rttMs: 60, bufferBdp: 0.5, loss: 0, timeouts: false, seed: 7 };

/** The bandwidth-delay product in segments. */
export const bdpOf = (l: Pick<LinkSetup, 'mbps' | 'rttMs'>): number => (l.mbps * l.rttMs) / ((SEGMENT_BYTES * 8) / 1000);
/** The buffer in segments, never below one (a link with no buffer cannot queue a single segment). */
export const bufferOf = (l: Pick<LinkSetup, 'mbps' | 'rttMs' | 'bufferBdp'>): number => Math.max(1, Math.round(l.bufferBdp * bdpOf(l)));
/** The window at which the buffer overflows. */
export const thresholdOf = (l: Pick<LinkSetup, 'mbps' | 'rttMs' | 'bufferBdp'>): number => bdpOf(l) + bufferOf(l);

export interface RoundRec {
  round: number;
  /** Segments sent this round (the window), or for BBR the segments sent per base round trip. */
  sent: number;
  /** Reno and CUBIC: the slow start threshold before this round (Infinity until the first loss). */
  ssthresh: number;
  phase: Phase;
  /** Segments in the buffer after the round. */
  queue: number;
  rttMs: number;
  /** Share of the link used, 0 to 1. */
  util: number;
  event: LossEvent | null;
  /** Segments dropped because the buffer was full. */
  overflow: number;
  /** The window wanted to grow past CWND_CAP and was held there. */
  saturated: boolean;
  /** BBR: the bottleneck rate it paced by this round, in segments per base round trip. */
  btlbw?: number;
  /** CUBIC: the window of the last loss, and the seconds since it. */
  wmax?: number;
  epochSec?: number;
}

export const cubicK = (wmax: number): number => Math.cbrt((wmax * (1 - CUBIC_BETA)) / CUBIC_C);
/** The CUBIC window `t` seconds after a loss at `wmax`. */
export const cubicWindow = (t: number, wmax: number): number => CUBIC_C * (t - cubicK(wmax)) ** 3 + wmax;

/** Reno's window after a round: halve on a loss (or restart from 1 after a timeout), double in slow start, add one in avoidance. */
export function renoNext(cwnd: number, ssthresh: number, sent: number, event: LossEvent | null): { cwnd: number; ssthresh: number } {
  if (event !== null) {
    const half = Math.max(MIN_SSTHRESH, sent / 2);
    return { cwnd: event === 'timeout' ? 1 : half, ssthresh: half };
  }
  if (cwnd < ssthresh) return { cwnd: Math.min(cwnd * 2, ssthresh), ssthresh };
  return { cwnd: cwnd + 1, ssthresh };
}

interface RoundOutcome {
  queue: number;
  rttMs: number;
  util: number;
  overflow: number;
}

/** The link's answer to a window of `sent` segments in one round. */
function throughLink(l: LinkSetup, sent: number): RoundOutcome {
  const bdp = bdpOf(l);
  const limit = thresholdOf(l);
  const inflight = Math.min(sent, limit);
  const queue = Math.max(0, inflight - bdp);
  return { queue, rttMs: l.rttMs * (1 + queue / bdp), util: Math.min(1, inflight / bdp), overflow: Math.max(0, sent - limit) };
}

/** True when a round of `sent` segments loses one by chance, with each segment lost independently with chance `p`. */
export const randomLoss = (rnd: () => number, p: number, sent: number): boolean => p > 0 && rnd() < 1 - (1 - p) ** sent;

function simulateWindow(algo: 'reno' | 'cubic', l: LinkSetup, rounds: number): RoundRec[] {
  const rnd = mulberry32(l.seed);
  const out: RoundRec[] = [];
  let cwnd = INITIAL_WINDOW;
  let ssthresh = Infinity;
  let wmax = 0;
  let epoch = 0;
  let inEpoch = false;
  for (let round = 0; round < rounds; round++) {
    const saturated = cwnd > CWND_CAP;
    const sent = Math.min(cwnd, CWND_CAP);
    const link = throughLink(l, sent);
    const lost = link.overflow > 0 || randomLoss(rnd, l.loss, sent);
    const event: LossEvent | null = lost ? (l.timeouts && algo === 'reno' ? 'timeout' : 'loss') : null;
    const phase: Phase = cwnd < ssthresh ? 'slow-start' : 'avoidance';
    out.push({ round, sent, ssthresh, phase, queue: link.queue, rttMs: link.rttMs, util: link.util, event, overflow: link.overflow, saturated, wmax: inEpoch ? wmax : undefined, epochSec: inEpoch ? epoch : undefined });
    if (algo === 'reno') {
      ({ cwnd, ssthresh } = renoNext(cwnd, ssthresh, sent, event));
    } else if (event !== null) {
      wmax = sent;
      ssthresh = Math.max(MIN_SSTHRESH, sent * CUBIC_BETA);
      cwnd = ssthresh;
      epoch = 0;
      inEpoch = true;
    } else if (!inEpoch) {
      cwnd = cwnd < ssthresh ? Math.min(cwnd * 2, ssthresh) : cwnd + 1;
    } else {
      epoch += link.rttMs / 1000;
      cwnd = Math.max(cwnd, cubicWindow(epoch, wmax));
    }
  }
  return out;
}

function simulateBbr(l: LinkSetup, rounds: number): RoundRec[] {
  const bdp = bdpOf(l);
  const buffer = bufferOf(l);
  const out: RoundRec[] = [];
  const samples: number[] = [];
  let phase: Phase = 'startup';
  let btlbw = INITIAL_WINDOW;
  let rtprop = 1;
  let queue = 0;
  let lastFull = 0;
  let fullRounds = 0;
  let cycle = 0;
  for (let round = 0; round < rounds; round++) {
    const gain = phase === 'startup' ? BBR_STARTUP_GAIN : phase === 'drain' ? BBR_DRAIN_GAIN : BBR_PROBE_GAINS[cycle % BBR_PROBE_GAINS.length];
    const cap = BBR_CWND_GAIN * btlbw * rtprop;
    const send = Math.min(gain * btlbw, Math.max(0, cap - queue));
    const avail = queue + send;
    const served = Math.min(avail, bdp);
    const overflow = Math.max(0, avail - served - buffer);
    queue = Math.min(buffer, avail - served);
    const delivered = served * (1 - l.loss);
    const rttMs = l.rttMs * (1 + queue / bdp);
    out.push({ round, sent: send, ssthresh: Infinity, phase, queue, rttMs, util: Math.min(1, served / bdp), event: null, overflow, saturated: false, btlbw });
    samples.push(delivered);
    if (samples.length > BBR_FILTER_ROUNDS) samples.shift();
    btlbw = Math.max(...samples);
    rtprop = Math.min(rtprop, rttMs / l.rttMs);
    if (phase === 'startup') {
      if (btlbw >= lastFull * BBR_FULL_GROWTH) {
        lastFull = btlbw;
        fullRounds = 0;
      } else fullRounds += 1;
      if (fullRounds >= BBR_FULL_ROUNDS) phase = 'drain';
    } else if (phase === 'drain') {
      if (queue <= BBR_DRAINED_QUEUE) {
        phase = 'probe-bw';
        cycle = 0;
      }
    } else cycle += 1;
  }
  return out;
}

/** `rounds` round trips of one algorithm on the link. Same link and seed, same trace. */
export function simulate(algo: Algo, link: LinkSetup, rounds: number): RoundRec[] {
  return algo === 'bbr' ? simulateBbr(link, rounds) : simulateWindow(algo, link, rounds);
}

export interface Summary {
  meanUtil: number;
  meanRttMs: number;
  maxQueue: number;
  lossEvents: number;
  timeouts: number;
}

export function summarise(recs: readonly RoundRec[]): Summary {
  const n = Math.max(1, recs.length);
  return {
    meanUtil: recs.reduce((s, r) => s + r.util, 0) / n,
    meanRttMs: recs.reduce((s, r) => s + r.rttMs, 0) / n,
    maxQueue: Math.max(0, ...recs.map((r) => r.queue)),
    lossEvents: recs.filter((r) => r.event !== null).length,
    timeouts: recs.filter((r) => r.event === 'timeout').length,
  };
}

/** Reno's mean window under random loss alone, over `rounds` round trips and without allocating a record per round. */
export function renoMeanWindow(p: number, rounds: number, seed: number, limit = Infinity): number {
  const rnd = mulberry32(seed);
  let cwnd = INITIAL_WINDOW;
  let ssthresh = Infinity;
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    const sent = Math.min(cwnd, CWND_CAP);
    total += Math.min(sent, limit);
    const lost = sent > limit || randomLoss(rnd, p, sent);
    ({ cwnd, ssthresh } = renoNext(cwnd, ssthresh, sent, lost ? 'loss' : null));
  }
  return total / rounds;
}

/** The Mathis relation: mean window of about 1.22 / sqrt(p) segments (Mathis et al., 1997, from memory: verify). */
export const MATHIS_C = 1.22;
export const mathisWindow = (p: number): number => MATHIS_C / Math.sqrt(p);
/** The same relation derived from the AIMD sawtooth: a cycle carries 3W^2/8 segments, so the mean window is sqrt(3 / (2p)). */
export const sawtoothWindow = (p: number): number => Math.sqrt(3 / (2 * p));
