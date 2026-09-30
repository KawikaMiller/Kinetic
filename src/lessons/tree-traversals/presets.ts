import { bstFrom, type BTree } from './model';

/**
 * A lopsided letter tree, lettered row by row. It is NOT a search tree, so in-order is
 * just "left, node, right" and comes out unsorted (the lesson's main misconception).
 */
const LETTERS: BTree = {
  root: 0,
  nodes: {
    0: { label: 'A', left: 1, right: 2 },
    1: { label: 'B', left: 3, right: 4 },
    2: { label: 'C', left: null, right: 5 },
    3: { label: 'D', left: null, right: null },
    4: { label: 'E', left: 6, right: 7 },
    5: { label: 'F', left: 8, right: null },
    6: { label: 'G', left: null, right: null },
    7: { label: 'H', left: null, right: null },
    8: { label: 'I', left: null, right: null },
  },
};

/** (3 + 4) × 2 */
const EXPRESSION: BTree = {
  root: 0,
  nodes: {
    0: { label: '×', left: 1, right: 4 },
    1: { label: '+', left: 2, right: 3 },
    2: { label: '3', left: null, right: null },
    3: { label: '4', left: null, right: null },
    4: { label: '2', left: null, right: null },
  },
};

const BST = bstFrom([50, 30, 70, 20, 40, 60, 80, 35]);

export type PresetId = 'letters' | 'expression' | 'bst';

export const PRESETS: { id: PresetId; label: string; tree: BTree }[] = [
  { id: 'letters', label: 'Letters', tree: LETTERS },
  { id: 'expression', label: '(3 + 4) × 2', tree: EXPRESSION },
  { id: 'bst', label: 'BST', tree: BST },
];

export const MAX_NODES = 15;
/** Labels handed to new nodes added by clicking. */
export const NEW_LABELS = 'JKLMNOPQRSTUVWXYZ';
