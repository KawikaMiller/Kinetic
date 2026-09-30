// A tiny model of JavaScript's memory for value vs reference semantics: named
// bindings in scopes, objects and arrays on a heap, and the operations the
// lesson's snippets perform. Pure and immutable: every op returns a new state,
// so a preset is a list of states the player can step through.

export type Prim = number | string | boolean;
export type Val = { kind: 'prim'; value: Prim } | { kind: 'ref'; id: string };

export interface HeapObj {
  id: string;
  /** 'object' prints `{ }`, 'array' prints `[ ]` and grows with push. */
  shape: 'object' | 'array';
  label: string;
  fields: { name: string; val: Val }[];
  /** Which heap column it's drawn in: top-level objects in 'a', nested ones in 'b'. */
  column: 'a' | 'b';
}

export interface Binding {
  id: string;
  name: string;
  scope: string;
  val: Val;
  isConst: boolean;
}

export interface Scope {
  id: string;
  label: string;
  alive: boolean;
}

export interface Mem {
  scopes: Scope[];
  bindings: Binding[];
  heap: HeapObj[];
  /** console.log output so far, formatted the way JavaScript prints it. */
  out: string[];
  /** Set when the last operation threw, e.g. assigning to a const. */
  error: string | null;
}

export const prim = (value: Prim): Val => ({ kind: 'prim', value });
export const ref = (id: string): Val => ({ kind: 'ref', id });

export const GLOBAL = 'global';

export function emptyMem(): Mem {
  return { scopes: [{ id: GLOBAL, label: 'global', alive: true }], bindings: [], heap: [], out: [], error: null };
}

const liveScopes = (m: Mem) => new Set(m.scopes.filter((s) => s.alive).map((s) => s.id));

/** The binding a name resolves to right now: the innermost live scope that declares it. */
export function lookup(m: Mem, name: string): Binding | undefined {
  const live = liveScopes(m);
  const order = m.scopes.filter((s) => live.has(s.id)).map((s) => s.id).reverse();
  for (const scope of order) {
    const b = m.bindings.find((x) => x.scope === scope && x.name === name);
    if (b) return b;
  }
  return undefined;
}

export const objectById = (m: Mem, id: string) => m.heap.find((o) => o.id === id);

function mustLookup(m: Mem, name: string): Binding {
  const b = lookup(m, name);
  if (!b) throw new Error(`model: ${name} is not declared`);
  return b;
}

function mustObject(m: Mem, id: string): HeapObj {
  const o = objectById(m, id);
  if (!o) throw new Error(`model: no heap object ${id}`);
  return o;
}

// ── Operations ───────────────────────────────────────────────────────

export function pushScope(m: Mem, id: string, label: string): Mem {
  return { ...m, error: null, scopes: [...m.scopes, { id, label, alive: true }] };
}

/** Return from a function: its scope dies, and so do its bindings. */
export function popScope(m: Mem, id: string): Mem {
  return { ...m, error: null, scopes: m.scopes.map((s) => (s.id === id ? { ...s, alive: false } : s)) };
}

export function declare(m: Mem, name: string, val: Val, o: { scope?: string; isConst?: boolean } = {}): Mem {
  const scope = o.scope ?? m.scopes.filter((s) => s.alive).at(-1)!.id;
  const binding: Binding = { id: `${scope}:${name}`, name, scope, val, isConst: o.isConst ?? false };
  return { ...m, error: null, bindings: [...m.bindings, binding] };
}

/** `name = val`. Assigning to a const doesn't change anything and records the TypeError JS throws. */
export function assign(m: Mem, name: string, val: Val): Mem {
  const b = mustLookup(m, name);
  if (b.isConst) return { ...m, error: 'TypeError: Assignment to constant variable.' };
  return { ...m, error: null, bindings: m.bindings.map((x) => (x.id === b.id ? { ...x, val } : x)) };
}

/** A fresh object or array literal on the heap; returns the new state and a reference to it. */
export function alloc(
  m: Mem,
  o: { id: string; label: string; shape?: HeapObj['shape']; fields: [string, Val][]; column?: HeapObj['column'] },
): [Mem, Val] {
  const obj: HeapObj = {
    id: o.id,
    label: o.label,
    shape: o.shape ?? 'object',
    fields: o.fields.map(([name, val]) => ({ name, val })),
    column: o.column ?? 'a',
  };
  return [{ ...m, error: null, heap: [...m.heap, obj] }, ref(o.id)];
}

function replaceObject(m: Mem, obj: HeapObj): Mem {
  return { ...m, error: null, heap: m.heap.map((o) => (o.id === obj.id ? obj : o)) };
}

/** `path.field = val`, where `path` evaluates to an object (e.g. 'b', 'p', 's.tags'). */
export function setField(m: Mem, path: string, field: string, val: Val): Mem {
  const target = evaluate(m, path);
  if (target.kind !== 'ref') throw new Error(`model: ${path} is not an object`);
  const obj = mustObject(m, target.id);
  const exists = obj.fields.some((f) => f.name === field);
  const fields = exists ? obj.fields.map((f) => (f.name === field ? { name: field, val } : f)) : [...obj.fields, { name: field, val }];
  return replaceObject(m, { ...obj, fields });
}

