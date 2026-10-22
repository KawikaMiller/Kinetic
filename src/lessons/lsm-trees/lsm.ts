import { fnv1a } from '../../core/hash';
import { mulberry32, pick, type Rnd } from '../../core/random';

export const MEM_CAP = 4;
export const L0_TRIGGER = 3;
export const L1_FILE = 6;
export const BLOOM_BITS = 16;
export const KEYS = 'abcdefghijkl'.split('');
export const MISSING = 'mnopqrstuvwxyz'.split('');

export interface Entry {
  k: string;
  /** null = tombstone (a delete marker) */
  v: number | null;
  seq: number;
}

export interface SST {
  id: number;
  entries: Entry[];
  bloom: number;
}

export interface Lsm {
  wal: Entry[];
  mem: Entry[];
  /** newest first; files may overlap each other */
  l0: SST[];
  /** sorted by key; files never overlap */
  l1: SST[];
  seq: number;
  nextId: number;
  userWrites: number;
  /** entries written to disk: WAL appends + flushes + compaction output */
  diskWrites: number;
}

export type Probe = 'skip' | 'read' | 'hit' | 'fp' | 'range';

export interface Dropped {
  e: Entry;
  why: 'overwritten' | 'tombstone';
}

export const bloomBits = (k: string) => [fnv1a(k) % BLOOM_BITS, fnv1a(`${k}#salt`) % BLOOM_BITS];
const bloomOf = (entries: Entry[]) => entries.reduce((m, e) => bloomBits(e.k).reduce((mm, b) => mm | (1 << b), m), 0);
export const bloomMaybe = (t: SST, k: string) => bloomBits(k).every((b) => (t.bloom >> b) & 1);

const sortEntries = (es: Entry[]) => es.slice().sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

export const diskEntries = (s: Lsm) => [...s.l0, ...s.l1].reduce((n, t) => n + t.entries.length, 0);

/** Entries held anywhere: the memtable plus every file. Each live key has at least one, so this is never below the live-key count. */
export const storedEntries = (s: Lsm) => s.mem.length + diskEntries(s);

/** The newest entry of every key in `entries`. */
function newestByKey(entries: Entry[]): Map<string, Entry> {
  const newest = new Map<string, Entry>();
  for (const e of entries) {
    const cur = newest.get(e.k);
    if (!cur || e.seq > cur.seq) newest.set(e.k, e);
  }
  return newest;
}

export function liveKeys(s: Lsm) {
  const all = [...s.mem, ...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)];
  return [...newestByKey(all).values()].filter((e) => e.v !== null).map((e) => e.k);
}

/** The most recently deleted key whose tombstone is still stored (compaction removes tombstones), or undefined. */
export function lastDeletedKey(s: Lsm): string | undefined {
  const all = [...s.mem, ...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)];
  const tombs = [...newestByKey(all).values()].filter((e) => e.v === null);
  return tombs.sort((a, b) => b.seq - a.seq)[0]?.k;
}

/** The live key written most recently (the one an overwrite just touched), or undefined when nothing is live. */
export function lastWrittenKey(s: Lsm): string | undefined {
  const all = [...s.mem, ...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)];
  const live = [...newestByKey(all).values()].filter((e) => e.v !== null);
  return live.sort((a, b) => b.seq - a.seq)[0]?.k;
}

/** Space amplification: entries stored (memtable + files) per live key; 1x means no dead copies. 0 when nothing is live. */
export function spaceAmp(s: Lsm): number {
  const live = liveKeys(s).length;
  return live ? storedEntries(s) / live : 0;
}

export function emptyLsm(): Lsm {
  return { wal: [], mem: [], l0: [], l1: [], seq: 0, nextId: 1, userWrites: 0, diskWrites: 0 };
}

/** The entry the next write of `k` produces: a value is its own sequence number, a delete is a tombstone. */
export const nextEntry = (s: Lsm, k: string, del: boolean): Entry => ({ k, v: del ? null : s.seq + 1, seq: s.seq + 1 });

/** Step 1 of a write: append to the write-ahead log. */
export const appendWal = (s: Lsm, e: Entry): Lsm => ({
  ...s, wal: [...s.wal, e], seq: e.seq, userWrites: s.userWrites + 1, diskWrites: s.diskWrites + 1,
});

/** Step 2 of a write: insert into the sorted memtable, replacing the same key. */
export const insertMem = (s: Lsm, e: Entry): Lsm => ({ ...s, mem: sortEntries([...s.mem.filter((x) => x.k !== e.k), e]) });

/** The memtable becomes the newest L0 file and the WAL is thrown away. */
export function flushMem(s: Lsm): { s: Lsm; sst: SST } {
  const entries = sortEntries(s.mem);
  const sst: SST = { id: s.nextId, entries, bloom: bloomOf(entries) };
  return {
    sst,
    s: { ...s, l0: [sst, ...s.l0], mem: [], wal: [], nextId: s.nextId + 1, diskWrites: s.diskWrites + entries.length },
  };
}

export interface Compaction {
  s: Lsm;
  /** Ids of the files merged away. */
  merged: number[];
  dropped: Dropped[];
  /** Entries read from the merged files, and entries written to the new L1 run. */
  inCount: number;
  outCount: number;
}

