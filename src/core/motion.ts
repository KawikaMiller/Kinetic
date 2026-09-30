// Shared motion presets. Map a lesson's inline spring to the nearest preset; if its
// feel genuinely differs, keep a named local constant instead of adding a preset.

export const SPRING = {
  soft: { type: 'spring', stiffness: 170, damping: 24 },
  snappy: { type: 'spring', stiffness: 300, damping: 28 },
  stiff: { type: 'spring', stiffness: 450, damping: 32 },
} as const;

/** "No!" shake for a rejected action: animate={SHAKE}. */
export const SHAKE = { x: [0, -5, 5, -4, 4, 0] };

/** Rows that slide in from the left (logs, lists): spread onto a motion element. */
export const enterFromLeft = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0 },
} as const;

/** Items that pop into existence and shrink away. */
export const popIn = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.5 },
} as const;
