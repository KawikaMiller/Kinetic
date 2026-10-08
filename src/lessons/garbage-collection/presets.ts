import type { Heap, Obj, Root } from './model';

export const SLOTS = 12;

const obj = (id: string, label: string, slot: number, fields: [string, string | null][] = []): Obj => ({
  id, label, slot, fields: fields.map(([name, to]) => ({ name, to })),
});

const ROOTS: Root[] = [
  { id: 'user', label: 'user', kind: 'stack', to: 'u' },
  { id: 'cart', label: 'cart', kind: 'stack', to: 'ct' },
  { id: 'config', label: 'config', kind: 'global', to: 'cf' },
  { id: 'rax', label: 'rax', kind: 'register', to: null },
];

const CORE: Obj[] = [
  obj('u', 'user', 0, [['profile', 'p'], ['orders', 'o']]),
  obj('p', 'profile', 1, [['avatar', 'av']]),
  obj('av', 'avatar', 2),
  obj('o', 'orders', 4, [['first', 'i1']]),
  obj('i1', 'item1', 5, [['next', 'i2']]),
  obj('i2', 'item2', 6, [['next', null]]),
  obj('ct', 'cart', 8, [['item', 'i2']]),
  obj('cf', 'config', 9, [['theme', 'th']]),
  obj('th', 'theme', 10),
];

export type PresetId = 'basic' | 'cycle' | 'fragment';

export const PRESETS: { id: PresetId; label: string; heap: Heap }[] = [
  {
    id: 'basic',
    label: 'Basic',
    heap: { slots: SLOTS, roots: ROOTS, objects: [...CORE, obj('tmp', 'temp', 3), obj('old', 'oldCart', 7, [['item', 'i1']])] },
  },
  {
    id: 'cycle',
    label: 'Unreachable cycle',
    heap: { slots: SLOTS, roots: ROOTS, objects: [...CORE, obj('a', 'node A', 3, [['next', 'b']]), obj('b', 'node B', 7, [['next', 'a']])] },
  },
  {
    id: 'fragment',
    label: 'Fragmented',
    heap: {
      slots: SLOTS,
      roots: ROOTS,
      objects: [...CORE, obj('t1', 'temp', 3), obj('t2', 'temp', 7), obj('t3', 'temp', 11)],
    },
  },
];

/* ---------- the generational scenario ---------- */

const young = (id: string, label: string, slot: number, fields: [string, string | null][] = []): Obj => ({ ...obj(id, label, slot, fields), gen: 'young', age: 0 });
const old = (id: string, label: string, slot: number, fields: [string, string | null][] = []): Obj => ({ ...obj(id, label, slot, fields), gen: 'old', age: 2 });

/** Young slots 0-5 (the nursery), old slots 6-11. */
export const NURSERY_SLOTS = 6;

export const GEN_START: Heap = {
  slots: SLOTS,
  roots: [
    { id: 'req', label: 'req', kind: 'stack', to: 'rq' },
    { id: 'cache', label: 'cache', kind: 'global', to: 'c' },
  ],
  objects: [
    young('rq', 'request', 0, [['body', 'bd']]),
    young('bd', 'body', 1),
    young('s1', 'temp string', 2),
    young('s2', 'temp array', 3),
    old('c', 'cache', 6, [['last', null], ['opts', 'cfg']]),
    old('cfg', 'settings', 7),
  ],
};
