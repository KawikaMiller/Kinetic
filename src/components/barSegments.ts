/** Pure layout behind Bar's stacked `segments` (kept apart so Bar.tsx exports only components). */

/**
 * Widths of stacked segments laid end to end on a track of `max`, in % of the track. Each
 * segment is cut where the running total reaches `max`, so the stack never overflows the
 * track (a frame budget: update first, then whatever render still fits). Negative values count as 0.
 */
export function stackShares(values: readonly number[], max: number): number[] {
  let used = 0;
  return values.map((v) => {
    const room = Math.max(0, max - used);
    const take = Math.min(Math.max(0, v), room);
    used += take;
    return max > 0 ? (take / max) * 100 : 0;
  });
}
