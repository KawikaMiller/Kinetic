import { parseIntegers } from '../../core/parse';
import type { Result } from '../../core/result';
import { mulberry32 } from '../../core/random';
import { leafCount, search, type Ordering, type Spec } from './tree';

/** The teaching tree: depth 3, branching 3, 27 leaves; the root is a max node. */
export const SPEC: Spec = { b: 3, d: 3 };
export const LEAF_MIN = -9;
export const LEAF_MAX = 9;

/** Chosen so that, left to right, alpha-beta skips part of the tree, best first reaches the minimum and worst first skips nothing (a test checks each). */
export const DEFAULT_LEAVES: number[] = [-8, 0, -8, 0, 6, -1, 7, 9, 3, -9, 8, -7, 5, -7, -5, 3, 3, 4, -4, 1, -3, -9, -2, -2, -2, 1, -4];

export interface BoardPreset {
  id: string;
  label: string;
  board: string;
}

/** Positions with O to move where a shallow search misjudges (a test checks the claim for each). */
export const BOARD_PRESETS: BoardPreset[] = [
  { id: 'corners', label: 'Two corners and the centre', board: 'X...O...X' },
  { id: 'fork', label: 'A fork a few moves away', board: '.X.X..O..' },
];

export const BRANCHINGS = [3, 10, 35];
export const DEPTH_MAX = 12;

/** The opening state of each scene (pure, so a test can pin what each try-this starts from). */
export const OPENING = {
  minimax: { leaves: DEFAULT_LEAVES, selected: 0, predictedValue: 0, predictedMove: 1 },
  alphabeta: { pruning: true, ordering: 'given' as Ordering },
  game: { first: 'you' as 'you' | 'machine' },
  depth: { preset: 'corners', depth: 1 },
  growth: { branching: 35, depth: 8 },
} as const;

/** Leaf values typed as a list: exactly 27 whole numbers from -9 to 9, or the reason it is refused. */
export function parseLeaves(text: string): Result<number[]> {
  const xs = parseIntegers(text);
  const n = leafCount(SPEC);
  if (xs === null) return { ok: false, error: `Type ${n} whole numbers from ${LEAF_MIN} to ${LEAF_MAX}, separated by commas or spaces.` };
  if (xs.length !== n) return { ok: false, error: `The tree has ${n} leaves: that is ${xs.length} values.` };
  const bad = xs.find((x) => x < LEAF_MIN || x > LEAF_MAX);
  if (bad !== undefined) return { ok: false, error: `${bad} is outside ${LEAF_MIN} to ${LEAF_MAX}.` };
  return { ok: true, value: xs };
}

/** The first seeded tree of the teaching shape on which the swapped-bounds bug returns a wrong root value, with both values. */
export function swappedBoundsCounterexample(): { leaves: number[]; truth: number; buggy: number } {
  const rnd = mulberry32(5);
  for (let t = 0; t < 5000; t++) {
    const leaves = Array.from({ length: leafCount(SPEC) }, () => LEAF_MIN + Math.floor(rnd() * (LEAF_MAX - LEAF_MIN + 1)));
    const truth = search(SPEC, leaves, { prune: false }).value;
    const buggy = search(SPEC, leaves, { prune: true, variant: 'swapped-bounds' }).value;
    if (buggy !== truth) return { leaves, truth, buggy };
  }
  throw new Error('no counterexample found');
}
