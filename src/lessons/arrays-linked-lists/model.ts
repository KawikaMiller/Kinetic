export const CAP = 10; // array capacity
export const SLOTS = 16; // memory slots available to the linked list

/** Array base address and bytes per item; list base address and bytes per node. */
export const ARR_BASE = 0x100;
export const ARR_ITEM_BYTES = 4;
export const LIST_BASE = 0x200;
export const LIST_NODE_BYTES = 16;

export type Where = 'front' | 'middle' | 'end';
export type Op = 'access' | 'insert' | 'delete';

export interface Item {
  id: number;
  v: number;
}
export interface LNode {
  slot: number;
  id: number;
  v: number;
  next: number | null; // slot of the next node
}
export interface Model {
  arr: Item[];
  nodes: LNode[];
  head: number | null;
}

/** What one array step did, for the caption. */
export type ArrNote =
  | { k: 'access'; p: number; v: number }
  | { k: 'shift-right'; v: number; moved: number }
  | { k: 'write'; p: number; v: number; atEnd: boolean }
  | { k: 'remove'; p: number; v: number }
  | { k: 'was-last' }
  | { k: 'shift-left'; v: number };

/** The address arithmetic shown beside the array on this step. */
export type ArrFormula = { k: 'address'; p: number } | { k: 'write'; p: number } | null;

/** What one linked-list step did, for the caption. */
export type ListNote =
  | { k: 'start'; slot: number }
  | { k: 'hop'; slot: number; hop: number }
  | { k: 'reached'; v: number; steps: number }
  | { k: 'alloc'; slot: number }
  | { k: 'point-at-head' }
  | { k: 'move-head' }
  | { k: 'point-at-rest' }
  | { k: 'linked' }
  | { k: 'target-is-head' }
  | { k: 'skip-head' }
  | { k: 'skip'; v: number }
  | { k: 'free' };

export interface ArrState {
  slots: (Item | null)[];
  hi: number | null;
  ok: number | null;
  bad: number | null;
  formula: ArrFormula;
  steps: number;
  note: ArrNote | null;
}
export interface ListState {
  nodes: LNode[];
  head: number | null;
  cur: number | null;
  fresh: number | null;
  hot: [number, number] | null;
  bad: number | null;
  steps: number;
  note: ListNote | null;
}

export const hex = (n: number) => '0x' + n.toString(16).toUpperCase();
export const arrAddr = (i: number) => hex(ARR_BASE + i * ARR_ITEM_BYTES);
export const listAddr = (s: number) => hex(LIST_BASE + s * LIST_NODE_BYTES);

/** Big-O for each op, [array, linked list] (singly linked, head pointer only). */
export const COST: Record<Op, Record<Where, [string, string]>> = {
  access: { front: ['O(1)', 'O(1)'], middle: ['O(1)', 'O(n)'], end: ['O(1)', 'O(n)'] },
  insert: { front: ['O(n)', 'O(1)'], middle: ['O(n)', 'O(n)'], end: ['O(1)', 'O(n)'] },
  delete: { front: ['O(n)', 'O(1)'], middle: ['O(n)', 'O(n)'], end: ['O(1)', 'O(n)'] },
};

/** Nodes in list order, following next pointers from head. */
export function orderOf(nodes: LNode[], head: number | null) {
  const bySlot = new Map(nodes.map((n) => [n.slot, n]));
  const out: LNode[] = [];
  let s = head;
  while (s != null) {
    const n = bySlot.get(s);
    if (!n) break;
    out.push(n);
    s = n.next;
  }
  return out;
}

export const toSlots = (arr: Item[]): (Item | null)[] => Array.from({ length: CAP }, (_, i) => arr[i] ?? null);

/** The index an operation at `where` works on, for a list of `len` items. */
export function position(op: Op, where: Where, len: number) {
  if (op === 'insert') return where === 'front' ? 0 : where === 'end' ? len : Math.floor(len / 2);
  return where === 'front' ? 0 : where === 'end' ? len - 1 : Math.floor((len - 1) / 2);
}

/**
 * Where the work really happened. With one or two items "middle" and "end" can land on
 * the front, and the costs and verdict must describe what was actually done.
 */
export function effectiveWhere(op: Op, p: number, len: number): Where {
  if (p === 0) return 'front';
  const last = op === 'insert' ? len : len - 1;
  return p === last ? 'end' : 'middle';
}

