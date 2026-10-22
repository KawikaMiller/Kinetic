/**
 * The name-similarity check and the package-name field. Distances come from the shared Levenshtein table
 * (core/editDistance); the typed name is only ever compared as text, never fetched, installed or executed.
 */
import { editTable } from '../../core/editDistance';
import { PACKAGE_NAMES } from './registry';

/** The longest package name the field takes. */
export const MAX_NAME_CHARS = 40;
/** A name this close to a known one (but not equal) draws a warning. */
export const WARN_DISTANCE = 2;

/** The known package names: the fifteen in the graph and a few more popular invented ones. */
export const KNOWN_NAMES: readonly string[] = [...PACKAGE_NAMES, 'lib-alpha', 'lib-beta', 'date-fmt', 'array-tools', 'map-lite'];

const ALLOWED = /^[a-z0-9\-@/]*$/;

export type NameParse = { ok: true; value: string } | { ok: false; error: string };

/** A package name as typed: up to MAX_NAME_CHARS of [a-z0-9-@/], refused with the position that is wrong. */
export function parseName(text: string): NameParse {
  if (text.length > MAX_NAME_CHARS) return { ok: false, error: `Position ${MAX_NAME_CHARS + 1}: a package name is limited to ${MAX_NAME_CHARS} characters.` };
  const bad = [...text].findIndex((c) => !ALLOWED.test(c));
  if (bad >= 0) return { ok: false, error: `Position ${bad + 1}: only a-z, 0-9, -, @ and / are allowed in a package name here.` };
  return { ok: true, value: text };
}

export const distance = (a: string, b: string): number => {
  const t = editTable(a, b);
  return t.d[t.a.length][t.b.length];
};

export interface Similar {
  name: string;
  distance: number;
}

/** The known names ordered by distance to `name` (ties by name), nearest first. */
export function nearest(name: string, count = 3): Similar[] {
  return KNOWN_NAMES.map((k) => ({ name: k, distance: distance(name, k) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, count);
}

export type NameVerdict = { kind: 'empty' } | { kind: 'known' } | { kind: 'warn'; near: Similar } | { kind: 'unknown' };

/** Is this name a known one, a near miss of one, or unrelated? */
export function checkName(name: string): NameVerdict {
  if (name === '') return { kind: 'empty' };
  if (KNOWN_NAMES.includes(name)) return { kind: 'known' };
  const near = nearest(name, 1)[0];
  return near.distance <= WARN_DISTANCE ? { kind: 'warn', near } : { kind: 'unknown' };
}
