// A small model of a program's memory: a call stack of frames holding locals,
// and a heap of blocks. Two regimes:
//   managed (JavaScript/Java): blocks live while reachable; unreachable ones become collectable.
//   manual (C): blocks live until free(); nobody collects a block you lost track of (a leak).
// Pure and immutable: every op returns a new world, so a preset is a list of worlds.

export type Mode = 'managed' | 'manual';

export type Pointer = { kind: 'heap'; block: string } | { kind: 'stack'; frame: string; slot: string };
export type Value = { kind: 'prim'; text: string } | { kind: 'ptr'; to: Pointer } | { kind: 'null' } | { kind: 'unset' };

export interface Slot {
  name: string;
  value: Value;
}

export interface StackFrame {
  id: string;
  fn: string;
  slots: Slot[];
  /** Returned. Kept around only so a dangling pointer has something to point at. */
  popped: boolean;
}

export interface Block {
  id: string;
  label: string;
  fields: { name: string; text: string }[];
  freed: boolean;
}

export interface World {
  mode: Mode;
  /** Bottom first. Popped frames stay in the list, flagged. */
  stack: StackFrame[];
  heap: Block[];
  /** What went wrong on the last step (use-after-free, stack overflow…). */
  error: string | null;
  crashed: boolean;
}

export const prim = (text: string | number): Value => ({ kind: 'prim', text: String(text) });
export const toBlock = (block: string): Value => ({ kind: 'ptr', to: { kind: 'heap', block } });
export const toSlot = (frame: string, slot: string): Value => ({ kind: 'ptr', to: { kind: 'stack', frame, slot } });
export const NULL: Value = { kind: 'null' };
export const UNSET: Value = { kind: 'unset' };

export const emptyWorld = (mode: Mode): World => ({ mode, stack: [], heap: [], error: null, crashed: false });

export const liveFrames = (w: World) => w.stack.filter((f) => !f.popped);
export const topFrame = (w: World) => liveFrames(w).at(-1);
export const blockById = (w: World, id: string) => w.heap.find((b) => b.id === id);

function withTop(w: World, change: (f: StackFrame) => StackFrame): World {
  const top = topFrame(w);
  if (!top) throw new Error('model: no running frame');
  return { ...w, error: null, stack: w.stack.map((f) => (f.id === top.id ? change(f) : f)) };
}

function slotOf(w: World, name: string): Slot {
  const s = topFrame(w)?.slots.find((x) => x.name === name);
  if (!s) throw new Error(`model: no local ${name} in the running frame`);
  return s;
}

// ── Operations ───────────────────────────────────────────────────────

/** Call a function: push a frame with its parameters and (not yet assigned) locals. */
export function call(w: World, id: string, fn: string, slots: [string, Value][]): World {
  const frame: StackFrame = { id, fn, slots: slots.map(([name, value]) => ({ name, value })), popped: false };
  return { ...w, error: null, stack: [...w.stack, frame] };
}

/** Return from the running function: its frame and every local in it die. */
export function ret(w: World): World {
  const top = topFrame(w);
  if (!top) throw new Error('model: nothing to return from');
  return { ...w, error: null, stack: w.stack.map((f) => (f.id === top.id ? { ...f, popped: true } : f)) };
}

/** `name = value` for a local of the running frame. */
export function set(w: World, name: string, value: Value): World {
  slotOf(w, name);
  return withTop(w, (f) => ({ ...f, slots: f.slots.map((s) => (s.name === name ? { ...s, value } : s)) }));
}

/** Allocate a heap block (`malloc`, or an object literal) and return a pointer to it. */
export function allocate(w: World, block: Omit<Block, 'freed'>): [World, Value] {
  return [{ ...w, error: null, heap: [...w.heap, { ...block, freed: false }] }, toBlock(block.id)];
}

