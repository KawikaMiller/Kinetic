export interface PairPreset {
  id: string;
  label: string;
  values: number[];
  target: number;
}

export const PRESETS: PairPreset[] = [
  { id: 'sorted', label: 'Sorted', values: [1, 3, 4, 6, 8, 11, 14, 17], target: 19 },
  { id: 'none', label: 'No solution', values: [2, 3, 5, 8, 13, 21], target: 9 },
  // Two pointers misses 1+9 and 2+8 here: the elimination proof only holds on sorted input.
  { id: 'unsorted', label: 'Unsorted (breaks it)', values: [1, 9, 2, 8, 4], target: 10 },
];

export const PALINDROMES = ['racecar', 'noon', 'rotator', 'abcdxba'];
export const DEDUPE_PRESET = [1, 1, 2, 3, 3, 3, 4, 5, 5];

/** Longest array the pair matrix still reads at. */
export const MAX_LENGTH = 12;
export const MAX_TEXT = 14;
