/**
 * quorums, scene 1: the learner picks write and read sets by hand and sees whether they overlap. The register is a version number on
 * each of N replicas; a write sets the chosen W replicas to the next version, a read polls the chosen R and returns the highest.
 */
import { alwaysOverlap, intersection } from './quorum';

export interface SetsState {
  n: number;
  w: number;
  r: number;
  /** Version held by each replica (0 = nothing written yet). */
  versions: number[];
  writeSet: number[];
  readSet: number[];
  /** Which set a press on a replica changes. */
  pick: 'write' | 'read';
  lastRead: { set: number[]; returned: number; latest: number } | null;
}

export const DEFAULT_SETS: SetsState = { n: 5, w: 3, r: 3, versions: [0, 0, 0, 0, 0], writeSet: [], readSet: [], pick: 'write', lastRead: null };

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Change N: the versions restart, sizes are clamped to N and the picked sets are cleared. */
export function withN(s: SetsState, n: number): SetsState {
  return { ...s, n, w: Math.min(s.w, n), r: Math.min(s.r, n), versions: new Array<number>(n).fill(0), writeSet: [], readSet: [], lastRead: null };
}

export const withSizes = (s: SetsState, w: number, r: number): SetsState => ({ ...s, w, r, writeSet: s.writeSet.slice(0, w), readSet: s.readSet.slice(0, r), lastRead: null });

/** Press a replica: add it to the set being picked, or remove it; a set cannot grow past its size. Returns the reason when refused. */
export function toggleMember(s: SetsState, replica: number): { state: SetsState } | { refused: string } {
  const key = s.pick === 'write' ? 'writeSet' : 'readSet';
  const size = s.pick === 'write' ? s.w : s.r;
  const set = s[key];
  if (set.includes(replica)) return { state: { ...s, [key]: set.filter((x) => x !== replica) } };
  if (set.length >= size) return { refused: `The ${s.pick} set already has ${size} ${size === 1 ? 'replica' : 'replicas'}: take one out first.` };
  return { state: { ...s, [key]: sorted([...set, replica]) } };
}

/** Why the write button is disabled, or null when it can run. */
export const writeBlocked = (s: SetsState): string | null =>
  s.writeSet.length === s.w ? null : `A write needs exactly W = ${s.w} replicas: ${s.writeSet.length} picked.`;
export const readBlocked = (s: SetsState): string | null =>
  s.readSet.length === s.r ? null : `A read needs exactly R = ${s.r} replicas: ${s.readSet.length} picked.`;

export const latestVersion = (s: SetsState): number => Math.max(0, ...s.versions);

export function write(s: SetsState): SetsState {
  const next = latestVersion(s) + 1;
  return { ...s, versions: s.versions.map((v, i) => (s.writeSet.includes(i) ? next : v)), lastRead: null };
}

export function read(s: SetsState): SetsState {
  const returned = Math.max(...s.readSet.map((i) => s.versions[i]));
  return { ...s, lastRead: { set: s.readSet, returned, latest: latestVersion(s) } };
}

/** The most recent write's set, for drawing the intersection: the replicas that hold the latest version. */
export const holdersOfLatest = (s: SetsState): number[] => s.versions.flatMap((v, i) => (v === latestVersion(s) && v > 0 ? [i] : []));

/** Two sets that miss each other, when R + W <= N lets any exist: the first W replicas for the write, the last R for the read. */
export function disjointSets(n: number, w: number, r: number): { writeSet: number[]; readSet: number[] } | null {
  if (alwaysOverlap({ n, w, r })) return null;
  return { writeSet: Array.from({ length: w }, (_, i) => i), readSet: Array.from({ length: r }, (_, i) => n - r + i) };
}

export const sharedNow = (s: SetsState): number[] => intersection(s.writeSet, s.readSet);
