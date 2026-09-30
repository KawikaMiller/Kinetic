// Pure logic for sets-functions: set operations and classifying a mapping.
import { hash32 } from '../../core/hash';

// ── Sets ─────────────────────────────────────────────────────────────

export type SetName = 'A' | 'B' | 'C';
export type Op = 'union' | 'intersection' | 'difference' | 'symmetric' | 'union3' | 'intersection3';

export const OP_INFO: Record<Op, { symbol: string; sql: string; needsC?: boolean }> = {
  union: { symbol: 'A ∪ B', sql: 'A UNION B' },
  intersection: { symbol: 'A ∩ B', sql: 'A INTERSECT B (the keys an INNER JOIN matches)' },
  difference: { symbol: 'A − B', sql: 'A EXCEPT B' },
  symmetric: { symbol: 'A △ B', sql: '(A EXCEPT B) UNION (B EXCEPT A)' },
  union3: { symbol: 'A ∪ B ∪ C', sql: 'A UNION B UNION C', needsC: true },
  intersection3: { symbol: 'A ∩ B ∩ C', sql: 'A INTERSECT B INTERSECT C', needsC: true },
};

/** Which sets an element belongs to. */
export type Membership = Record<SetName, boolean>;

/** Is an element with this membership inside the result of `op`? */
export function inResult(op: Op, m: Membership): boolean {
  switch (op) {
    case 'union':
      return m.A || m.B;
    case 'intersection':
      return m.A && m.B;
    case 'difference':
      return m.A && !m.B;
    case 'symmetric':
      return m.A !== m.B;
    case 'union3':
      return m.A || m.B || m.C;
    case 'intersection3':
      return m.A && m.B && m.C;
  }
}

/** Parse "ada, grace linus" into a list of distinct members, in the order written. */
export function parseMembers(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,]+/)) {
    const v = raw.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

/** Every element that appears in any set, first-seen order, with its membership. */
export function universe(sets: Record<SetName, readonly string[]>): { name: string; m: Membership }[] {
  const order: string[] = [];
  for (const s of ['A', 'B', 'C'] as SetName[]) for (const e of sets[s]) if (!order.includes(e)) order.push(e);
  return order.map((name) => ({ name, m: { A: sets.A.includes(name), B: sets.B.includes(name), C: sets.C.includes(name) } }));
}

export function applyOp(op: Op, sets: Record<SetName, readonly string[]>): string[] {
  return universe(sets)
    .filter((e) => inResult(op, e.m))
    .map((e) => e.name);
}

/** Put an element into exactly the sets in `m`, keeping every set's order. */
export function moveElement(sets: Record<SetName, string[]>, name: string, m: Membership): Record<SetName, string[]> {
  const next = { A: [...sets.A], B: [...sets.B], C: [...sets.C] };
  for (const s of ['A', 'B', 'C'] as SetName[]) {
    const has = next[s].includes(name);
    if (m[s] && !has) next[s].push(name);
    if (!m[s] && has) next[s] = next[s].filter((x) => x !== name);
  }
  return next;
}

// ── Functions ────────────────────────────────────────────────────────

/** An arrow from domain index `from` to codomain index `to`. */
export interface Arrow {
  from: number;
  to: number;
}

export type Kind = 'not-a-function' | 'function' | 'injective' | 'surjective' | 'bijective';

export interface Classification {
  kind: Kind;
  /** Every input has exactly one arrow. */
  isFunction: boolean;
  /** Inputs with no arrow (not total). */
  missing: number[];
  /** Inputs with two or more arrows (not single-valued). */
  multi: number[];
  /** Outputs hit by two or more inputs (not injective). */
  collisions: number[];
  /** Outputs nothing maps to (not surjective). */
  unused: number[];
  injective: boolean;
  surjective: boolean;
}

export function classify(domainSize: number, codomainSize: number, arrows: readonly Arrow[]): Classification {
  const outCount = Array.from({ length: domainSize }, () => 0);
  const inCount = Array.from({ length: codomainSize }, () => 0);
  for (const a of arrows) {
    outCount[a.from]++;
    inCount[a.to]++;
  }
  const missing = outCount.flatMap((n, i) => (n === 0 ? [i] : []));
  const multi = outCount.flatMap((n, i) => (n > 1 ? [i] : []));
  const isFunction = missing.length === 0 && multi.length === 0;
  const collisions = inCount.flatMap((n, i) => (n > 1 ? [i] : []));
  const unused = inCount.flatMap((n, i) => (n === 0 ? [i] : []));
  const injective = isFunction && collisions.length === 0;
  const surjective = isFunction && unused.length === 0;
  const kind: Kind = !isFunction ? 'not-a-function' : injective && surjective ? 'bijective' : injective ? 'injective' : surjective ? 'surjective' : 'function';
  return { kind, isFunction, missing, multi, collisions, unused, injective, surjective };
}

/** Toggle one arrow on or off. */
export function toggleArrow(arrows: readonly Arrow[], a: Arrow): Arrow[] {
  const has = arrows.some((x) => x.from === a.from && x.to === a.to);
  return has ? arrows.filter((x) => !(x.from === a.from && x.to === a.to)) : [...arrows, a];
}

/** The pigeonhole limits that follow from the sizes alone. */
export function cardinalityLimits(domainSize: number, codomainSize: number) {
  return { injectionPossible: domainSize <= codomainSize, surjectionPossible: domainSize >= codomainSize };
}

export const BUCKETS = 8;

/** Which of BUCKETS a string hashes into: the same hash the storage lessons use. */
export const bucketOf = (s: string) => hash32(s) % BUCKETS;

export interface MappingPreset {
  id: string;
  label: string;
  domainLabel: string;
  codomainLabel: string;
  domain: string[];
  codomain: string[];
  arrows: Arrow[];
}

const USERS = ['ada', 'grace', 'linus', 'alan'];
const WORDS = ['apple', 'pear', 'fig', 'kiwi', 'plum', 'lime', 'date', 'melon', 'grape', 'mango'];
const PEOPLE = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
const DAYS = ['3 Jan', '14 Feb', '1 Apr', '9 Jul', '25 Dec', '31 Oct'];

export const MAPPINGS: readonly MappingPreset[] = [
  {
    id: 'ids', label: 'user → id', domainLabel: 'users', codomainLabel: 'ids', domain: USERS, codomain: ['#1', '#2', '#3', '#4'],
    arrows: USERS.map((_, i) => ({ from: i, to: i })),
  },
  {
    id: 'hash', label: `string → hash bucket (${BUCKETS})`, domainLabel: 'strings', codomainLabel: 'buckets', domain: WORDS,
    codomain: Array.from({ length: BUCKETS }, (_, i) => `b${i}`), arrows: WORDS.map((w, i) => ({ from: i, to: bucketOf(w) })),
  },
  {
    id: 'birthday', label: 'person → birthday', domainLabel: 'people', codomainLabel: 'dates', domain: PEOPLE, codomain: DAYS,
    arrows: [{ from: 0, to: 0 }, { from: 1, to: 2 }, { from: 2, to: 4 }, { from: 3, to: 2 }, { from: 4, to: 5 }],
  },
  { id: 'blank', label: 'Draw your own', domainLabel: 'A', codomainLabel: 'B', domain: ['1', '2', '3', '4'], codomain: ['a', 'b', 'c', 'd'], arrows: [] },
];

export const SET_PRESETS = {
  A: ['ada', 'grace', 'linus', 'alan'],
  B: ['grace', 'alan', 'barbara', 'ken'],
  C: ['linus', 'ken', 'grace', 'margaret'],
};
