/**
 * The counting scene's model: three stack slots, six heap objects with one `next` field each. The same operation log
 * is replayed two ways: reference counting (an object is freed the instant its count reaches zero) and tracing
 * collection (nothing is freed until a collect, which frees every unreachable object, cycles included).
 */
export const SLOTS = ['a', 'b', 'c'] as const;
export type Slot = (typeof SLOTS)[number];
export const OBJECT_COUNT = 6;

/** What a count update costs in the toy cost model: a plain add, or an atomic read-modify-write. Illustrative numbers. */
export const PLAIN_COST = 1;
export const ATOMIC_COST = 3;

export interface Obj {
  allocated: boolean;
  live: boolean;
  /** The object `next` points at (an index), or null. */
  next: number | null;
  /** A weak `next` does not count and reads as null once its target is freed. */
  weak: boolean;
  /** The reference count (reference counting only: tracing never reads it). */
  rc: number;
}

export interface Heap {
  slots: (number | null)[];
  objs: Obj[];
  /** Increments and decrements performed so far (reference counting only). */
  updates: number;
}

export type Op =
  | { kind: 'new'; slot: Slot }
  | { kind: 'null'; slot: Slot }
  | { kind: 'copy'; to: Slot; from: Slot }
  | { kind: 'setNext'; slot: Slot; target: Slot; weak: boolean }
  | { kind: 'clearNext'; slot: Slot }
  | { kind: 'collect' };

export type Mode = 'counting' | 'tracing';

export const emptyHeap = (): Heap => ({
  slots: SLOTS.map(() => null),
  objs: Array.from({ length: OBJECT_COUNT }, () => ({ allocated: false, live: false, next: null, weak: false, rc: 0 })),
  updates: 0,
});

const slotIndex = (s: Slot) => SLOTS.indexOf(s);

const clone = (h: Heap): Heap => ({ slots: [...h.slots], objs: h.objs.map((o) => ({ ...o })), updates: h.updates });

/** The object a `next` field reads as: a weak field to a freed object is null, never a dangling arrow. */
export function nextTarget(h: Heap, i: number): number | null {
  const o = h.objs[i];
  if (o.next === null) return null;
  return h.objs[o.next].live ? o.next : null;
}

/** Objects reachable from the slots through strong `next` fields: a search that never looks at a count. */
export function reachable(h: Heap): Set<number> {
  const seen = new Set<number>();
  const work = h.slots.filter((s): s is number => s !== null);
  while (work.length) {
    const i = work.pop() as number;
    if (seen.has(i) || !h.objs[i].live) continue;
    seen.add(i);
    const o = h.objs[i];
    if (o.next !== null && !o.weak) work.push(o.next);
  }
  return seen;
}

/** Objects that are allocated and live but unreachable: in a counting run, the leaked ones. */
export const leaked = (h: Heap): number[] => {
  const reach = reachable(h);
  return h.objs.flatMap((o, i) => (o.live && !reach.has(i) ? [i] : []));
};

/** The count each object should have, recomputed from the slots and strong fields. */
export function recountedRc(h: Heap): number[] {
  const rc = h.objs.map(() => 0);
  for (const s of h.slots) if (s !== null) rc[s]++;
  h.objs.forEach((o) => {
    if (o.live && o.next !== null && !o.weak) rc[o.next]++;
  });
  return rc;
}

function retain(h: Heap, i: number) {
  h.objs[i].rc++;
  h.updates++;
}

/** Drop one reference; at zero the object is freed and its strong `next` is released in turn (a cascade). */
function release(h: Heap, i: number) {
  const o = h.objs[i];
  o.rc--;
  h.updates++;
  if (o.rc > 0) return;
  o.live = false;
  const next = o.next;
  const strong = next !== null && !o.weak;
  o.next = null;
  o.weak = false;
  if (strong) release(h, next);
}

export interface Applied {
  heap: Heap;
  /** A sentence when the operation does nothing, and the heap is returned unchanged. */
  refused: string | null;
}

function refuse(h: Heap, why: string): Applied {
  return { heap: h, refused: why };
}

/** Check an operation against the slots and fields. The same check serves both modes. */
export function check(h: Heap, op: Op): string | null {
  switch (op.kind) {
    case 'new':
      return h.objs.every((o) => o.allocated) ? `all ${OBJECT_COUNT} objects are in use: a freed object is not reused here` : null;
    case 'null':
      return h.slots[slotIndex(op.slot)] === null ? `${op.slot} is already null` : null;
    case 'copy':
      return h.slots[slotIndex(op.from)] === null ? `${op.to} = ${op.from} does nothing while ${op.from} is null` : null;
    case 'setNext':
      if (h.slots[slotIndex(op.slot)] === null) return `${op.slot} is null, so it has no next field`;
      return h.slots[slotIndex(op.target)] === null ? `${op.slot}.next = ${op.target} does nothing while ${op.target} is null` : null;
    case 'clearNext':
      if (h.slots[slotIndex(op.slot)] === null) return `${op.slot} is null, so it has no next field`;
      return h.objs[h.slots[slotIndex(op.slot)] as number].next === null ? `${op.slot}.next is already null` : null;
    case 'collect':
      return null;
  }
}

