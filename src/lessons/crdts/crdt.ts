// State-based CRDTs (G-Counter, OR-Set, LWW-Register) next to the naive
// "whatever arrives last overwrites me" merge they replace.

import { TOKENS } from '../../core/palette';

export type Rid = 'A' | 'B' | 'C';
export const RIDS: Rid[] = ['A', 'B', 'C'];
export type Kind = 'counter' | 'set' | 'register';
export type Mode = 'crdt' | 'naive';

export const ITEMS = ['🍎', '🍌', '🍇', '🥝'];
/** Register values. Hex, not var(), because motion interpolates the swatch colour. */
export const COLORS = [TOKENS.info, TOKENS.pink, TOKENS.ok, TOKENS.amber];

export interface Tagged {
  e: string;
  tag: string;
}

export interface Rep {
  /** Lamport clock: bumped on every local op, max'ed on merge. */
  clock: number;
  // G-Counter: one slot per replica, each only ever incremented by its owner.
  vec: Record<Rid, number>;
  // naive counter: one plain number
  n: number;
  // OR-Set: every add gets a unique tag; a remove tombstones the tags it has seen.
  adds: Tagged[];
  removed: string[];
  // naive set
  items: string[];
  // LWW-Register: value with (timestamp, replica) for a total order
  reg: { v: string; ts: number; by: Rid } | null;
  // naive register
  plain: string | null;
}

export const emptyRep = (): Rep => ({
  clock: 0, vec: { A: 0, B: 0, C: 0 }, n: 0, adds: [], removed: [], items: [], reg: null, plain: null,
});

export function inc(s: Rep, r: Rid): Rep {
  return { ...s, clock: s.clock + 1, vec: { ...s.vec, [r]: s.vec[r] + 1 }, n: s.n + 1 };
}

export function add(s: Rep, r: Rid, e: string): Rep {
  const clock = s.clock + 1;
  return {
    ...s, clock,
    adds: [...s.adds, { e, tag: `${r}${clock}` }],
    items: s.items.includes(e) ? s.items : [...s.items, e],
  };
}

export function remove(s: Rep, e: string): Rep {
  const seen = s.adds.filter((a) => a.e === e && !s.removed.includes(a.tag)).map((a) => a.tag);
  return { ...s, clock: s.clock + 1, removed: [...s.removed, ...seen], items: s.items.filter((x) => x !== e) };
}

export function setReg(s: Rep, r: Rid, v: string): Rep {
  const clock = s.clock + 1;
  return { ...s, clock, reg: { v, ts: clock, by: r }, plain: v };
}

const lwwWins = (a: Rep['reg'], b: Rep['reg']) => {
  if (!a) return b;
  if (!b) return a;
  if (a.ts !== b.ts) return a.ts > b.ts ? a : b;
  return a.by > b.by ? a : b; // deterministic tie-break on replica id
};

/** Merge `incoming` into `local`. CRDT merges are commutative, associative and idempotent. */
export function merge(local: Rep, incoming: Rep, kind: Kind, mode: Mode): Rep {
  const clock = Math.max(local.clock, incoming.clock);
  if (kind === 'counter') {
    return mode === 'crdt'
      ? { ...local, clock, vec: { A: Math.max(local.vec.A, incoming.vec.A), B: Math.max(local.vec.B, incoming.vec.B), C: Math.max(local.vec.C, incoming.vec.C) } }
      : { ...local, clock, n: incoming.n };
  }
  if (kind === 'set') {
    if (mode === 'naive') return { ...local, clock, items: incoming.items.slice() };
    const tags = new Set(local.adds.map((a) => a.tag));
    return {
      ...local, clock,
      adds: [...local.adds, ...incoming.adds.filter((a) => !tags.has(a.tag))],
      removed: [...new Set([...local.removed, ...incoming.removed])],
    };
  }
  return mode === 'crdt' ? { ...local, clock, reg: lwwWins(local.reg, incoming.reg) } : { ...local, clock, plain: incoming.plain };
}

export function setValue(s: Rep, mode: Mode): string[] {
  if (mode === 'naive') return s.items.slice().sort();
  return [...new Set(s.adds.filter((a) => !s.removed.includes(a.tag)).map((a) => a.e))].sort();
}

/** The user-visible value, as a comparable string. */
export function valueKey(s: Rep, kind: Kind, mode: Mode): string {
  if (kind === 'counter') return String(mode === 'crdt' ? s.vec.A + s.vec.B + s.vec.C : s.n);
  if (kind === 'set') return setValue(s, mode).join(',');
  return String(mode === 'crdt' ? s.reg?.v ?? '' : s.plain ?? '');
}