/** `path.push(val)` on an array. */
export function push(m: Mem, path: string, val: Val): Mem {
  const target = evaluate(m, path);
  if (target.kind !== 'ref') throw new Error(`model: ${path} is not an array`);
  const arr = mustObject(m, target.id);
  return replaceObject(m, { ...arr, fields: [...arr.fields, { name: String(arr.fields.length), val }] });
}

/** `{ ...path }`: a new object whose fields are copied one level deep; nested objects stay shared. */
export function spreadCopy(m: Mem, path: string, o: { id: string; label: string }): [Mem, Val] {
  const src = evaluate(m, path);
  if (src.kind !== 'ref') throw new Error(`model: ${path} is not an object`);
  const obj = mustObject(m, src.id);
  return alloc(m, { id: o.id, label: o.label, shape: obj.shape, fields: obj.fields.map((f) => [f.name, f.val]) });
}

/** `structuredClone(path)`: a deep copy; every nested object gets its own copy too (id + suffix). */
export function deepCopy(m: Mem, path: string, o: { suffix: string; label: string }): [Mem, Val] {
  const src = evaluate(m, path);
  if (src.kind !== 'ref') throw new Error(`model: ${path} is not an object`);
  let next = m;
  const copyOf = (id: string, label: string, column: HeapObj['column']): Val => {
    const obj = mustObject(m, id);
    const fields: [string, Val][] = obj.fields.map((f) => [
      f.name,
      f.val.kind === 'ref' ? copyOf(f.val.id, `${mustObject(m, f.val.id).label}′`, 'b') : f.val,
    ]);
    const [after, r] = alloc(next, { id: `${id}${o.suffix}`, label, shape: obj.shape, fields, column });
    next = after;
    return r;
  };
  const result = copyOf(src.id, o.label, 'a');
  return [next, result];
}

/** `console.log(...exprs)`: each expr is a path ('a.n', 'a.tags.length') or 'x === y'. */
export function log(m: Mem, ...exprs: string[]): Mem {
  return { ...m, error: null, out: [...m.out, exprs.map((e) => printed(m, e)).join(' ')] };
}

// ── Reading values ───────────────────────────────────────────────────

/** Evaluate a dotted path the way JS would: 'a', 'a.n', 's.tags', 'a.tags.length'. */
export function evaluate(m: Mem, path: string): Val {
  const [head, ...rest] = path.split('.');
  let v = mustLookup(m, head).val;
  for (const key of rest) {
    if (v.kind !== 'ref') throw new Error(`model: cannot read ${key} of a primitive`);
    const obj = mustObject(m, v.id);
    if (key === 'length' && obj.shape === 'array') {
      v = prim(obj.fields.length);
      continue;
    }
    const field = obj.fields.find((f) => f.name === key);
    if (!field) throw new Error(`model: ${path} is undefined`);
    v = field.val;
  }
  return v;
}

/** `a === b`: primitives compare by value, objects by identity. */
export function strictEquals(m: Mem, left: string, right: string): boolean {
  const a = evaluate(m, left);
  const b = evaluate(m, right);
  if (a.kind === 'prim' && b.kind === 'prim') return a.value === b.value;
  if (a.kind === 'ref' && b.kind === 'ref') return a.id === b.id;
  return false;
}

/** What console.log prints for an expression. Only primitives and comparisons are logged here. */
function printed(m: Mem, expr: string): string {
  const eq = expr.split('===').map((s) => s.trim());
  if (eq.length === 2) return String(strictEquals(m, eq[0], eq[1]));
  const v = evaluate(m, expr);
  if (v.kind === 'prim') return String(v.value);
  throw new Error(`model: logging object ${expr} isn't modelled`);
}

/** How a primitive is shown inside a box: strings keep their quotes. */
export const shown = (p: Prim) => (typeof p === 'string' ? `"${p}"` : String(p));

// ── Reachability ─────────────────────────────────────────────────────

const liveBindings = (m: Mem) => {
  const live = liveScopes(m);
  return m.bindings.filter((b) => live.has(b.scope));
};

/** Object ids reachable from `val` by following references (including itself). */
function reachableFrom(m: Mem, val: Val, seen = new Set<string>()): Set<string> {
  if (val.kind !== 'ref' || seen.has(val.id)) return seen;
  seen.add(val.id);
  for (const f of objectById(m, val.id)?.fields ?? []) reachableFrom(m, f.val, seen);
  return seen;
}

/** Heap objects no live binding can reach: garbage, waiting for the collector. */
export function unreachable(m: Mem): Set<string> {
  const reached = new Set<string>();
  for (const b of liveBindings(m)) reachableFrom(m, b.val, reached);
  return new Set(m.heap.filter((o) => !reached.has(o.id)).map((o) => o.id));
}

/** Ids of the live bindings that would see a change to object `id` (they reach it by some path). */
export function bindingsSeeing(m: Mem, id: string): string[] {
  return liveBindings(m)
    .filter((b) => reachableFrom(m, b.val).has(id))
    .map((b) => b.id);
}
