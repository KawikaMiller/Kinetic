import { mulberry32, shuffle } from '../../core/random';
import { buildRb, type RbTree } from './model';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const DEFAULT_SEED = 7;
export const RANDOM_COUNT = 15;
export const RANDOM_KEY_MAX = 99;

/** Fifteen distinct keys in 1..99 in a seeded random order. */
export const randomKeys = (seed: number): number[] => shuffle(range(RANDOM_KEY_MAX), mulberry32(seed)).slice(0, RANDOM_COUNT);

/** Scene 1's opening tree: a valid red-black tree of seven keys (a black root, red 10 and 30 over black leaves, then reds under 25). */
export const RULES_KEYS = [20, 10, 30, 5, 15, 25, 35, 1];

/** A tree built from every key but the last, and the last key to insert with the stepper. */
export interface InsertPreset {
  id: 'uncle-red' | 'zigzag' | 'sorted' | 'random';
  label: string;
}
export const INSERT_PRESETS: InsertPreset[] = [
  { id: 'uncle-red', label: 'Uncle red, twice' },
  { id: 'zigzag', label: 'Zig-zag 30, 10, 20' },
  { id: 'sorted', label: 'Sorted 1 to 15' },
  { id: 'random', label: 'Random (seeded)' },
];

export interface InsertStart {
  base: RbTree;
  key: number;
}

export function insertStart(id: InsertPreset['id'], seed: number): InsertStart {
  if (id === 'zigzag') return { base: buildRb([30, 10]).tree, key: 20 };
  if (id === 'sorted') return { base: buildRb(range(14)).tree, key: 15 };
  if (id === 'random') {
    const keys = randomKeys(seed);
    return { base: buildRb(keys.slice(0, -1)).tree, key: keys[keys.length - 1] };
  }
  return { base: buildRb(range(13)).tree, key: 14 };
}

/** The tree of scene 3: sorted 1 to 15 inserted in order. */
export const deleteBase = (): RbTree => buildRb(range(15)).tree;

export interface DeletePreset {
  id: string;
  label: string;
  key: number;
  /** The tree the delete runs on. */
  base: () => RbTree;
}
export const DELETE_PRESETS: DeletePreset[] = [
  { id: 'chain', label: 'Delete 1: a long fix-up', key: 1, base: deleteBase },
  { id: 'far', label: 'Delete 4: far nephew red', key: 4, base: deleteBase },
  { id: 'near', label: 'Delete 5: near nephew red', key: 5, base: () => buildRb([10, 5, 15, 12]).tree },
  { id: 'red', label: 'Delete 12: a red node, no fix-up', key: 12, base: deleteBase },
];
export const DELETE_DEFAULT_KEY = DELETE_PRESETS[0].key;

/** Scene 4's presets: a built tree and a typed list. */
export const GROUP_PRESETS: { id: 'sorted' | 'zigzag' | 'random'; label: string }[] = [
  { id: 'sorted', label: 'Sorted 1 to 15' },
  { id: 'zigzag', label: 'Zig-zag 30, 10, 20' },
  { id: 'random', label: 'Random (seeded)' },
];
export const groupKeys = (id: 'sorted' | 'zigzag' | 'random', seed: number): number[] => (id === 'sorted' ? range(15) : id === 'zigzag' ? [30, 10, 20] : randomKeys(seed));

/** Scene 5: the comparison's two insertion orders. */
export const COMPARE_ORDERS = [
  { value: 'random', label: 'Random order' },
  { value: 'sorted', label: 'Sorted order' },
] as const;
