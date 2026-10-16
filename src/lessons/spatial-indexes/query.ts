import { useMemo, useState } from 'react';
import { normaliseRect, type Rect } from './data';

export type QueryMode = 'nn' | 'range';
type P2 = readonly [number, number];

/** Where every scene opens: the query point and the two corners of the query rectangle. */
export const DEFAULT_QUERY = { q: [50, 50] as P2, a: [30, 40] as P2, b: [70, 60] as P2 };

export interface QueryState {
  mode: QueryMode;
  setMode: (m: QueryMode) => void;
  q: P2;
  setQ: (p: P2) => void;
  a: P2;
  setA: (p: P2) => void;
  b: P2;
  setB: (p: P2) => void;
  /** The rectangle with its corners put in order, however they were dragged. */
  rect: Rect;
}

/** The learner's query: a draggable point for nearest-neighbour, two draggable corners for a rectangle. */
export function useQuery(initialMode: QueryMode = 'nn'): QueryState {
  const [mode, setMode] = useState<QueryMode>(initialMode);
  const [q, setQ] = useState<P2>(DEFAULT_QUERY.q);
  const [a, setA] = useState<P2>(DEFAULT_QUERY.a);
  const [b, setB] = useState<P2>(DEFAULT_QUERY.b);
  const rect = useMemo(() => normaliseRect(a, b), [a, b]);
  return { mode, setMode, q, setQ, a, setA, b, setB, rect };
}
