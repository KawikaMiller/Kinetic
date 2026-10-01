export interface Item {
  id: number;
  label: string;
}

export type OpKind = 'push' | 'pop' | 'peek' | 'enqueue' | 'dequeue';
export type Target = 'stack' | 'queue';

export interface Op {
  target: Target;
  kind: OpKind;
  item?: Item;
}

export interface World {
  stack: Item[]; // index 0 = bottom
  queue: Item[]; // index 0 = front
}

/** What an operation did: changed the world, or was refused because the structure was full or empty. */
export type Outcome = 'ok' | 'full' | 'empty';

export interface OpResult {
  world: World;
  outcome: Outcome;
  /** The item added, removed or peeked at (absent when refused). */
  item?: Item;
}

const isAdd = (kind: OpKind) => kind === 'push' || kind === 'enqueue';

/** The element each structure hands out next: a stack's top, a queue's front. */
export const nextOut = (w: World, target: Target): Item | undefined =>
  target === 'stack' ? w.stack[w.stack.length - 1] : w.queue[0];

/**
 * Apply one stack or queue operation. Adding needs `item`; `cap` is how many each
 * structure may hold (adding beyond it is refused as full, removing or peeking an empty
 * one is refused as empty). Never mutates `w`.
 */
export function applyOp(w: World, target: Target, kind: OpKind, item?: Item, cap = Infinity): OpResult {
  const list = target === 'stack' ? w.stack : w.queue;
  if (isAdd(kind)) {
    if (!item) throw new Error(`${kind} needs an item`);
    if (list.length >= cap) return { world: w, outcome: 'full' };
    // a stack and a queue both add at the end of the array: the top, or the back
    return { world: { ...w, [target]: [...list, item] }, outcome: 'ok', item };
  }
  const out = nextOut(w, target);
  if (!out) return { world: w, outcome: 'empty' };
  if (kind === 'peek') return { world: w, outcome: 'ok', item: out };
  const rest = target === 'stack' ? list.slice(0, -1) : list.slice(1);
  return { world: { ...w, [target]: rest }, outcome: 'ok', item: out };
}
