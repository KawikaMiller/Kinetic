/**
 * Where a key press moves the selection in a radio group (WAI-ARIA radio pattern):
 * arrows step and wrap, Home/End jump to the ends. null = not a radio-group key.
 * Pure, for testing; components/useRadioGroup wires it to the DOM.
 */
export function radioKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const from = index < 0 ? 0 : index;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return index < 0 ? 0 : (from + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return index < 0 ? count - 1 : (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The one option that's in the tab order: the checked one, or the first if none is. */
export const rovingTabStop = (checkedIndex: number) => (checkedIndex < 0 ? 0 : checkedIndex);

/**
 * Where a key press moves focus in a vertical list with one tab stop (CodePanel's clickable
 * lines): ↑/↓ step without wrapping, Home/End jump to the ends. null = not a list key.
 */
export function listKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return Math.min(count - 1, index + 1);
    case 'ArrowUp':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
