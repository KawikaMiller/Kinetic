/**
 * An anti-replay sliding window (the receiver of an ESP or WireGuard-style tunnel): it remembers the highest
 * sequence number accepted and which of the last WINDOW numbers below it have arrived. Pure.
 *
 *   n = 0                      refused (numbers start at 1)
 *   n above the highest        accepted; the window slides up so n is its top
 *   n at or below top - WINDOW refused: too old to check
 *   n inside the window        accepted if its bit is clear, refused as a replay if set
 * The window size 64 is a lesson constant (implementations choose their own; from memory, verify against the ESP
 * specification, which names a minimum of 32 and suggests 64).
 */
export const WINDOW = 64;
export const MAX_NUMBER = 1_000_000;

export interface ReplayWindow {
  /** The highest sequence number accepted so far, 0 before the first. */
  top: number;
  /** bits[i] is 1 when the number `top - i` has been accepted; i runs 0 (the top) to WINDOW - 1. */
  bits: readonly (0 | 1)[];
}

export const emptyWindow = (): ReplayWindow => ({ top: 0, bits: Array.from({ length: WINDOW }, () => 0) });

export type Verdict =
  | { kind: 'accepted'; slid: number }
  | { kind: 'replay' }
  | { kind: 'too-old'; floor: number }
  | { kind: 'zero' };

export function receive(w: ReplayWindow, n: number): { window: ReplayWindow; verdict: Verdict } {
  if (n === 0) return { window: w, verdict: { kind: 'zero' } };
  if (n > w.top) {
    const slid = n - w.top;
    const bits: (0 | 1)[] = Array.from({ length: WINDOW }, (_, i) => (i >= slid ? w.bits[i - slid] : 0));
    bits[0] = 1;
    return { window: { top: n, bits }, verdict: { kind: 'accepted', slid } };
  }
  const floor = w.top - WINDOW;
  if (n <= floor) return { window: w, verdict: { kind: 'too-old', floor } };
  const i = w.top - n;
  if (w.bits[i] === 1) return { window: w, verdict: { kind: 'replay' } };
  const bits = w.bits.slice();
  bits[i] = 1;
  return { window: { top: w.top, bits }, verdict: { kind: 'accepted', slid: 0 } };
}

/** The window as the strip draws it: oldest number first, so the highest sits at the right. */
export const stripBits = (w: ReplayWindow): (0 | 1)[] => [...w.bits].reverse();
/** The number each strip position stands for (or null before the first numbers exist). */
export const numberAt = (w: ReplayWindow, position: number): number | null => {
  const n = w.top - (WINDOW - 1 - position);
  return n >= 1 ? n : null;
};
