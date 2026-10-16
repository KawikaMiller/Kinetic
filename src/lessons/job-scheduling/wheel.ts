/**
 * Scene 1: a hashed timing wheel against a sorted queue (a heap), for jobs that run after a delay.
 *
 * The wheel has WHEEL_SLOTS slots and a pointer that moves one slot per tick (TICK_S seconds). A job due at
 * tick `d = ceil(delay / tick)` waits in slot `d mod 8` with `rounds = floor((d - 1) / 8)` laps still to go:
 * the pointer reaches slot s at ticks s, s + 8, s + 16, ... and tick 0 is the moment of enqueueing, so the
 * first visit that counts is tick 8 for slot 0. At each tick the pointer's slot fires the jobs whose rounds
 * are 0 (in the order they were inserted) and takes one lap off the others.
 * Inserting is one append (O(1)); the price is the tick: jobs due inside the same tick fire in insertion
 * order, not in exact due-time order, which is what a heap would give.
 */
export const WHEEL_SLOTS = 8;
export const TICK_S = 1;
/** Delays are whole multiples of this, in seconds (so two jobs can share a tick and differ inside it). */
export const DELAY_STEP_S = 0.5;
export const DELAY_MIN_S = 0.5;
export const DELAY_MAX_S = 60;
export const MAX_JOBS = 40;

export interface WheelJob {
  id: number;
  /** Seconds after enqueueing. */
  delay: number;
}

export interface Placement extends WheelJob {
  dueTick: number;
  slot: number;
  rounds: number;
}

export const dueTickOf = (delay: number) => Math.max(1, Math.ceil(delay / TICK_S));

export function place(jobs: readonly WheelJob[]): Placement[] {
  return jobs.map((j) => {
    const dueTick = dueTickOf(j.delay);
    return { ...j, dueTick, slot: dueTick % WHEEL_SLOTS, rounds: Math.floor((dueTick - 1) / WHEEL_SLOTS) };
  });
}

export interface Firing {
  id: number;
  tick: number;
}

/**
 * Turn the wheel until every job has fired, the way a real wheel does: a pointer, slots holding lists,
 * rounds counted down. `slotsAt[t]` is what each slot held just before tick t (for drawing); `fired[t]` the ids fired at tick t.
 */
export function runWheel(jobs: readonly WheelJob[]): { firings: Firing[]; slotsAt: Placement[][][]; ticks: number } {
  const slots: Placement[][] = Array.from({ length: WHEEL_SLOTS }, () => []);
  for (const p of place(jobs)) slots[p.slot].push({ ...p });
  const snap = () => slots.map((s) => s.map((p) => ({ ...p })));
  const slotsAt: Placement[][][] = [snap()];
  const firings: Firing[] = [];
  let left = jobs.length;
  let tick = 0;
  while (left > 0) {
    tick++;
    const here = slots[tick % WHEEL_SLOTS];
    const keep: Placement[] = [];
    for (const p of here) {
      if (p.rounds === 0) {
        firings.push({ id: p.id, tick });
        left--;
      } else {
        keep.push({ ...p, rounds: p.rounds - 1 });
      }
    }
    slots[tick % WHEEL_SLOTS] = keep;
    slotsAt.push(snap());
  }
  return { firings, slotsAt, ticks: tick };
}

/** The sorted queue's order: by exact due time, ties by insertion. */
export const heapOrder = (jobs: readonly WheelJob[]): number[] =>
  jobs.map((j, i) => ({ ...j, i })).sort((a, b) => a.delay - b.delay || a.i - b.i).map((j) => j.id);

/** Pairs of jobs the wheel fires in the opposite order from the heap (both fire within one tick of each other). */
export function inversions(jobs: readonly WheelJob[]): [number, number][] {
  const wheel = runWheel(jobs).firings.map((f) => f.id);
  const heap = heapOrder(jobs);
  const out: [number, number][] = [];
  for (let a = 0; a < heap.length; a++) {
    for (let b = a + 1; b < heap.length; b++) {
      if (wheel.indexOf(heap[a]) > wheel.indexOf(heap[b])) out.push([heap[a], heap[b]]);
    }
  }
  return out;
}

/** The default queue: three jobs, two of them due inside the same tick but enqueued the wrong way round. */
export const DEFAULT_JOBS: readonly WheelJob[] = [
  { id: 1, delay: 3 },
  { id: 2, delay: 5 },
  { id: 3, delay: 4.5 },
  { id: 4, delay: 12 },
];
