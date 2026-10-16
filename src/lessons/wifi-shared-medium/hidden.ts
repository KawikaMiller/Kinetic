/**
 * Scene 3: the hidden node. An access point and two stations A and C on a plane. A station hears another when it is within
 * radio range (a plain distance test, one range for everybody). Each of A and C starts one frame to the AP at a random slot
 * among the first CW_MIN + 1. Stations that hear each other defer to whoever started first and collide only when they start in the same
 * slot. Hidden stations (out of each other's range, both in the AP's) cannot defer: their frames collide at the AP when they
 * overlap in time. RTS/CTS puts a short request first; the AP's CTS is heard by both, which sets a network allocation vector
 * (NAV) and silences the other station for the whole exchange, so data frames cannot collide (RTS frames still can).
 */
import { mulberry32 } from '../../core/random';
import { CW_MIN } from './dcf';

export interface Pt {
  x: number;
  y: number;
}

export const PLANE = 100;
export const AP: Pt = { x: 50, y: 50 };
export const DEFAULT_A: Pt = { x: 15, y: 50 };
export const DEFAULT_C: Pt = { x: 85, y: 50 };
export const RANGE = { min: 10, max: 100, default: 45 } as const;
export const FRAME_RANGE = { min: 2, max: 40, default: 10 } as const;
/** An RTS and a CTS each last this many slots, in the same illustrative units as a frame. */
export const RTS_SLOTS = 2;
export const CTS_SLOTS = 2;
/** Starting offsets are 0 to CW_MIN, the first contention window. */
export const OFFSETS = CW_MIN + 1;

export interface Geometry {
  a: Pt;
  c: Pt;
  range: number;
}

export const distance = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y);
export const hears = (p: Pt, q: Pt, range: number): boolean => distance(p, q) <= range;

export interface Hearing {
  aToAp: boolean;
  cToAp: boolean;
  aToC: boolean;
}

export const hearing = (g: Geometry): Hearing => ({ aToAp: hears(g.a, AP, g.range), cToAp: hears(g.c, AP, g.range), aToC: hears(g.a, g.c, g.range) });

/** Both stations reach the AP and not each other: the hidden-node case. */
export const isHidden = (h: Hearing): boolean => h.aToAp && h.cToAp && !h.aToC;

/** Two starts at offsets sa and sc collide when they overlap at the AP: hidden stations overlap if they start fewer than `len` slots apart, others only if they start in the same slot. */
export const collides = (hidden: boolean, sa: number, sc: number, len: number): boolean => (hidden ? Math.abs(sa - sc) < len : sa === sc);

/** The chance a pair of starts collides, counted over all OFFSETS x OFFSETS equally likely pairs. */
export function collisionProbability(hidden: boolean, len: number): number {
  let n = 0;
  for (let sa = 0; sa < OFFSETS; sa++) for (let sc = 0; sc < OFFSETS; sc++) if (collides(hidden, sa, sc, len)) n++;
  return n / (OFFSETS * OFFSETS);
}

export interface Exchange {
  /** Chance that the first thing on the air from the two stations collides: the data frames, or with RTS/CTS the RTS frames. */
  pCollide: number;
  /** Chance a data frame collides: 0 with RTS/CTS. */
  pDataCollide: number;
  /** Share of the airtime that delivered payload, per attempt by both stations. */
  goodput: number;
}

/** Expected result of one attempt by both stations, with or without RTS/CTS, for frames of `len` slots. Needs both stations in the AP's range. */
export function exchange(h: Hearing, len: number, rtsCts: boolean): Exchange {
  const hidden = isHidden(h);
  if (!rtsCts) {
    const p = collisionProbability(hidden, len);
    const delivered = (1 - p) * 2 * len;
    const total = p * len + delivered;
    return { pCollide: p, pDataCollide: p, goodput: total === 0 ? 0 : delivered / total };
  }
  const r = collisionProbability(hidden, RTS_SLOTS);
  const delivered = (1 - r) * 2 * len;
  const total = r * RTS_SLOTS + (1 - r) * (2 * len + 2 * (RTS_SLOTS + CTS_SLOTS));
  return { pCollide: r, pDataCollide: 0, goodput: total === 0 ? 0 : delivered / total };
}

export interface RoundCounts {
  rounds: number;
  /** Rounds in which the data frames collided. */
  dataCollisions: number;
  /** Rounds in which the RTS frames collided (0 without RTS/CTS). */
  rtsCollisions: number;
}

/** Seeded rounds: both stations pick a start offset and the rules above decide the outcome. */
export function simulateRounds(h: Hearing, len: number, rtsCts: boolean, rounds: number, seed: number): RoundCounts {
  const rnd = mulberry32(seed);
  const hidden = isHidden(h);
  let dataCollisions = 0;
  let rtsCollisions = 0;
  for (let i = 0; i < rounds; i++) {
    const sa = Math.floor(rnd() * OFFSETS);
    const sc = Math.floor(rnd() * OFFSETS);
    if (rtsCts) {
      if (collides(hidden, sa, sc, RTS_SLOTS)) rtsCollisions++;
    } else if (collides(hidden, sa, sc, len)) dataCollisions++;
  }
  return { rounds, dataCollisions, rtsCollisions };
}

/** A station position kept on the plane and rounded to whole units. */
export const clampPoint = (p: readonly [number, number]): Pt => ({ x: Math.min(PLANE, Math.max(0, Math.round(p[0]))), y: Math.min(PLANE, Math.max(0, Math.round(p[1]))) });
export const clampRange = (r: number): number => Math.min(RANGE.max, Math.max(RANGE.min, Math.round(r)));

/** Points of the range circle around a centre, for drawing. */
export function circle(centre: Pt, r: number, steps = 72): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return [centre.x + r * Math.cos(a), centre.y + r * Math.sin(a)];
  });
}