/** Apply one operation under one mode. Counting maintains the counts and frees at zero; tracing frees only on collect. */
export function apply(h: Heap, op: Op, mode: Mode): Applied {
  const why = check(h, op);
  if (why) return refuse(h, why);
  const next = clone(h);
  const slot = (s: Slot) => slotIndex(s);
  const counting = mode === 'counting';
  const assignSlot = (to: Slot, target: number | null) => {
    const old = next.slots[slot(to)];
    if (target !== null && counting) retain(next, target);
    next.slots[slot(to)] = target;
    if (old !== null && counting) release(next, old);
  };
  switch (op.kind) {
    case 'new': {
      const id = next.objs.findIndex((o) => !o.allocated);
      next.objs[id] = { allocated: true, live: true, next: null, weak: false, rc: 0 };
      assignSlot(op.slot, id);
      break;
    }
    case 'null':
      assignSlot(op.slot, null);
      break;
    case 'copy':
      assignSlot(op.to, next.slots[slot(op.from)]);
      break;
    case 'setNext': {
      const obj = next.slots[slot(op.slot)] as number;
      const target = next.slots[slot(op.target)] as number;
      const o = next.objs[obj];
      const old = o.next;
      const oldStrong = old !== null && !o.weak;
      if (!op.weak && counting) retain(next, target);
      o.next = target;
      o.weak = op.weak;
      if (oldStrong && counting) release(next, old);
      break;
    }
    case 'clearNext': {
      const o = next.objs[next.slots[slot(op.slot)] as number];
      const old = o.next as number;
      const oldStrong = !o.weak;
      o.next = null;
      o.weak = false;
      if (oldStrong && counting) release(next, old);
      break;
    }
    case 'collect': {
      if (!counting) {
        const reach = reachable(next);
        next.objs.forEach((o, i) => {
          if (o.live && !reach.has(i)) {
            o.live = false;
            o.next = null;
            o.weak = false;
          }
        });
      }
      break;
    }
  }
  return { heap: next, refused: null };
}

/** One object's story over a log, for the comparison panel. `at` is the 1-based operation that freed it. */
export type Fate = { kind: 'unused' } | { kind: 'live' } | { kind: 'freed'; at: number } | { kind: 'leaked' } | { kind: 'pending' };

export interface Replay {
  heaps: Heap[];
  fates: Fate[];
}

/**
 * Replay a log (a list of operations that were all valid when entered) under one mode. `heaps[k]` is the state
 * after k operations. Counting frees at zero, so an unreachable object that stays live is `leaked`; tracing leaves
 * it `pending` until a collect frees it.
 */
export function replay(log: readonly Op[], mode: Mode): Replay {
  const heaps = [emptyHeap()];
  const freedAt = new Map<number, number>();
  log.forEach((op, k) => {
    const before = heaps[k];
    const { heap } = apply(before, op, mode);
    heap.objs.forEach((o, i) => {
      if (before.objs[i].live && !o.live && !freedAt.has(i)) freedAt.set(i, k + 1);
    });
    heaps.push(heap);
  });
  const end = heaps[heaps.length - 1];
  const dead = new Set(leaked(end));
  const fates = end.objs.map<Fate>((o, i) => {
    if (!o.allocated) return { kind: 'unused' };
    if (freedAt.has(i)) return { kind: 'freed', at: freedAt.get(i) as number };
    if (dead.has(i)) return mode === 'counting' ? { kind: 'leaked' } : { kind: 'pending' };
    return { kind: 'live' };
  });
  return { heaps, fates };
}

/** Total cost of the count updates in a log under the toy model. */
export const updateCost = (updates: number, atomic: boolean): number => updates * (atomic ? ATOMIC_COST : PLAIN_COST);

/** Describe an operation as the tray prints it. */
export function describeOp(op: Op): string {
  switch (op.kind) {
    case 'new': return `${op.slot} = new`;
    case 'null': return `${op.slot} = null`;
    case 'copy': return `${op.to} = ${op.from}`;
    case 'setNext': return `${op.slot}.next = ${op.target}${op.weak ? ' (weak)' : ''}`;
    case 'clearNext': return `${op.slot}.next = null`;
    case 'collect': return 'collect';
  }
}

/** The script of the cycle: two objects pointing at each other, then both slots cleared. */
export const CYCLE_SCRIPT: readonly Op[] = [
  { kind: 'new', slot: 'a' },
  { kind: 'new', slot: 'b' },
  { kind: 'setNext', slot: 'a', target: 'b', weak: false },
  { kind: 'setNext', slot: 'b', target: 'a', weak: false },
  { kind: 'null', slot: 'a' },
  { kind: 'null', slot: 'b' },
];

/** The same script with the back edge weak: the cycle frees. */
export const WEAK_BACK_SCRIPT: readonly Op[] = CYCLE_SCRIPT.map((op, i) => (i === 3 ? { kind: 'setNext', slot: 'b', target: 'a', weak: true } : op));

/** Three objects in a chain held by one slot, then the slot cleared: a cascade. */
export const CHAIN_SCRIPT: readonly Op[] = [
  { kind: 'new', slot: 'a' },
  { kind: 'new', slot: 'b' },
  { kind: 'new', slot: 'c' },
  { kind: 'setNext', slot: 'a', target: 'b', weak: false },
  { kind: 'setNext', slot: 'b', target: 'c', weak: false },
  { kind: 'null', slot: 'b' },
  { kind: 'null', slot: 'c' },
  { kind: 'null', slot: 'a' },
];
