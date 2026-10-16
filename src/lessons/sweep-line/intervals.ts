/** A half-open interval [start, end): an interval ending at 10 and one starting at 10 do not overlap. */
export interface Interval {
  start: number;
  end: number;
}

export type TieRule = 'end-first' | 'start-first';

/** Sort by start, then end (stable and total, so identical intervals stay together). */
const byStart = (a: Interval, b: Interval) => a.start - b.start || a.end - b.end;

export interface MergeStep {
  /** Index into the sorted list. */
  index: number;
  interval: Interval;
  /** What the sweep did with it. */
  action: 'open' | 'extend' | 'close-and-open';
  /** Merged output after this step, with the last entry still open. */
  merged: Interval[];
}

export interface MergeResult {
  merged: Interval[];
  sorted: Interval[];
  /** Original index of each sorted interval. */
  order: number[];
  steps: MergeStep[];
}

/**
 * Merge intervals into their union. Touching intervals join ([1,3) and [3,5) become [1,5)) because that is exactly their union;
 * the rooms problem below uses the opposite reading, where touching intervals do not overlap.
 */
export function mergeIntervals(input: readonly Interval[]): MergeResult {
  const order = input.map((_, i) => i).sort((a, b) => byStart(input[a], input[b]) || a - b);
  const sorted = order.map((i) => input[i]);
  const merged: Interval[] = [];
  const steps: MergeStep[] = [];
  sorted.forEach((iv, index) => {
    const last = merged[merged.length - 1];
    let action: MergeStep['action'] = 'open';
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
      action = 'extend';
    } else {
      merged.push({ ...iv });
      action = last ? 'close-and-open' : 'open';
    }
    steps.push({ index, interval: iv, action, merged: merged.map((m) => ({ ...m })) });
  });
  return { merged, sorted, order, steps };
}

export interface SweepEvent {
  time: number;
  kind: 'start' | 'end';
  /** Index in the input list. */
  id: number;
  /** The counter after this event. */
  active: number;
  /** The number of intervals that really contain `time` (half-open), for the overcount mark. */
  truth: number;
  /** The counter is above what the intervals at this moment really give: the tie rule's bug. */
  over: boolean;
}

export interface OverlapResult {
  events: SweepEvent[];
  max: number;
}

/** Two events at one time: with `end-first` the ends go first (right for half-open intervals), with `start-first` the starts do (the classic bug). */
export function sweepOverlap(input: readonly Interval[], tie: TieRule): OverlapResult {
  const raw = input.flatMap((iv, id) => [
    { time: iv.start, kind: 'start' as const, id },
    { time: iv.end, kind: 'end' as const, id },
  ]);
  const rank = (k: 'start' | 'end') => (tie === 'end-first' ? (k === 'end' ? 0 : 1) : k === 'start' ? 0 : 1);
  raw.sort((a, b) => a.time - b.time || rank(a.kind) - rank(b.kind) || a.id - b.id);
  let active = 0;
  let max = 0;
  const events = raw.map((e) => {
    active += e.kind === 'start' ? 1 : -1;
    max = Math.max(max, active);
    const truth = input.filter((iv) => iv.start <= e.time && e.time < iv.end).length;
    const over = e.kind === 'start' && active > truth;
    return { ...e, time: e.time, active, truth, over };
  });
  return { events, max };
}

export interface RoomAssignment {
  /** Room index (0-based) of each interval, by input position. */
  room: number[];
  rooms: number;
}

/** Rooms by the greedy of the greedy-algorithms lesson: sort by start, give each meeting the room that frees up first, else open a new one. */
export function assignRooms(input: readonly Interval[]): RoomAssignment {
  const order = input.map((_, i) => i).sort((a, b) => byStart(input[a], input[b]) || a - b);
  const room = new Array<number>(input.length).fill(-1);
  // min-heap of [roomEnd, roomIndex]
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  let rooms = 0;
  for (const id of order) {
    const iv = input[id];
    if (heap.length && heap[0][0] <= iv.start) {
      const [, r] = pop();
      room[id] = r;
    } else {
      room[id] = rooms++;
    }
    push([iv.end, room[id]]);
  }
  return { room, rooms };
}

export interface SelectionStep {
  index: number;
  interval: Interval;
  picked: boolean;
  /** End of the last picked interval before this one. */
  lastEnd: number | null;
  chosen: Interval[];
}

export interface SelectionResult {
  chosen: Interval[];
  sorted: Interval[];
  order: number[];
  steps: SelectionStep[];
}

/** Activity selection: sweep by END, take an interval whenever it starts at or after the last chosen end. */
export function selectActivities(input: readonly Interval[]): SelectionResult {
  const order = input.map((_, i) => i).sort((a, b) => input[a].end - input[b].end || input[a].start - input[b].start || a - b);
  const sorted = order.map((i) => input[i]);
  const chosen: Interval[] = [];
  const steps: SelectionStep[] = sorted.map((interval, index) => {
    const lastEnd = chosen.length ? chosen[chosen.length - 1].end : null;
    const picked = lastEnd === null || interval.start >= lastEnd;
    if (picked) chosen.push(interval);
    return { index, interval, picked, lastEnd, chosen: [...chosen] };
  });
  return { chosen, sorted, order, steps };
}
