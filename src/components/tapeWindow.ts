/** Which stretch of an unbounded tape a TapeStrip shows: pure, so it's tested. */

/** Cells shown by default (an odd count puts the head dead centre). */
export const TAPE_CELLS = 17;

export interface TapeWindow {
  /** Tape index of the leftmost visible cell. */
  first: number;
  /** Position of the head within the window, or null when panned out of view. */
  headAt: number | null;
}

/** `cells` visible cells centred on `head`, shifted `pan` cells to the right (negative: left). */
export function tapeWindow(head: number, cells: number, pan: number): TapeWindow {
  const first = head - Math.floor(cells / 2) + pan;
  const headAt = head - first;
  return { first, headAt: headAt >= 0 && headAt < cells ? headAt : null };
}

/** The pan after a key, or null for a key the strip doesn't handle. Home (or Escape) recentres on the head. */
export function panAfterKey(key: string, pan: number): number | null {
  if (key === 'ArrowLeft') return pan - 1;
  if (key === 'ArrowRight') return pan + 1;
  if (key === 'Home' || key === 'Escape') return 0;
  return null;
}
