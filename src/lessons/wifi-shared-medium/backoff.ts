/**
 * Scene 1: one station's attempt to send, slot by slot. It senses a busy medium, waits for it to be idle for DIFS, draws a random
 * backoff and counts it down only through idle slots, sends, and waits for an ACK. A scripted second station takes the medium again
 * after A has counted down two slots, so the counter visibly freezes. Radios cannot listen while they send, so a lost frame is
 * inferred from a missing ACK and the contention window doubles. Slot counts here are illustrative, not real timings.
 */
import { mulberry32 } from '../../core/random';
import { CW_MIN, drawCounter, nextCw } from './dcf';

/** How long the other station holds the medium when A arrives, and later when it interrupts, in slots. */
export const FIRST_BUSY_SLOTS = 4;
export const INTERRUPT_SLOTS = 3;
/** The idle gap A needs before it counts (DIFS), A's frame, and the wait for the ACK, in slots. Illustrative. */
export const DIFS_SLOTS = 2;
export const FRAME_SLOTS_A = 4;
export const ACK_SLOTS = 2;
/** A has counted down this many slots when the other station starts to send again (if it still has more to count). */
export const INTERRUPT_AFTER_COUNTS = 2;
/** A gives up the story after this many attempts (the second always gets its ACK). */
export const MAX_ATTEMPTS = 2;

export type Medium = 'busy-other' | 'difs' | 'idle' | 'a-sends' | 'ack' | 'ack-missing';

export interface BackoffSlot {
  /** Slot number, from 0. */
  t: number;
  medium: Medium;
  /** A's backoff counter at the END of this slot (the value a reader sees after the slot), or null before it is drawn. */
  counter: number | null;
  cw: number;
  attempt: number;
  /** Set on the slot in which a counter is drawn. */
  drew?: number;
}

export interface BackoffStory {
  slots: BackoffSlot[];
  /** The counters drawn, one per attempt. */
  draws: number[];
  /** The ACK came back on the last attempt. */
  acked: boolean;
}

/** The whole story for a seed; `ackLost` makes the first attempt's ACK go missing, so A doubles its window and tries again. */
export function backoffStory(seed: number, ackLost: boolean): BackoffStory {
  const rnd = mulberry32(seed);
  const slots: BackoffSlot[] = [];
  const draws: number[] = [];
  let cw = CW_MIN;
  let counter: number | null = null;
  const push = (medium: Medium, attempt: number, drew?: number) => slots.push({ t: slots.length, medium, counter, cw, attempt, drew });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt === 1) {
      counter = drawCounter(rnd, cw);
      draws.push(counter);
      for (let i = 0; i < FIRST_BUSY_SLOTS; i++) push('busy-other', attempt, i === 0 ? counter : undefined);
    } else {
      counter = drawCounter(rnd, cw);
      draws.push(counter);
    }
    for (let i = 0; i < DIFS_SLOTS; i++) push('difs', attempt, attempt > 1 && i === 0 ? counter : undefined);
    let counted = 0;
    let interrupted = false;
    while ((counter as number) > 0) {
      if (attempt === 1 && !interrupted && counted === INTERRUPT_AFTER_COUNTS) {
        interrupted = true;
        for (let i = 0; i < INTERRUPT_SLOTS; i++) push('busy-other', attempt);
        for (let i = 0; i < DIFS_SLOTS; i++) push('difs', attempt);
        continue;
      }
      counter = (counter as number) - 1;
      counted++;
      push('idle', attempt);
    }
    for (let i = 0; i < FRAME_SLOTS_A; i++) push('a-sends', attempt);
    const lost = ackLost && attempt === 1;
    for (let i = 0; i < ACK_SLOTS; i++) push(lost ? 'ack-missing' : 'ack', attempt);
    if (!lost) return { slots, draws, acked: true };
    cw = nextCw(cw);
  }
  return { slots, draws, acked: false };
}
