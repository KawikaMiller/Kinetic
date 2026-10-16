import { useState } from 'react';
import type { DragSource } from '../../core/plot';
import type { Interval } from './intervals';
import { MAX_INTERVALS, TIME_MAX, formatIntervals, parseIntervals, dragInterval } from './presets';

export interface IntervalsState {
  intervals: Interval[];
  text: string;
  /** The refusal for the typed list (the drawn intervals stay), or a note from add/remove, else null. */
  note: string | null;
  swapOffer: Interval[] | null;
  type: (t: string) => void;
  load: (list: readonly Interval[]) => void;
  /** A handle was dragged: index of the interval and which end. Zero-length and backwards drags are held at half a unit. */
  drag: (index: number, end: 'start' | 'end', time: number, via?: DragSource) => void;
  add: () => void;
  removeLast: () => void;
  acceptSwap: () => void;
}

/** The learner's intervals: a typed list and draggable handles over one list, with every refusal sentenced. */
export function useIntervals(initial: readonly Interval[]): IntervalsState {
  const [intervals, setIntervals] = useState<Interval[]>([...initial]);
  const [text, setText] = useState(formatIntervals(initial));
  const [note, setNote] = useState<string | null>(null);
  const [swapOffer, setSwapOffer] = useState<Interval[] | null>(null);

  const commit = (list: Interval[]) => {
    setIntervals(list);
    setText(formatIntervals(list));
    setNote(null);
    setSwapOffer(null);
  };
  return {
    intervals,
    text,
    note,
    swapOffer,
    type: (t) => {
      setText(t);
      const parsed = parseIntervals(t);
      if (parsed.ok) {
        setIntervals(parsed.intervals);
        setNote(null);
        setSwapOffer(null);
      } else {
        setNote(parsed.error);
        setSwapOffer(parsed.swapOffer ?? null);
      }
    },
    load: (list) => commit([...list]),
    drag: (index, end, time, via) => {
      commit(intervals.map((x, i) => (i === index ? dragInterval(x, end, time, via) : x)));
    },
    add: () => {
      if (intervals.length >= MAX_INTERVALS) {
        setNote(`The timeline keeps up to ${MAX_INTERVALS} intervals; remove one first.`);
        return;
      }
      commit([...intervals, { start: 12, end: Math.min(TIME_MAX, 13) }]);
    },
    removeLast: () => {
      if (intervals.length <= 1) {
        setNote('Keep at least one interval.');
        return;
      }
      commit(intervals.slice(0, -1));
    },
    acceptSwap: () => {
      if (swapOffer) commit(swapOffer);
    },
  };
}
