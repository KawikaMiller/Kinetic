/**
 * Scene 3: a NIC-style descriptor ring of 8 slots. The driver posts empty buffers, the device DMAs a packet into
 * the next device-owned descriptor, sets it filled and, subject to interrupt coalescing, raises an interrupt;
 * the driver then handles exactly the packets that interrupt announced, one every `driverTicks`, and re-posts
 * the descriptor. One tick of the seeded sim is one step of that whole story. Pure; a toy, not a real NIC.
 */
import { createTickSim, type TickSim } from '../../core/simTick';
import type { Rnd } from '../../core/random';

export const RING_SIZE = 8;
/** How many ticks the scene plays before it stops. */
export const RING_TICKS = 200;
/** The time-threshold slider's last step means "no time limit". */
export const TIME_LIMIT_OFF = 68;

export type Phase = 'free' | 'owned' | 'filled' | 'processing' | 'processed';

export interface Desc {
  phase: Phase;
  /** Sequence number of the packet held (-1 when there is none). */
  seq: number;
  arrivedAt: number;
}

export interface RingConfig {
  seed: number;
  /** Chance per tick that a packet arrives, in percent. */
  ratePct: number;
  /** Raise one interrupt per this many packets. */
  coalesceN: number;
  /** ...or when the oldest unannounced packet has waited this many ticks (TIME_LIMIT_OFF: never). */
  timeLimit: number;
  /** Ticks the driver spends on one packet. */
  driverTicks: number;
  /** The broken driver: it re-posts a full ring's descriptor before the packet in it was consumed. */
  broken: boolean;
}

export interface RingState {
  tick: number;
  ring: Desc[];
  /** The device's next descriptor and the driver's next packet to handle: always in [0, RING_SIZE). */
  head: number;
  tail: number;
  produced: number;
  consumed: number;
  dropped: number;
  /** Packets destroyed because their descriptor was re-posted before they were consumed. */
  overwritten: number;
  /** The packet number lost in the latest overwrite, or -1. */
  lastOverwritten: number;
  irqs: number;
  /** Packets the interrupts have announced so far. */
  signalled: number;
  /** Packets in the ring that no interrupt has announced yet. */
  pending: number;
  pendingSince: number;
  /** Announced packets the driver has not started on yet. */
  budget: number;
  busy: { idx: number; left: number } | null;
  worstLatency: number;
  lastConsumedSeq: number;
  /** What happened this tick, in order, for the log. */
  events: string[];
}

export const DEFAULT_CONFIG: RingConfig = { seed: 3, ratePct: 30, coalesceN: 1, timeLimit: TIME_LIMIT_OFF, driverTicks: 2, broken: false };

const initial = (): RingState => ({
  tick: 0,
  ring: Array.from({ length: RING_SIZE }, () => ({ phase: 'free' as Phase, seq: -1, arrivedAt: 0 })),
  head: 0, tail: 0, produced: 0, consumed: 0, dropped: 0, overwritten: 0, lastOverwritten: -1, irqs: 0, signalled: 0, pending: 0, pendingSince: 0, budget: 0,
  busy: null, worstLatency: 0, lastConsumedSeq: -1, events: [],
});

const unconsumed = (d: Desc) => d.phase === 'filled' || d.phase === 'processing';

