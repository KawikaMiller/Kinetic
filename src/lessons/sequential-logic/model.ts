import type { Bit } from '../../core/bits';

const nor = (a: Bit, b: Bit): Bit => (a | b ? 0 : 1);

// ── SR latch: two cross-coupled NOR gates ────────────────────────────────

export interface SrState {
  q: Bit;
  qBar: Bit;
}

export type SrStatus = 'set' | 'reset' | 'hold' | 'invalid' | 'unpredictable';

/** Gate updates tried before declaring the latch won't settle. */
const SR_MAX_STEPS = 8;

/**
 * Settle the latch: both NOR gates update at the same instant, over and over, until nothing
 * changes. Q = NOR(R, Q̄), Q̄ = NOR(S, Q). If it never settles (both gates flipping together,
 * which is what releasing S = R = 1 at once does to ideal gates), the result is unpredictable.
 */
export function srSettle(prev: SrState, s: Bit, r: Bit): { state: SrState; status: SrStatus } {
  let cur = prev;
  for (let step = 0; step < SR_MAX_STEPS; step++) {
    const next = { q: nor(r, cur.qBar), qBar: nor(s, cur.q) };
    if (next.q === cur.q && next.qBar === cur.qBar) return { state: cur, status: statusOf(s, r) };
    cur = next;
  }
  return { state: cur, status: 'unpredictable' };
}

/** What a settled latch is doing, from its inputs. */
function statusOf(s: Bit, r: Bit): SrStatus {
  if (s && r) return 'invalid';
  if (s) return 'set';
  if (r) return 'reset';
  return 'hold';
}

export const SR_START: SrState = { q: 0, qBar: 1 };

// ── D latch and D flip-flop over a sampled waveform ──────────────────────

/** Level-sensitive: while the clock is high the latch is transparent and Q follows D; while low it holds. */
export const latchStep = (q: Bit, clk: Bit, d: Bit): Bit => (clk ? d : q);

/** Edge-triggered: Q takes D only at the instant the clock rises (0 → 1); otherwise it holds. */
export const flipFlopStep = (q: Bit, prevClk: Bit, clk: Bit, d: Bit): Bit => (!prevClk && clk ? d : q);

/** Samples per clock period in the timing diagram: high for the first half, low for the second. */
export const CLOCK_PERIOD = 8;
export const clockAt = (t: number): Bit => ((t % CLOCK_PERIOD) < CLOCK_PERIOD / 2 ? 1 : 0);
export const isRisingEdge = (t: number) => t > 0 && clockAt(t) === 1 && clockAt(t - 1) === 0;

export interface Sample {
  t: number;
  clk: Bit;
  d: Bit;
  latch: Bit;
  ff: Bit;
}

/** The next sample, from the previous one and the D level now. Pure. */
export function nextSample(prev: Sample | null, d: Bit): Sample {
  const t = prev ? prev.t + 1 : 0;
  const clk = clockAt(t);
  const latchQ = latchStep(prev?.latch ?? 0, clk, d);
  const ffQ = prev ? flipFlopStep(prev.ff, prev.clk, clk, d) : 0;
  return { t, clk, d, latch: latchQ, ff: ffQ };
}

/** Run a whole D waveform through both circuits. */
export function simulate(d: readonly Bit[]): Sample[] {
  const out: Sample[] = [];
  for (const level of d) out.push(nextSample(out[out.length - 1] ?? null, level));
  return out;
}

/**
 * The glitch script, starting at a clock period boundary: D settles at 1 before the rising
 * edge, then dips to 0 for two samples while CLK is high and comes back before CLK falls.
 */
export const GLITCH_SCRIPT: readonly Bit[] = [
  ...Array<Bit>(CLOCK_PERIOD).fill(1),
  1, 0, 0, 1, 1, 1, 1, 1,
  ...Array<Bit>(CLOCK_PERIOD).fill(1),
];

// ── Register and counter ─────────────────────────────────────────────────

export const BITS = 4;
export const MAX = 2 ** BITS - 1;

/**
 * The +1 adder's timing, in the same illustrative ticks as the adders lesson: one tick for
 * every stage to form generate and propagate, then one per stage a carry has to ripple
 * through. Adding 1 to q, bit i settles once the carry into it has.
 */
export function sumSettleTicks(q: number): number[] {
  const at: number[] = [1];
  for (let i = 0; i < BITS - 1; i++) {
    // Propagate is q_i XOR (the addend's bit i): only bit 0 of the addend 1 is set.
    const propagates = ((q >> i) & 1) ^ (i === 0 ? 1 : 0);
    at.push(propagates ? at[i] + 1 : 1);
  }
  return at;
}

/** Ticks until every bit of q + 1 is final. */
export const settleTicks = (q: number) => Math.max(...sumSettleTicks(q));

/**
 * What the register captures at the next edge, `period` ticks after the last one. Bits that
 * have settled hold q + 1; bits still waiting for their carry still show the adder's old
 * output, which is q itself (the value it computed last time).
 */
export function capture(q: number, period: number): { captured: number; correct: number; stale: number[] } {
  const correct = (q + 1) & MAX;
  const at = sumSettleTicks(q);
  const stale = at.flatMap((tick, i) => (tick > period && ((correct ^ q) >> i) & 1 ? [i] : []));
  const captured = stale.reduce((v, i) => (v & ~(1 << i)) | (q & (1 << i)), correct);
  return { captured, correct, stale };
}

export const MIN_PERIOD = 1;
export const MAX_PERIOD = 6;
