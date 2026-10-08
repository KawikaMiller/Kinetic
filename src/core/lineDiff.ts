/** Which lines of two listings differ: `added` indexes `after`, `removed` indexes `before`. */
export interface LineDiff {
  added: Set<number>;
  removed: Set<number>;
}

/**
 * A line diff the way `diff` decides it: lines outside a longest common subsequence of the two
 * listings are changed, so a moved line counts as removed from its old place and added at its new one.
 */
export function lineDiff(before: readonly string[], after: readonly string[]): LineDiff {
  const n = before.length;
  const m = after.length;
  // common[i][j]: length of the longest common subsequence of before[i..] and after[j..]
  const common = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] = before[i] === after[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const keptBefore = new Set<number>();
  const keptAfter = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (before[i] === after[j]) {
      keptBefore.add(i);
      keptAfter.add(j);
      i++;
      j++;
    } else if (common[i + 1][j] >= common[i][j + 1]) i++;
    else j++;
  }
  return {
    added: new Set(after.map((_, j) => j).filter((j) => !keptAfter.has(j))),
    removed: new Set(before.map((_, i) => i).filter((i) => !keptBefore.has(i))),
  };
}