function step(prev: RingState, rnd: Rnd, tick: number, c: RingConfig): RingState {
  const s: RingState = { ...prev, tick, ring: prev.ring.map((d) => ({ ...d })), events: [] };

  // 1. The driver: post every free or processed descriptor, then work on the next announced packet.
  let posted = 0;
  for (const d of s.ring) {
    if (d.phase === 'free' || d.phase === 'processed') {
      d.phase = 'owned';
      d.seq = -1;
      posted++;
    }
  }
  if (posted > 0) s.events.push(`driver posts ${posted} empty ${posted === 1 ? 'buffer' : 'buffers'}`);
  if (s.busy === null && s.budget > 0) {
    const d = s.ring[s.tail];
    d.phase = 'processing';
    s.busy = { idx: s.tail, left: c.driverTicks };
    s.budget--;
    s.worstLatency = Math.max(s.worstLatency, tick - d.arrivedAt);
    s.events.push(`driver sees packet ${d.seq}, ${tick - d.arrivedAt} ticks after it arrived`);
    s.tail = (s.tail + 1) % RING_SIZE;
  }
  if (s.busy !== null) {
    s.busy = { ...s.busy, left: s.busy.left - 1 };
    if (s.busy.left === 0) {
      const d = s.ring[s.busy.idx];
      s.lastConsumedSeq = d.seq;
      d.phase = 'processed';
      s.consumed++;
      s.events.push(`driver finishes packet ${d.seq}`);
      s.busy = null;
    }
  }

  // 2. The wire: a packet may arrive, and the device DMAs it into the head descriptor if the device owns it.
  if (rnd() < c.ratePct / 100) {
    const head = s.ring[s.head];
    if (head.phase === 'owned') {
      head.phase = 'filled';
      head.seq = s.produced++;
      head.arrivedAt = tick;
      s.head = (s.head + 1) % RING_SIZE;
      if (s.pending === 0) s.pendingSince = tick;
      s.pending++;
      s.events.push(`packet ${head.seq} DMAs into descriptor ${s.head === 0 ? RING_SIZE - 1 : s.head - 1}`);
    } else if (c.broken && unconsumed(head)) {
      s.overwritten++;
      s.lastOverwritten = head.seq;
      head.phase = 'filled';
      s.events.push(`packet ${head.seq} is overwritten by packet ${s.produced} before the driver consumed it`);
      head.seq = s.produced++;
      head.arrivedAt = tick;
      s.head = (s.head + 1) % RING_SIZE;
      if (s.pending === 0) s.pendingSince = tick;
      s.pending++;
    } else {
      s.dropped++;
      s.events.push('the ring is full: the packet is dropped and counted');
    }
  }

  // 3. Interrupt coalescing: one interrupt per N packets, or when the oldest unannounced packet has waited long enough.
  const limit = c.timeLimit >= TIME_LIMIT_OFF ? Infinity : c.timeLimit;
  if (s.pending > 0 && (s.pending >= c.coalesceN || tick - s.pendingSince >= limit)) {
    s.irqs++;
    s.signalled += s.pending;
    s.budget += s.pending;
    s.events.push(`interrupt ${s.irqs} announces ${s.pending} ${s.pending === 1 ? 'packet' : 'packets'}`);
    s.pending = 0;
  }
  return s;
}

/** The safety property of a descriptor ring; null while it holds. */
export function checkRing(s: RingState): string | null {
  if (s.head < 0 || s.head >= RING_SIZE || s.tail < 0 || s.tail >= RING_SIZE) return `an index left the ring (head ${s.head}, tail ${s.tail})`;
  if (s.overwritten > 0) return `packet ${s.lastOverwritten} was overwritten before the driver consumed it`;
  if (s.produced - s.consumed > RING_SIZE) return `${s.produced - s.consumed} packets are outstanding in a ring of ${RING_SIZE}`;
  const held = s.ring.filter((d) => d.phase !== 'free' && d.phase !== 'owned' && d.phase !== 'processed');
  if (new Set(held.map((d) => d.seq)).size !== held.length) return 'two descriptors hold the same packet';
  if (s.ring.some((d) => (d.phase === 'owned' || d.phase === 'free') && d.seq !== -1)) return 'a device-owned descriptor still holds a packet';
  return null;
}

export const createRing = (c: RingConfig): TickSim<RingState> =>
  createTickSim<RingState>({ seed: c.seed, init: initial, step: (s, rnd, tick) => step(s, rnd, tick, c), check: checkRing });

/** A finished run of the scene's length (stops early on a violation). */
export function runRing(c: RingConfig): TickSim<RingState> {
  const sim = createRing(c);
  sim.run(RING_TICKS);
  return sim;
}

/** The pinned lowest seed on which the broken driver overwrites an unconsumed packet in BROKEN_CONFIG (ring.test.ts proves it is the lowest of 0..199). */
export const BROKEN_SEED = 8;
/** A driver that barely keeps up, so the ring does fill; with the healthy settings the broken driver never gets the chance. */
export const BROKEN_CONFIG: RingConfig = { seed: BROKEN_SEED, ratePct: 30, coalesceN: 1, timeLimit: TIME_LIMIT_OFF, driverTicks: 3, broken: true };

/** Packets per interrupt, or null before the first interrupt. */
export const packetsPerInterrupt = (s: RingState) => (s.irqs === 0 ? null : s.signalled / s.irqs);
