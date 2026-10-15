export interface Preset {
  label: string;
  text: string;
}

export const SOURCE_PRESETS: readonly Preset[] = [
  { label: 'print 1 + 2 * 3', text: 'print 1 + 2 * 3' },
  { label: 'sum 1 to 4 (a loop)', text: 'a = 0; b = 1; while (b < 5) { a = a + b; b = b + 1 } print a' },
  { label: 'countdown', text: 'a = 3; while (0 < a) { print a; a = a - 1 }' },
];

/** Listings for the assembler scene. The first is the default: it stops with an error the learner can fix. */
export const LISTING_PRESETS: readonly Preset[] = [
  { label: 'ADD with one value', text: 'PUSH 1\nADD\nPRINT\nHALT' },
  { label: 'a jump past the end', text: 'PUSH 1\nPRINT\nJMP 3' },
  { label: 'stack over 32', text: 'PUSH 1\nJMP 0' },
  { label: 'an endless loop', text: 'JMP 0' },
  { label: 'fixed: 1 + 2', text: 'PUSH 1\nPUSH 2\nADD\nPRINT\nHALT' },
];

export const EXPRESSION_PRESETS: readonly Preset[] = [
  { label: '1 + 2 * 3', text: '1 + 2 * 3' },
  { label: '(a + b) * (c - d)', text: '(a + b) * (c - d)' },
  { label: 'a * a + a', text: 'a * a + a' },
];

/** The slot values the register comparison runs both listings with. */
export const SAMPLE_SLOTS = [1, 2, 5, 3] as const;
