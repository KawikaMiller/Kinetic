// Prefix sums and difference arrays, as pure functions the stage and the tests share.

/** prefix[0] = 0 and prefix[i + 1] = prefix[i] + a[i]: n + 1 entries for n values. */
export function prefixSums(a: readonly number[]): number[] {
  const p = [0];
  for (const v of a) p.push(p[p.length - 1] + v);
  return p;
}

/** Sum of a[l..r] inclusive in O(1): prefix[r + 1] − prefix[l]. */
export const rangeSum = (prefix: readonly number[], l: number, r: number) => prefix[r + 1] - prefix[l];

/** The same sum the slow way, O(r − l + 1). */
export const naiveRangeSum = (a: readonly number[], l: number, r: number) => a.slice(l, r + 1).reduce((x, y) => x + y, 0);

/** The classic off-by-one: prefix[r] − prefix[l] misses a[r]. */
export const offByOneRangeSum = (prefix: readonly number[], l: number, r: number) => prefix[r] - prefix[l];

/** Cost of Q range queries each way: O(1) after an O(n) build, vs re-adding each range. */
export function queryCosts(n: number, queries: number) {
  return { prefix: n + queries, naiveWorst: queries * n };
}

export interface RangeUpdate {
  from: number;
  to: number;
  add: number;
}

/** Record a range update in O(1): +add where it starts, −add just after it ends. */
export function markUpdate(diff: number[], u: RangeUpdate) {
  diff[u.from] += u.add;
  diff[u.to + 1] -= u.add;
}

/**
 * Apply many range updates with a difference array: two writes per update, then one
 * running-sum pass. diff has n + 1 slots so an update ending at the last index still
 * has somewhere to put its −add.
 */
export function applyWithDiff(base: readonly number[], updates: readonly RangeUpdate[]) {
  const diff = new Array<number>(base.length + 1).fill(0);
  for (const u of updates) markUpdate(diff, u);
  const result: number[] = [];
  let running = 0;
  for (let i = 0; i < base.length; i++) {
    running += diff[i];
    result.push(base[i] + running);
  }
  return { diff, result };
}

/** The naive way: touch every cell of every range. */
export function applyNaively(base: readonly number[], updates: readonly RangeUpdate[]) {
  const out = [...base];
  for (const u of updates) for (let i = u.from; i <= u.to; i++) out[i] += u.add;
  return out;
}

export const naiveWrites = (updates: readonly RangeUpdate[]) => updates.reduce((sum, u) => sum + u.to - u.from + 1, 0);
