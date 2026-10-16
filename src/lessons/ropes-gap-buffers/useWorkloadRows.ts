import { useEffect, useReducer } from 'react';
import { WORKLOADS, runWorkload, type WorkloadId, type WorkloadResult } from './workloads';

/** Up to this many characters all six workloads run inside the render (a few milliseconds); above it they run after a paint. */
export const SYNC_MAX_SIZE = 10_000;

const cache = new Map<string, WorkloadResult>();
const keyOf = (id: WorkloadId, size: number) => `${id}:${size}`;

/** A workload's result, run once per (workload, size) and kept: the workloads are seeded, so the result never changes. */
export function cachedWorkload(id: WorkloadId, size: number): WorkloadResult {
  const key = keyOf(id, size);
  let result = cache.get(key);
  if (!result) {
    result = runWorkload(id, size);
    cache.set(key, result);
  }
  return result;
}

const isCached = (id: WorkloadId, size: number) => cache.has(keyOf(id, size));

/** Run `fn` after the browser has painted the current state (a frame, then a task). */
function afterPaint(fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(fn, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/**
 * The workload table rows for one text size, null for a row not run yet. Large sizes run the selected
 * workload first, then the other five one at a time, each after a paint, so the page shows a
 * "running" state instead of freezing and the selected row is ready as early as possible.
 */
export function useWorkloadRows(selected: WorkloadId, size: number): (WorkloadResult | null)[] {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const sync = size <= SYNC_MAX_SIZE;

  useEffect(() => {
    if (sync) return undefined;
    const order = [selected, ...WORKLOADS.map((w) => w.id).filter((id) => id !== selected)];
    let cancel = () => {};
    const next = (from: number) => {
      const i = order.findIndex((id, k) => k >= from && !isCached(id, size));
      if (i < 0) return;
      cancel = afterPaint(() => {
        cachedWorkload(order[i], size);
        rerender();
        next(i + 1);
      });
    };
    next(0);
    return () => cancel();
  }, [selected, size, sync]);

  return WORKLOADS.map((w) => (sync || isCached(w.id, size) ? cachedWorkload(w.id, size) : null));
}
