// Scene geometry for value-vs-reference: where each scope, name and heap box sits.
// Computed once per preset from all of its frames, so nothing jumps while stepping.
import type { Pt } from '../../core/geometry';
import { heapHeight, SLOT } from '../../components/memory';
import type { HeapObj, Mem } from './model';

export const SCENE_W = 680;
export const HEAP_W = 180;
const NAMES_X = 16;
const COLUMN_X: Record<HeapObj['column'], number> = { a: 262, b: 482 };
const TOP = 44;
const SCOPE_LABEL_H = 18;
const ROW = SLOT.h + 10;
const SCOPE_GAP = 18;
const HEAP_GAP = 16;
const BOTTOM_PAD = 18;

export interface ScopeBox {
  id: string;
  label: string;
  y: number;
  h: number;
}

export interface SceneLayout {
  scopes: ScopeBox[];
  /** Top-left corner of each binding's VarSlot, by binding id. */
  slots: Map<string, Pt>;
  /** Top-left corner of each heap object, by object id. */
  heap: Map<string, Pt>;
  height: number;
}

/** Items in the order they first appear across a preset's states. */
function inOrder<T>(states: readonly Mem[], items: (m: Mem) => readonly T[], key: (t: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const m of states) for (const t of items(m)) if (!seen.has(key(t))) seen.set(key(t), t);
  return [...seen.values()];
}

export function layoutScene(states: readonly Mem[]): SceneLayout {
  const slots = new Map<string, Pt>();
  const scopes: ScopeBox[] = [];
  let y = TOP;
  for (const scope of inOrder(states, (m) => m.scopes, (s) => s.id)) {
    const names = inOrder(states, (m) => m.bindings.filter((b) => b.scope === scope.id), (b) => b.id);
    const h = SCOPE_LABEL_H + Math.max(1, names.length) * ROW;
    names.forEach((b, i) => slots.set(b.id, { x: NAMES_X, y: y + SCOPE_LABEL_H + i * ROW }));
    scopes.push({ id: scope.id, label: scope.label, y, h });
    y += h + SCOPE_GAP;
  }

  // Reserve each object's tallest size, so an array growing on push doesn't shove its neighbours.
  const tallest = new Map<string, number>();
  for (const m of states) for (const o of m.heap) tallest.set(o.id, Math.max(tallest.get(o.id) ?? 0, o.fields.length));
  const heap = new Map<string, Pt>();
  const columnY: Record<HeapObj['column'], number> = { a: TOP + SCOPE_LABEL_H, b: TOP + SCOPE_LABEL_H };
  for (const o of inOrder(states, (m) => m.heap, (x) => x.id)) {
    heap.set(o.id, { x: COLUMN_X[o.column], y: columnY[o.column] });
    columnY[o.column] += heapHeight(tallest.get(o.id)!) + HEAP_GAP;
  }

  const height = Math.max(y - SCOPE_GAP, columnY.a - HEAP_GAP, columnY.b - HEAP_GAP) + BOTTOM_PAD;
  return { scopes, slots, heap, height };
}

/** Sideways bow for each of `n` arrows into one box, so they don't draw on top of each other. */
export const fanBend = (index: number, count: number) => (count <= 1 ? 0 : (index - (count - 1) / 2) * 22);
