import { DRAWN_LIMIT } from './presets';

/** Why an operation on the drawn list is refused, or null: duplicates are refused (not replaced), and the drawing holds 64 keys. */
export function refuseOp(op: 'insert' | 'delete' | 'search', key: number, size: number, has: boolean): string | null {
  if (op === 'insert') {
    if (has) return `${key} is already in the list: a duplicate insert is refused, not replaced.`;
    if (size >= DRAWN_LIMIT) return `The list already has ${DRAWN_LIMIT} keys, the most the drawing holds.`;
    return null;
  }
  if (op === 'delete') {
    if (size === 0) return 'The list is empty: there is nothing to delete.';
    if (!has) return `${key} is not in the list.`;
  }
  return null;
}
