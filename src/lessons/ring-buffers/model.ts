// Pure ring buffer behind the ring-buffers lesson: a fixed array of n slots with a head
// (read) and a tail (write), under three ways of telling full from empty and three
// policies for what an enqueue into a full buffer does.

/**
 * - sentinel: head and tail are indexes; one slot always stays empty, so head == tail
 *   means empty and (tail + 1) % n == head means full. Capacity n − 1.
 * - count: head index plus a separate count; tail = (head + count) % n. Capacity n.
 * - masked: head and tail are ever-increasing unsigned 32-bit counters; the slot is
 *   counter & (n − 1), the size is (tail − head) >>> 0. Needs n to be a power of two.
 */
export type Strategy = 'sentinel' | 'count' | 'masked';
/** block: refuse (the producer would wait); drop: discard the new item; overwrite: replace the oldest. */
export type Policy = 'block' | 'drop' | 'overwrite';

export const MIN_SLOTS = 4;
export const MAX_SLOTS = 16;
const U32 = 2 ** 32;

export interface Ring {
  strategy: Strategy;
  n: number;
  slots: (number | null)[];
  /** sentinel/count: an index 0..n−1. masked: a uint32 counter. */
  head: number;
  tail: number;
  /** Only the count strategy keeps it. */
  count: number;
  /** Total moves of each pointer, never wrapped: for drawing the ring's turns. */
  headMoves: number;
  tailMoves: number;
}

export const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** Why this size can't be used with this strategy, or null when it can. */
export function refusal(strategy: Strategy, n: number): string | null {
  if (!Number.isInteger(n) || n < MIN_SLOTS || n > MAX_SLOTS) return `Pick ${MIN_SLOTS} to ${MAX_SLOTS} slots.`;
  if (strategy === 'masked' && !isPowerOfTwo(n))
    return `Masking needs N to be a power of two, so that N − 1 is all ones in binary. ${n} − 1 = ${(n - 1).toString(2)} in binary isn't; try ${2 ** Math.floor(Math.log2(n))} or ${2 ** Math.ceil(Math.log2(n))}.`;
  return null;
}

/** An empty ring. `start` sets both counters of the masked strategy (to show them wrap past 2³²). */
export function createRing(strategy: Strategy, n: number, start = 0): Ring {
  const why = refusal(strategy, n);
  if (why) throw new RangeError(why);
  const s = strategy === 'masked' ? start >>> 0 : 0;
  return { strategy, n, slots: Array<number | null>(n).fill(null), head: s, tail: s, count: 0, headMoves: 0, tailMoves: 0 };
}

export const capacity = (r: Pick<Ring, 'strategy' | 'n'>) => (r.strategy === 'sentinel' ? r.n - 1 : r.n);

/** Slot a pointer value refers to. */
export const slotOf = (r: Ring, pointer: number) => (r.strategy === 'masked' ? pointer & (r.n - 1) : pointer);
export const headSlot = (r: Ring) => slotOf(r, r.head);
export const tailSlot = (r: Ring) => (r.strategy === 'count' ? (r.head + r.count) % r.n : slotOf(r, r.tail));

export function size(r: Ring): number {
  if (r.strategy === 'count') return r.count;
  if (r.strategy === 'masked') return (r.tail - r.head) >>> 0;
  return (r.tail - r.head + r.n) % r.n;
}

export function isEmpty(r: Ring): boolean {
  if (r.strategy === 'count') return r.count === 0;
  // sentinel: equal indexes; masked: equal counters. Same test, different meaning of the numbers.
  return r.head === r.tail;
}

export function isFull(r: Ring): boolean {
  if (r.strategy === 'count') return r.count === r.n;
  if (r.strategy === 'masked') return ((r.tail - r.head) >>> 0) === r.n;
  return (r.tail + 1) % r.n === r.head;
}

const bump = (r: Ring, p: number) => (r.strategy === 'masked' ? (p + 1) >>> 0 : (p + 1) % r.n);

export type Event =
  | { kind: 'enqueued'; value: number; slot: number }
  | { kind: 'blocked'; value: number }
  | { kind: 'dropped'; value: number }
  | { kind: 'overwrote'; value: number; slot: number; lost: number }
  | { kind: 'dequeued'; value: number; slot: number }
  | { kind: 'empty' };

const copy = (r: Ring): Ring => ({ ...r, slots: [...r.slots] });

function advanceHead(r: Ring) {
  r.head = bump(r, r.head);
  if (r.strategy === 'count') r.count--;
  r.headMoves++;
}

export function enqueue(r0: Ring, value: number, policy: Policy): { ring: Ring; event: Event } {
  if (isFull(r0)) {
    if (policy === 'block') return { ring: r0, event: { kind: 'blocked', value } };
    if (policy === 'drop') return { ring: r0, event: { kind: 'dropped', value } };
    // Overwrite: the oldest item goes, then the write proceeds as normal.
    const r = copy(r0);
    const lost = r.slots[headSlot(r)]!;
    r.slots[headSlot(r)] = null;
    advanceHead(r);
    const slot = tailSlot(r);
    write(r, value);
    return { ring: r, event: { kind: 'overwrote', value, slot, lost } };
  }
  const r = copy(r0);
  const slot = tailSlot(r);
  write(r, value);
  return { ring: r, event: { kind: 'enqueued', value, slot } };
}

function write(r: Ring, value: number) {
  r.slots[tailSlot(r)] = value;
  if (r.strategy === 'count') r.count++;
  else r.tail = bump(r, r.tail);
  r.tailMoves++;
}

export function dequeue(r0: Ring): { ring: Ring; event: Event } {
  if (isEmpty(r0)) return { ring: r0, event: { kind: 'empty' } };
  const r = copy(r0);
  const slot = headSlot(r);
  const value = r.slots[slot]!;
  r.slots[slot] = null;
  advanceHead(r);
  return { ring: r, event: { kind: 'dequeued', value, slot } };
}

/** The slot strategy 1 always keeps free: the one just behind head. */
export const reservedSlot = (r: Ring) => (r.strategy === 'sentinel' ? (r.head - 1 + r.n) % r.n : null);

/** How the current strategy decides, with today's numbers plugged in. */
export function decision(r: Ring): { empty: string; full: string; size: string } {
  const n = r.n;
  if (r.strategy === 'count') return { empty: `count == 0  →  ${r.count} == 0`, full: `count == N  →  ${r.count} == ${n}`, size: `count = ${r.count}` };
  if (r.strategy === 'masked')
    return {
      empty: `tail == head  →  ${r.tail} == ${r.head}`,
      full: `tail − head == N  →  ${(r.tail - r.head) >>> 0} == ${n}`,
      size: `(tail − head) >>> 0 = ${size(r)}; slots tail & ${n - 1} = ${tailSlot(r)}, head & ${n - 1} = ${headSlot(r)}`,
    };
  return {
    empty: `head == tail  →  ${r.head} == ${r.tail}`,
    full: `(tail + 1) % N == head  →  ${(r.tail + 1) % n} == ${r.head}`,
    size: `(tail − head + N) % N = ${size(r)}`,
  };
}

/** Counters start this close below 2³² for the wrap demo. */
export const NEAR_WRAP = U32 - 3;
