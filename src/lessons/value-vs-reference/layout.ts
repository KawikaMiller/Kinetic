// Scene geometry for value-vs-reference: where each scope, name and heap box sits.
// Computed once per preset from all of its frames, so nothing jumps while stepping.
import type { Pt } from '../../core/geometry';
import { heapHeight, SLOT, stackBoxes } from '../../components/memory';
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
  const scopeList = inOrder(states, (m) => m.scopes, (s) => s.id).map((scope) => ({
    scope,
    names: inOrder(states, (m) => m.bindings.filter((b) => b.scope === scope.id), (b) => b.id),
  }));
  const scopeHeights = scopeList.map(({ names }) => SCOPE_LABEL_H + Math.max(1, names.length) * ROW);
  const scopeStack = stackBoxes(scopeHeights, { start: TOP, gap: SCOPE_GAP });
  const scopes: ScopeBox[] = scopeList.map(({ scope, names }, i) => {
    const y = scopeStack.tops[i];
    names.forEach((b, row) => slots.set(b.id, { x: NAMES_X, y: y + SCOPE_LABEL_H + row * ROW }));
    return { id: scope.id, label: scope.label, y, h: scopeHeights[i] };
  });

  // Reserve each object's tallest size, so an array growing on push doesn't shove its neighbours.
  const tallest = new Map<string, number>();
  for (const m of states) for (const o of m.heap) tallest.set(o.id, Math.max(tallest.get(o.id) ?? 0, o.fields.length));
  const heap = new Map<string, Pt>();
  const objects = inOrder(states, (m) => m.heap, (x) => x.id);
  const columnEnds = (Object.keys(COLUMN_X) as HeapObj['column'][]).map((column) => {
    const inColumn = objects.filter((o) => o.column === column);
    const stack = stackBoxes(inColumn.map((o) => heapHeight(tallest.get(o.id)!)), { start: TOP + SCOPE_LABEL_H, gap: HEAP_GAP });
    inColumn.forEach((o, i) => heap.set(o.id, { x: COLUMN_X[column], y: stack.tops[i] }));
    return stack.end - HEAP_GAP;
  });

  const height = Math.max(scopeStack.end - SCOPE_GAP, ...columnEnds) + BOTTOM_PAD;
  return { scopes, slots, heap, height };
}
