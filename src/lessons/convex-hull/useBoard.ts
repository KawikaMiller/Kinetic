import { useState } from 'react';
import { BOARD, OPENING_POINTS, addPoint, parseTypedPoint } from './board';
import type { P } from './hull';

export interface BoardState {
  points: P[];
  note: string | null;
  cursor: readonly [number, number];
  setCursor: (p: readonly [number, number]) => void;
  add: (p: readonly [number, number]) => void;
  addAtCursor: () => void;
  addTyped: (xText: string, yText: string) => void;
  load: (points: P[]) => void;
  clear: () => void;
}

/** The learner's points on the integer board: clicks and the keyboard cursor add, duplicates merge, the cap refuses. */
export function useBoard(initial: P[] = OPENING_POINTS): BoardState {
  const [points, setPoints] = useState<P[]>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [cursor, setCursor] = useState<readonly [number, number]>([BOARD / 2, BOARD / 2]);
  const add = (p: readonly [number, number]) => {
    const r = addPoint(points, { x: p[0], y: p[1] });
    setPoints(r.points);
    setNote(r.message);
  };
  const addTyped = (xText: string, yText: string) => {
    const parsed = parseTypedPoint(xText, yText);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    add([parsed.point.x, parsed.point.y]);
  };
  return {
    points,
    note,
    addTyped,
    cursor,
    setCursor,
    add,
    addAtCursor: () => add(cursor),
    load: (next) => {
      setPoints(next);
      setNote(null);
    },
    clear: () => {
      setPoints([]);
      setNote(null);
    },
  };
}
