/**
 * The 802.11 distributed coordination function (DCF) on virtual slots, saturated stations. Each virtual slot is one of
 * three things: idle (nobody sends), a success (one station sends) or a collision (two or more send). A station with a
 * backoff counter of 0 sends. When the slot is idle every station counts down; when it is busy the stations that did not
 * send count down once (the idle slot that ends the busy period) and the senders draw a new counter: after a success from
 * CW_MIN, after a collision from min(2 * (CW + 1) - 1, CW_MAX). This is the discretisation of Bianchi's analysis
 * (2000), whose fixed point the test compares with. Frame, SIFS, DIFS, preamble and ACK times are not modelled: a busy
 * slot simply lasts FRAME_SLOTS idle slots.
 */
import type { Rnd } from '../../core/random';

/** The OFDM DCF defaults, from memory: verify against IEEE 802.11 (EDCA access categories use other values). */
export const CW_MIN = 15;
export const CW_MAX = 1023;
/** How long a busy slot (a success or a collision) lasts, in idle slots. Illustrative: it depends on frame size and rate. */
export const FRAME_SLOTS = 20;
export const STATIONS_RANGE = { min: 2, max: 12 } as const;
export const DEFAULT_STATIONS = 5;
export const DEFAULT_SEED = 3;
export const DCF_TICKS = 160;

export type SlotKind = 'idle' | 'success' | 'collision';

export interface Station {
  /** Idle slots left before this station sends; 0 means it sends in the next virtual slot. */
  counter: number;
  cw: number;
  successes: number;
  collisions: number;
  attempts: number;
}

export interface DcfState {
  stations: Station[];
  kind: SlotKind | null;
  /** The stations that sent in the last virtual slot. */
  senders: number[];
  slots: number;
  idle: number;
  success: number;
  collision: number;
  /** Time so far in idle-slot units: 1 per idle slot, FRAME_SLOTS per busy slot. */
  time: number;
}

/** The next doubled contention window: CW = min(2 * (CW + 1) - 1, CW_MAX), so 15, 31, 63, ..., 1023, 1023. */
export const nextCw = (cw: number): number => Math.min(2 * (cw + 1) - 1, CW_MAX);

/** A backoff counter drawn uniformly from 0 to `cw`, inclusive. */
export const drawCounter = (rnd: Rnd, cw: number): number => Math.floor(rnd() * (cw + 1));

export function initDcf(n: number, rnd: Rnd): DcfState {
  const stations: Station[] = Array.from({ length: n }, () => ({ counter: drawCounter(rnd, CW_MIN), cw: CW_MIN, successes: 0, collisions: 0, attempts: 0 }));
  return { stations, kind: null, senders: [], slots: 0, idle: 0, success: 0, collision: 0, time: 0 };
}

/** One virtual slot. Pure: returns the next state. */
export function stepDcf(s: DcfState, rnd: Rnd): DcfState {
  const senders = s.stations.flatMap((st, i) => (st.counter === 0 ? [i] : []));
  const kind: SlotKind = senders.length === 0 ? 'idle' : senders.length === 1 ? 'success' : 'collision';
  const stations = s.stations.map((st, i): Station => {
    if (!senders.includes(i)) return { ...st, counter: st.counter - 1 };
    const cw = kind === 'success' ? CW_MIN : nextCw(st.cw);
    return {
      counter: drawCounter(rnd, cw),
      cw,
      successes: st.successes + (kind === 'success' ? 1 : 0),
      collisions: st.collisions + (kind === 'collision' ? 1 : 0),
      attempts: st.attempts + 1,
    };
  });
  return {
    stations,
    kind,
    senders,
    slots: s.slots + 1,
    idle: s.idle + (kind === 'idle' ? 1 : 0),
    success: s.success + (kind === 'success' ? 1 : 0),
    collision: s.collision + (kind === 'collision' ? 1 : 0),
    time: s.time + (kind === 'idle' ? 1 : FRAME_SLOTS),
  };
}

/** Share of attempts that collided, or null before any attempt. */
export function collisionShare(s: DcfState): number | null {
  const attempts = s.stations.reduce((n, st) => n + st.attempts, 0);
  const collided = s.stations.reduce((n, st) => n + st.collisions, 0);
  return attempts === 0 ? null : collided / attempts;
}

/** Share of the airtime that carried a successful frame, or null before any time has passed. */
export function airtimeShare(s: DcfState): number | null {
  return s.time === 0 ? null : (s.success * FRAME_SLOTS) / s.time;
}

export const meanCw = (s: DcfState): number => s.stations.reduce((n, st) => n + st.cw, 0) / s.stations.length;

/** Bianchi's W and m: W = CW_MIN + 1 = 16 and CW_MAX + 1 = 2^m * W, so m = 6. */
const BIANCHI_W = CW_MIN + 1;
const BIANCHI_M = Math.round(Math.log2((CW_MAX + 1) / BIANCHI_W));

/** The per-station chance of sending in a virtual slot, tau, and the chance p that a sender collides, at the fixed point of Bianchi (2000). */
export function bianchiFixedPoint(n: number): { tau: number; p: number } {
  let tau = 0.1;
  for (let i = 0; i < 5000; i++) {
    const p = 1 - (1 - tau) ** (n - 1);
    const next = (2 * (1 - 2 * p)) / ((1 - 2 * p) * (BIANCHI_W + 1) + p * BIANCHI_W * (1 - (2 * p) ** BIANCHI_M));
    tau = 0.5 * tau + 0.5 * next;
  }
  return { tau, p: 1 - (1 - tau) ** (n - 1) };
}

/** The long-run share of attempts that collide, from the analysis (no sampling noise). */
export const analysisCollision = (n: number): number => bianchiFixedPoint(n).p;

/** The long-run share of airtime that carries a successful frame, from the same analysis and the same FRAME_SLOTS. */
export function analysisAirtime(n: number): number {
  const { tau } = bianchiFixedPoint(n);
  const busy = 1 - (1 - tau) ** n;
  const success = n * tau * (1 - tau) ** (n - 1);
  return (success * FRAME_SLOTS) / ((1 - busy) + busy * FRAME_SLOTS);
}

export interface SlotEvent {
  tick: number;
  kind: SlotKind;
  senders: number[];
  /** Start and end in idle-slot units. */
  start: number;
  end: number;
}

/** The slots of a run as time intervals, from the states after each tick (history[0] is the state before any slot). */
export function slotEvents(history: readonly DcfState[]): SlotEvent[] {
  return history.slice(1).map((s, k) => ({ tick: k + 1, kind: s.kind as SlotKind, senders: s.senders, start: history[k].time, end: s.time }));
}

/** Run `slots` virtual slots without keeping the history (for long checks against the analysis). */
export function runDcf(n: number, slots: number, rnd: Rnd): DcfState {
  let s = initDcf(n, rnd);
  for (let i = 0; i < slots; i++) s = stepDcf(s, rnd);
  return s;
}