/** `free(name)`: the block the local points at is handed back. The pointer itself still holds the address. */
export function free(w: World, name: string): World {
  const v = slotOf(w, name).value;
  if (v.kind !== 'ptr' || v.to.kind !== 'heap') throw new Error(`model: ${name} doesn't point at a heap block`);
  const id = v.to.block;
  return { ...w, error: null, heap: w.heap.map((b) => (b.id === id ? { ...b, freed: true } : b)) };
}

/**
 * `*name = text` / `name->field = text`: write through a pointer. C doesn't stop you
 * writing into freed memory: the write lands, and the error records that it was
 * undefined behaviour.
 */
export function writeThrough(w: World, name: string, field: string, text: string): World {
  const v = slotOf(w, name).value;
  if (v.kind !== 'ptr') throw new Error(`model: ${name} is not a pointer`);
  if (v.to.kind !== 'heap') throw new Error('model: writing through a pointer into the stack is not modelled');
  const id = v.to.block;
  return {
    ...w,
    error: pointerProblem(w, v.to),
    heap: w.heap.map((b) => (b.id === id ? { ...b, fields: b.fields.map((f) => (f.name === field ? { ...f, text } : f)) } : b)),
  };
}

/** `*name`: read through a pointer (printf). Reading freed or dead memory is an error; the world is unchanged. */
export function readThrough(w: World, name: string): World {
  const v = slotOf(w, name).value;
  if (v.kind !== 'ptr') throw new Error(`model: ${name} is not a pointer`);
  return { ...w, error: pointerProblem(w, v.to) };
}

/** The stack can't grow past `limit` frames: the next call crashes the program. */
export function overflow(w: World): World {
  return { ...w, error: 'RangeError: Maximum call stack size exceeded', crashed: true };
}

// ── Derived facts ────────────────────────────────────────────────────

/** Why dereferencing this pointer is undefined behaviour, or null if it's fine. */
export function pointerProblem(w: World, p: Pointer): string | null {
  if (p.kind === 'heap') return blockById(w, p.block)?.freed ? 'use-after-free: the block was already freed' : null;
  const frame = w.stack.find((f) => f.id === p.frame);
  return !frame || frame.popped ? 'dangling pointer: that frame has returned' : null;
}

/** A live local whose pointer targets freed memory or a popped frame. */
export function isDangling(w: World, frameId: string, slotName: string): boolean {
  const frame = w.stack.find((f) => f.id === frameId);
  const slot = frame?.slots.find((s) => s.name === slotName);
  return !!frame && !frame.popped && slot?.value.kind === 'ptr' && pointerProblem(w, slot.value.to) !== null;
}

/** Heap blocks some live local points at. */
function referenced(w: World): Set<string> {
  const ids = new Set<string>();
  for (const f of liveFrames(w)) for (const s of f.slots) if (s.value.kind === 'ptr' && s.value.to.kind === 'heap') ids.add(s.value.to.block);
  return ids;
}

/** Managed memory: blocks no live frame can reach. The garbage collector may reclaim them. */
export function collectable(w: World): Set<string> {
  if (w.mode !== 'managed') return new Set();
  const refs = referenced(w);
  return new Set(w.heap.filter((b) => !refs.has(b.id)).map((b) => b.id));
}

/** Manual memory: blocks never freed and no longer reachable. Nobody can free them now: a leak. */
export function leaked(w: World): Set<string> {
  if (w.mode !== 'manual') return new Set();
  const refs = referenced(w);
  return new Set(w.heap.filter((b) => !b.freed && !refs.has(b.id)).map((b) => b.id));
}

/** Popped frames still worth drawing: something live points into them. */
export function ghostFrames(w: World): Set<string> {
  const ids = new Set<string>();
  for (const f of liveFrames(w)) {
    for (const s of f.slots) if (s.value.kind === 'ptr' && s.value.to.kind === 'stack') ids.add(s.value.to.frame);
  }
  return new Set(w.stack.filter((f) => f.popped && ids.has(f.id)).map((f) => f.id));
}
