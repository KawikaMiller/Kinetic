import { logCheckpoints } from '../../core/stats';
import { mulberry32, shuffle } from '../../core/random';
import { EMPTY_TREE, heightOf, insertKey } from '../../core/avl';

/** Samples per decade on the growth plot's log axis. */
const SAMPLES_PER_DECADE = 12;

export interface GrowthSeries {
  /** Tree sizes sampled. */
  n: number[];
  /** Height of a plain BST fed sorted keys: grown by actually inserting them. */
  plainSorted: number[];
  /** Height of the AVL tree fed the same sorted keys. */
  avlSorted: number[];
  /** Height of the AVL tree fed a seeded random order of the same keys. */
  avlRandom: number[];
}

/** Heights of a plain BST at the sample sizes, tracking only how deep each new key lands. */
function plainHeights(keys: readonly number[], at: ReadonlySet<number>): number[] {
  const left = new Map<number, number>();
  const right = new Map<number, number>();
  let root: number | null = null;
  let height = 0;
  const out: number[] = [];
  keys.forEach((key, i) => {
    if (root === null) {
      root = key;
      height = 1;
    } else {
      let cur: number = root;
      let depth = 1;
      for (;;) {
        const side = key < cur ? left : right;
        const next = side.get(cur);
        depth++;
        if (next === undefined) {
          side.set(cur, key);
          break;
        }
        cur = next;
      }
      height = Math.max(height, depth);
    }
    if (at.has(i + 1)) out.push(height);
  });
  return out;
}

function avlHeights(keys: readonly number[], at: ReadonlySet<number>): number[] {
  let tree = EMPTY_TREE;
  const out: number[] = [];
  keys.forEach((key, i) => {
    tree = insertKey(tree, key).tree;
    if (at.has(i + 1)) out.push(heightOf(tree));
  });
  return out;
}

/** Heights against size for `size` keys: sorted into a plain tree, sorted into AVL, and random order into AVL. */
export function growthSeries(size: number, seed: number): GrowthSeries {
  const n = logCheckpoints(size, SAMPLES_PER_DECADE);
  const at = new Set(n);
  const sorted = Array.from({ length: size }, (_, i) => i + 1);
  return {
    n,
    plainSorted: plainHeights(sorted, at),
    avlSorted: avlHeights(sorted, at),
    avlRandom: avlHeights(shuffle(sorted, mulberry32(seed)), at),
  };
}

/** The AVL height bound the plot draws: 1.44 log2(n + 2) (Adelson-Velsky and Landis; Knuth, TAOCP vol. 3). */
export const AVL_HEIGHT_FACTOR = 1.44;
export const avlBound = (n: number): number => AVL_HEIGHT_FACTOR * Math.log2(n + 2);
