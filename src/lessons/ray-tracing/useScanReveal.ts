import { useEffect, useRef, useState } from 'react';

/** Rows revealed per tick, and the gap between ticks: the scan sweeps a 72-row picture in about half a second. */
const ROWS_PER_TICK = 2;
const TICK_MS = 14;

const reducedMotion = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * How many rows of the picture the scan cursor has passed. The picture starts fully shown; the sweep
 * runs when `replay` changes after mount ("Trace again"), not on every edit, so dragging a sphere never
 * leaves the picture half drawn. With reduced motion set, the picture is always shown at once.
 */
export function useScanReveal(replay: number, rows: number): number {
  const [state, setState] = useState({ replay, shown: rows });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    if (reducedMotion()) return undefined;
    let shown = 0;
    setState({ replay, shown: 0 });
    const id = setInterval(() => {
      shown = Math.min(rows, shown + ROWS_PER_TICK);
      setState({ replay, shown });
      if (shown >= rows) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [replay, rows]);
  if (state.replay === replay) return state.shown;
  return reducedMotion() ? rows : 0;
}
