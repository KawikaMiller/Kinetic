import type { Unit, Variant } from './code';

/**
 * Pure analysis of a code variant: the printed listing, the dependency edges read off the
 * code itself, and what a change request does (edited, added, must be re-tested).
 */

const INDENT = '  ';

export interface ListingLine {
  text: string;
  /** The unit this line belongs to (null for the blank line between units). */
  unit: string | null;
}

export function renderUnit(u: Unit): string[] {
  const body = u.kind === 'function' ? u.members[0].lines : u.members.flatMap((mem) => mem.lines);
  return [...(u.doc ? [u.doc] : []), `${u.head} {`, ...body.map((l) => INDENT + l), '}'];
}

/** The whole variant as one listing, units separated by a blank line. */
export function renderListing(v: Variant): ListingLine[] {
  return v.flatMap((u, i) => [...(i ? [{ text: '', unit: null }] : []), ...renderUnit(u).map((text) => ({ text, unit: u.name }))]);
}

export type EdgeKind = 'extends' | 'implements' | 'uses';
export interface DepEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

const mentions = (text: string, name: string) => new RegExp(`\\b${name}\\b`).test(text);

/**
 * Dependency edges from the code: `extends X` and `implements A, B` from the declaration,
 * and a "uses" edge for every other unit the code names (a type, a `new`, a call).
 */
export function dependencies(v: Variant): DepEdge[] {
  const names = v.map((u) => u.name);
  return v.flatMap((u) => {
    const ext = /\bextends (\w+)/.exec(u.head)?.[1];
    const impl = /\bimplements ([\w, ]+)/.exec(u.head)?.[1].split(',').map((s) => s.trim()) ?? [];
    const declared: DepEdge[] = [
      ...(ext && names.includes(ext) ? [{ from: u.name, to: ext, kind: 'extends' as const }] : []),
      ...impl.filter((n) => names.includes(n)).map((to) => ({ from: u.name, to, kind: 'implements' as const })),
    ];
    const text = renderUnit(u).filter((l) => l !== `${u.head} {`).join('\n');
    const used = names
      .filter((n) => n !== u.name && !declared.some((d) => d.to === n) && mentions(text, n))
      .map((to) => ({ from: u.name, to, kind: 'uses' as const }));
    return [...declared, ...used];
  });
}

export interface Impact {
  /** Existing units whose code the change edits. */
  edited: string[];
  /** New units the change adds. */
  added: string[];
  /** Units deleted by the change. */
  removed: string[];
  /** Unchanged units that depend directly on an edited one: re-test them. */
  retest: string[];
  /** Everything else. */
  untouched: string[];
}

const textOf = (u: Unit) => renderUnit(u).join('\n');

/** What a change request does, worked out by diffing the two variants unit by unit. */
export function impact(before: Variant, after: Variant): Impact {
  const old = new Map(before.map((u) => [u.name, u]));
  const now = new Set(after.map((u) => u.name));
  const edited = after.filter((u) => old.has(u.name) && textOf(old.get(u.name)!) !== textOf(u)).map((u) => u.name);
  const added = after.filter((u) => !old.has(u.name)).map((u) => u.name);
  const removed = before.filter((u) => !now.has(u.name)).map((u) => u.name);
  const changed = new Set([...edited, ...added]);
  const deps = dependencies(after);
  const retest = after
    .filter((u) => !changed.has(u.name) && deps.some((d) => d.from === u.name && edited.includes(d.to)))
    .map((u) => u.name);
  const untouched = after.filter((u) => !changed.has(u.name) && !retest.includes(u.name)).map((u) => u.name);
  return { edited, added, removed, retest, untouched };
}

/** Classes a change makes you touch: edit, add or re-test. */
export const touchedCount = (i: Impact) => i.edited.length + i.added.length + i.retest.length;

/** Lines of the after listing that are new or changed (per member: lines the old member didn't have). */
export function changedLines(before: Variant, after: Variant): Set<number> {
  const old = new Map(before.map((u) => [u.name, u]));
  const out = new Set<number>();
  let i = 0;
  after.forEach((u, k) => {
    if (k) i++; // the blank line
    const prev = old.get(u.name);
    const prevLines = new Set(prev ? renderUnit(prev) : []);
    for (const line of renderUnit(u)) {
      if (!prevLines.has(line)) out.add(i);
      i++;
    }
  });
  return out;
}

/** Methods that only throw "not supported": stubs a fat interface forces on a class. */
export const stubCount = (v: Variant, unit: string) =>
  v.find((u) => u.name === unit)?.members.filter((mem) => mem.lines.some((l) => l.includes("'not supported'"))).length ?? 0;
