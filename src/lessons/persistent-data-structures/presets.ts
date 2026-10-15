/** Scenes 1 and 2: eight cells at branching 2, so the tree has four levels and fifteen nodes. */
export const SMALL_B = 2;
export const SMALL_VALUES = [3, 1, 4, 1, 5, 9, 2, 6];
export const DEFAULT_EDIT_INDEX = 5;
export const DEFAULT_EDIT_VALUE = 7;

/** Scene 3: the branching factors and sizes on offer. */
export const BRANCHING = [2, 4, 8, 32] as const;
export const COST_SIZES = [8, 64, 512, 1024] as const;
export const DEFAULT_BRANCHING = 2;
export const DEFAULT_SIZE = 1024;
/** Updates the memory plot runs to. */
export const MAX_UPDATES = 64;
export const DEFAULT_UPDATES = 8;
export const MEMORY_SEED = 11;

/** Scene 4: a sixteen-cell document, branching 2. */
export const DOC_B = 2;
export const DOC_VALUES = Array.from({ length: 16 }, (_, i) => i + 1);

/** The edits already made when the scene opens: v1 and v2, a straight line. */
export const DOC_EDITS = [
  { index: 3, value: 40 },
  { index: 9, value: 77 },
];
