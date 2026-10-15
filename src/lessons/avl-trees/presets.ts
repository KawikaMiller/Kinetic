import { mulberry32, shuffle } from '../../core/random';
import { buildAvl, fibonacciTree, type Case, type Tree } from './model';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export const SORTED_KEYS = range(15);
export const ZIGZAG_KEYS = [30, 10, 20];
export const RANDOM_COUNT = 15;
export const RANDOM_KEY_MAX = 99;
export const DEFAULT_SEED = 7;

/** Fifteen distinct keys in 1..99, in a seeded random order. */
export const randomKeys = (seed: number): number[] => shuffle(range(RANDOM_KEY_MAX), mulberry32(seed)).slice(0, RANDOM_COUNT);

export interface ComparePreset {
  id: 'sorted' | 'zigzag' | 'random';
  label: string;
}
export const COMPARE_PRESETS: ComparePreset[] = [
  { id: 'sorted', label: 'Sorted 1 to 15' },
  { id: 'zigzag', label: 'Zig-zag 30, 10, 20' },
  { id: 'random', label: 'Random (seeded)' },
];

export function presetKeys(id: ComparePreset['id'], seed: number): number[] {
  if (id === 'sorted') return SORTED_KEYS;
  if (id === 'zigzag') return ZIGZAG_KEYS;
  return randomKeys(seed);
}

/** A small valid tree and one key whose insert unbalances it in the named way. */
export interface CasePreset {
  id: Case;
  label: string;
  base: number[];
  key: number;
}
export const CASE_PRESETS: CasePreset[] = [
  { id: 'LL', label: 'Left-left', base: [30, 20, 40, 10], key: 5 },
  { id: 'RR', label: 'Right-right', base: [20, 10, 30, 40], key: 50 },
  { id: 'LR', label: 'Left-right', base: [50, 25, 75, 10, 30], key: 27 },
  { id: 'RL', label: 'Right-left', base: [50, 75, 25, 90, 60], key: 65 },
];
export const casePreset = (id: Case): CasePreset => CASE_PRESETS.find((p) => p.id === id) as CasePreset;
export const caseBase = (id: Case): Tree => buildAvl(casePreset(id).base).tree;

/** Scene 2 opens on the left-left case; scene 3 on left-right, the one a single rotation gets wrong. */
export const REPAIR_DEFAULT: Case = 'LL';
export const PICK_DEFAULT: Case = 'LR';

/** Scene 4's default: the thinnest AVL tree of height 6, and the leaf whose delete fixes two ancestors. */
export const DELETE_TREE_HEIGHT = 6;
export const DELETE_DEFAULT_KEY = 20;
export const deleteBase = (): Tree => fibonacciTree(DELETE_TREE_HEIGHT);

/** Heights the worst-case scene offers: N(6) = 20 is the last that fits the drawing. */
export const FIB_HEIGHTS = [3, 4, 5, 6] as const;
export const FIB_DEFAULT_HEIGHT = 5;

/** The growth plot: sizes up to 1,023 keys (a perfect tree of height 10). */
export const PLOT_MAX_N = 1023;
export const PLOT_SEED = 3;
