import type { ReactNode } from 'react';
import type { Tone } from '../core/tone';

/** Pure helpers behind ArrayStrip (lowercase-only names collide with ArrayStrip.tsx on Windows; kept apart so ArrayStrip.tsx exports only components). */

export interface ArrayPointer {
  i: number;
  label: ReactNode;
  tone?: Tone;
  /** Stable identity for the glide animation; defaults to the label when it's a string. */
  id?: string;
}

/** Joins the labels of pointers that share a cell ("i·k"). */
export const POINTER_JOIN = '·';

/**
 * Pointers on the same cell merged into one marker, so their labels never overprint: the
 * first pointer at a cell keeps its tone and id, and the later ones append their label
 * after `join` ("i·k"). String labels join into one string; other labels join as a list
 * of nodes with the separator between them. Order is kept (first appearance per cell).
 */
export function mergeSharedPointers(pointers: readonly ArrayPointer[], join: string = POINTER_JOIN): ArrayPointer[] {
  const out: ArrayPointer[] = [];
  const parts = new Map<number, ReactNode[]>();
  for (const p of pointers) {
    const same = parts.get(p.i);
    if (same) same.push(join, p.label);
    else {
      parts.set(p.i, [p.label]);
      out.push({ ...p });
    }
  }
  return out.map((p) => {
    const labels = parts.get(p.i)!;
    if (labels.length === 1) return p;
    const label = labels.every((l) => typeof l === 'string') ? labels.join('') : labels;
    return { ...p, label };
  });
}

/**
 * How a cell is coloured flat by `cellTone`, without the lift of the `active`/`info`/`violet`
 * states: `tint` is a 22% wash with an edge in the tone, `solid` a full fill, `outline` a ring
 * inset inside the cell (counting sort's placed items).
 */
export type ArrayCellFill = 'tint' | 'solid' | 'outline';

export interface ArrayCellTone {
  tone: Tone;
  /** Default `tint`. */
  fill?: ArrayCellFill;
}

/** A bare Tone means a tint; null/undefined means no flat colour. */
export function resolveCellTone(spec: Tone | ArrayCellTone | null | undefined): Required<ArrayCellTone> | null {
  if (spec == null) return null;
  if (typeof spec === 'string') return { tone: spec, fill: 'tint' };
  return { tone: spec.tone, fill: spec.fill ?? 'tint' };
}