/** Merge every L0 file and L1 into one sorted L1 run: keep the newest version of each key. */
export function compactAll(s: Lsm): Compaction {
  const all = [...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)];
  const newest = newestByKey(all);
  const dropped: Dropped[] = all.filter((e) => newest.get(e.k) !== e).map((e) => ({ e, why: 'overwritten' }));
  const kept: Entry[] = [];
  for (const e of newest.values()) {
    // L1 is the bottom level here, so a tombstone has nothing older left to hide: drop it.
    // A real engine keeps it until it reaches the bottom or every older version is gone.
    if (e.v === null) dropped.push({ e, why: 'tombstone' });
    else kept.push(e);
  }
  const out = sortEntries(kept);
  let id = s.nextId;
  const l1: SST[] = [];
  for (let i = 0; i < out.length; i += L1_FILE) {
    const entries = out.slice(i, i + L1_FILE);
    l1.push({ id: id++, entries, bloom: bloomOf(entries) });
  }
  return {
    s: { ...s, l0: [], l1, nextId: id, diskWrites: s.diskWrites + out.length },
    merged: [...s.l0, ...s.l1].map((t) => t.id),
    dropped,
    inCount: all.length,
    outCount: out.length,
  };
}

/** One whole PUT or DELETE with its flush and compaction, the same steps the frames show. */
export function write(s0: Lsm, k: string, del: boolean): Lsm {
  const e = nextEntry(s0, k, del);
  let s = insertMem(appendWal(s0, e), e);
  if (s.mem.length >= MEM_CAP) s = flushMem(s).s;
  if (s.l0.length >= L0_TRIGGER) s = compactAll(s).s;
  return s;
}

/** What one step of a read looked at. */
export type ReadStep =
  | { kind: 'mem'; hit: Entry | undefined }
  | { kind: 'bloom'; level: 'L0' | 'L1'; sst: SST; bits: number[]; outcome: 'skip' | 'hit' | 'fp'; hit: Entry | undefined }
  | { kind: 'range'; covering: SST | undefined; ruledOut: SST[] };

export interface ReadPath {
  steps: ReadStep[];
  /** The newest entry found, or undefined when no layer holds the key. */
  found: Entry | undefined;
  /** Where it was found: 'the memtable', 'L0 SST 7', and so on. */
  where: string | null;
  /** Files actually read, and files skipped by their bloom filter. */
  read: number;
  skipped: number;
}

/** A GET, newest layer first, recording each probe. The frames and the tests both read this. */
export function readPath(s: Lsm, k: string): ReadPath {
  const steps: ReadStep[] = [];
  let read = 0;
  let skipped = 0;
  const done = (found: Entry | undefined, where: string | null): ReadPath => ({ steps, found, where, read, skipped });

  const m = s.mem.find((e) => e.k === k);
  steps.push({ kind: 'mem', hit: m });
  if (m) return done(m, 'the memtable');

  const probe = (t: SST, level: 'L0' | 'L1'): Entry | undefined => {
    const bits = bloomBits(k);
    if (!bloomMaybe(t, k)) {
      skipped++;
      steps.push({ kind: 'bloom', level, sst: t, bits, outcome: 'skip', hit: undefined });
      return undefined;
    }
    read++;
    const hit = t.entries.find((e) => e.k === k);
    steps.push({ kind: 'bloom', level, sst: t, bits, outcome: hit ? 'hit' : 'fp', hit });
    return hit;
  };

  for (const t of s.l0) {
    const hit = probe(t, 'L0');
    if (hit) return done(hit, `L0 SST ${t.id}`);
  }
  if (s.l1.length) {
    const covering = s.l1.find((t) => k >= t.entries[0].k && k <= t.entries[t.entries.length - 1].k);
    steps.push({ kind: 'range', covering, ruledOut: s.l1.filter((t) => t !== covering) });
    if (covering) {
      const hit = probe(covering, 'L1');
      if (hit) return done(hit, `L1 SST ${covering.id}`);
    }
  }
  return done(undefined, null);
}

/** The value a GET returns: undefined for a missing or deleted key. */
export const lookup = (s: Lsm, k: string): number | undefined => readPath(s, k).found?.v ?? undefined;

/** The warm-up the stage starts from: every layer holds data, one key is deleted and one overwritten. */
export const WARM_UP: readonly [string, boolean][] = [
  ['a', false], ['c', false], ['f', false], ['h', false],
  ['b', false], ['c', false], ['j', false], ['e', false],
  ['k', false], ['a', false], ['d', false], ['g', false],
  ['f', true], ['i', false], ['c', false], ['l', false],
  ['b', false], ['h', true],
];

/** Deterministic warm-up so the stage starts with data in every layer. */
export function seeded(): Lsm {
  return WARM_UP.reduce((s, [k, del]) => write(s, k, del), emptyLsm());
}

export type Action = 'put' | 'overwrite' | 'delete' | 'get-existing' | 'get-missing';

/** The seed the stage opens with. */
export const DEFAULT_SEED = 7;
/** Added to the seed per action, so action n draws from its own stream and the nth press is the same on every run. */
const ACTION_STRIDE = 0x9e3779b1;

/** The random source of the `step`-th action under `seed`. */
export const actionRnd = (seed: number, step: number): Rnd => mulberry32(seed + step * ACTION_STRIDE);

/** The key an action works on: any key for PUT, live keys for overwrite, delete and existing GET, never-written keys for missing GET. */
export function actionKey(action: Action, live: readonly string[], rnd: Rnd): string {
  switch (action) {
    case 'put': return pick(KEYS, rnd);
    case 'get-missing': return pick(MISSING, rnd);
    default: return pick(live.length ? live : KEYS, rnd);
  }
}