function runArray(op: Op, p: number, arr: Item[], v: number, id: number) {
  const states: ArrState[] = [];
  const slots = toSlots(arr);
  let steps = 0;
  const push = (s: Partial<ArrState>) =>
    states.push({ slots: slots.slice(), hi: null, ok: null, bad: null, formula: null, steps, note: null, ...s });
  const len = arr.length;

  if (op === 'access') {
    steps = 1;
    push({ hi: p, formula: { k: 'address', p }, note: { k: 'access', p, v: arr[p].v } });
  } else if (op === 'insert') {
    for (let j = len - 1; j >= p; j--) {
      slots[j + 1] = slots[j];
      slots[j] = null;
      steps++;
      push({ hi: j + 1, note: { k: 'shift-right', v: slots[j + 1]!.v, moved: steps } });
    }
    slots[p] = { id, v };
    steps++;
    push({ ok: p, formula: { k: 'write', p }, note: { k: 'write', p, v, atEnd: p === len } });
  } else {
    steps++;
    push({ bad: p, note: { k: 'remove', p, v: arr[p].v } });
    slots[p] = null;
    if (p === len - 1) push({ note: { k: 'was-last' } });
    for (let j = p + 1; j < len; j++) {
      slots[j - 1] = slots[j];
      slots[j] = null;
      steps++;
      push({ hi: j - 1, note: { k: 'shift-left', v: slots[j - 1]!.v } });
    }
  }
  return { states, after: slots.filter((s): s is Item => s !== null), steps };
}

function runList(op: Op, p: number, nodes0: LNode[], head0: number | null, v: number, id: number, free: number) {
  const states: ListState[] = [];
  let nodes = nodes0.map((n) => ({ ...n }));
  let head = head0;
  let steps = 0;
  const find = (s: number) => nodes.find((n) => n.slot === s)!;
  const push = (s: Partial<ListState>) =>
    states.push({ nodes: nodes.map((n) => ({ ...n })), head, cur: null, fresh: null, hot: null, bad: null, steps, note: null, ...s });
  const order = orderOf(nodes, head);
  const walk = (upTo: number, extra: Partial<ListState> = {}) => {
    for (let k = 0; k <= upTo; k++) {
      steps++;
      const slot = order[k].slot;
      push({ ...extra, cur: slot, note: k === 0 ? { k: 'start', slot } : { k: 'hop', slot, hop: k } });
    }
  };

  if (op === 'access') {
    walk(p);
    states[states.length - 1].note = { k: 'reached', v: order[p].v, steps: p + 1 };
  } else if (op === 'insert') {
    steps++;
    nodes.push({ slot: free, id, v, next: null });
    push({ fresh: free, note: { k: 'alloc', slot: free } });
    if (p === 0) {
      find(free).next = head;
      steps++;
      push({ fresh: free, hot: head != null ? [free, head] : null, note: { k: 'point-at-head' } });
      head = free;
      steps++;
      push({ fresh: free, note: { k: 'move-head' } });
    } else {
      walk(p - 1, { fresh: free });
      const pred = find(order[p - 1].slot);
      find(free).next = pred.next;
      steps++;
      push({ cur: pred.slot, fresh: free, hot: pred.next != null ? [free, pred.next] : null, note: { k: 'point-at-rest' } });
      pred.next = free;
      steps++;
      push({ cur: pred.slot, fresh: free, hot: [pred.slot, free], note: { k: 'linked' } });
    }
  } else {
    const target = order[p];
    if (p === 0) {
      steps++;
      push({ bad: target.slot, note: { k: 'target-is-head' } });
      head = target.next;
      steps++;
      push({ bad: target.slot, note: { k: 'skip-head' } });
    } else {
      walk(p - 1);
      const pred = find(order[p - 1].slot);
      pred.next = target.next;
      steps++;
      push({ cur: pred.slot, bad: target.slot, hot: target.next != null ? [pred.slot, target.next] : null, note: { k: 'skip', v: target.v } });
    }
    nodes = nodes.filter((n) => n.slot !== target.slot);
    push({ note: { k: 'free' } });
  }
  return { states, nodes, head, steps };
}

/**
 * Run one operation on both structures. `free` is the memory slot a new list node gets.
 * Returns each structure's step-by-step states, their step totals and the model afterwards.
 */
export function runOp(op: Op, where: Where, m: Model, v: number, id: number, free: number) {
  const len = m.arr.length;
  const p = position(op, where, len);
  const a = runArray(op, p, m.arr, v, id);
  const l = runList(op, p, m.nodes, m.head, v, id, free);
  return {
    p,
    where: effectiveWhere(op, p, len),
    arr: a,
    list: l,
    after: { arr: a.after, nodes: l.nodes, head: l.head } as Model,
  };
}
