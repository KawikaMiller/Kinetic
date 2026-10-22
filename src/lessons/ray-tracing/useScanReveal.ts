import { useEffect, useState } from 'react';

/** Rows revealed per tick, and the gap between ticks: the scan sweeps a 72-row picture in about half a second. */
const ROWS_PER_TICK = 2;
const TICK_MS = 14;

/**
 * How many rows of the picture the scan cursor has passed. The sweep starts again whenever `replay`
 * changes (not on every edit, so dragging a sphere never leaves the picture half drawn).
 */
export function useScanReveal(replay: number, rows: number): number {
  const [state, setState] = useState({ replay: -1, shown: 0 });
  useEffect(() => {
    let shown = 0;
    const id = setInterval(() => {
      shown = Math.min(rows, shown + ROWS_PER_TICK);
      setState({ replay, shown });
      if (shown >= rows) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [replay, rows]);
  return state.replay === replay ? state.shown : 0;
}
