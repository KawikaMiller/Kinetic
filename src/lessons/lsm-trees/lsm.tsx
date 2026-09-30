import type { ReactNode } from 'react';
import { fnv1a } from '../../core/hash';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';

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

export interface LsmFrame extends Frame {
  s: Lsm;
  hot: 'wal' | 'mem' | number | null;
  hotKey: string | null;
  probes: Record<number, Probe>;
  bloomCheck: { id: number; bits: number[] } | null;
  memProbe: 'hit' | 'miss' | null;
  compacting: number[];
  dropped: { e: Entry; why: string }[];
  lastRead: { read: number; skipped: number } | null;
}

export const bloomBits = (k: string) => [fnv1a(k) % BLOOM_BITS, fnv1a(`${k}#salt`) % BLOOM_BITS];
const bloomOf = (entries: Entry[]) => entries.reduce((m, e) => bloomBits(e.k).reduce((mm, b) => mm | (1 << b), m), 0);
export const bloomMaybe = (t: SST, k: string) => bloomBits(k).every((b) => (t.bloom >> b) & 1);

const sortEntries = (es: Entry[]) => es.slice().sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

export const diskEntries = (s: Lsm) => [...s.l0, ...s.l1].reduce((n, t) => n + t.entries.length, 0);

export function liveKeys(s: Lsm) {
  const newest = new Map<string, Entry>();
  for (const e of [...s.mem, ...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)]) {
    const cur = newest.get(e.k);
    if (!cur || e.seq > cur.seq) newest.set(e.k, e);
  }
  return [...newest.values()].filter((e) => e.v !== null).map((e) => e.k);
}

export function emptyLsm(): Lsm {
  return { wal: [], mem: [], l0: [], l1: [], seq: 0, nextId: 1, userWrites: 0, diskWrites: 0 };
}

/** A frame showing `s` with nothing highlighted. */
export function blankState(s: Lsm): Omit<LsmFrame, 'say' | 'hold'> {
  return { s, hot: null, hotKey: null, probes: {}, bloomCheck: null, memProbe: null, compacting: [], dropped: [], lastRead: null };
}

function recorder(s0: Lsm) {
  const r = createRecorder<LsmFrame>(blankState(s0));
  /** Patch the tree itself (the frame's nested `s`). */
  const state = (p: Partial<Lsm>) => r.set({ s: { ...r.get().s, ...p } });
  return { ...r, state };
}

type Rec = ReturnType<typeof recorder>;

const tombCount = (dropped: { why: string }[]) => dropped.filter((d) => d.why === 'tombstone').length;

function flush(r: Rec) {
  const s = r.get().s;
  const entries = sortEntries(s.mem);
  const t: SST = { id: s.nextId, entries, bloom: bloomOf(entries) };
  r.state({ l0: [t, ...s.l0], mem: [], wal: [], nextId: s.nextId + 1, diskWrites: s.diskWrites + entries.length });
  r.set({ hot: t.id });
  r.snap(
    <>Memtable is full, so it's <b>flushed</b>: written once, sequentially, as an immutable sorted file{' '}
      <span className="hl info">SST {t.id}</span> in L0. The WAL can now be thrown away.</>,
    1.4,
  );
}

function compact(r: Rec, reason: ReactNode) {
  const s = r.get().s;
  if (!s.l0.length) return;
  const ids = [...s.l0, ...s.l1].map((t) => t.id);
  r.set({ hot: null, compacting: ids, dropped: [] });
  r.snap(reason, 1.3);

  const all = [...s.l0.flatMap((t) => t.entries), ...s.l1.flatMap((t) => t.entries)];
  const newest = new Map<string, Entry>();
  for (const e of all) {
    const cur = newest.get(e.k);
    if (!cur || e.seq > cur.seq) newest.set(e.k, e);
  }
  const dropped: { e: Entry; why: string }[] = [];
  for (const e of all) if (newest.get(e.k) !== e) dropped.push({ e, why: 'overwritten' });
  const kept: Entry[] = [];
  for (const e of newest.values()) {
    // L1 is the bottom level, so a tombstone has nothing older left to hide: drop it.
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
  r.state({ l0: [], l1, nextId: id, diskWrites: s.diskWrites + out.length });
  r.set({ compacting: l1.map((t) => t.id), dropped });
  r.snap(
    <>One sorted merge pass: keep the <b>newest</b> version of each key, drop{' '}
      <span className="hl bad">{dropped.length} dead entr{dropped.length === 1 ? 'y' : 'ies'}</span> (
      {tombCount(dropped)} tombstone{tombCount(dropped) === 1 ? '' : 's'}), and rewrite {all.length} entries as {out.length} in L1. Rewriting is the price of fast writes.</>,
    1.8,
  );
  r.set({ compacting: [], dropped: [] });
}

export function writeFrames(s0: Lsm, k: string, del: boolean): { frames: LsmFrame[]; next: Lsm } {
  const r = recorder(s0);
  const e: Entry = { k, v: del ? null : s0.seq + 1, seq: s0.seq + 1 };
  r.set({ hotKey: k });
  r.state({ wal: [...s0.wal, e], seq: e.seq, userWrites: s0.userWrites + 1, diskWrites: s0.diskWrites + 1 });
  r.set({ hot: 'wal' });
  r.snap(
    del ? (
      <>DELETE <span className="hl">{k}</span>. Nothing is erased yet: a delete is just a write of a{' '}
        <span className="hl bad">tombstone</span>. First, append it to the WAL.</>
    ) : (
      <>PUT <span className="hl">{k}={e.v}</span>. First, <b>append</b> to the write-ahead log on disk: a fast sequential write, so a crash can't lose it.</>
    ),
  );
  const mem = sortEntries([...r.get().s.mem.filter((x) => x.k !== k), e]);
  r.state({ mem });
  r.set({ hot: 'mem' });
  r.snap(<>Then into the <b>memtable</b>, a sorted map in RAM. The write is done: no page on disk was updated in place.</>);
  if (mem.length >= MEM_CAP) flush(r);
  if (r.get().s.l0.length >= L0_TRIGGER)
    compact(r, <>L0 now has {r.get().s.l0.length} files whose key ranges <b>overlap</b>, so reads must check them all. Time to <span className="hl violet">compact</span>.</>);
  r.set({ hot: null });
  r.snap(undefined);
  const f = r.frames;
  return { frames: f, next: f[f.length - 1].s };
}

export function compactFrames(s0: Lsm): { frames: LsmFrame[]; next: Lsm } {
  const r = recorder(s0);
  r.snap(<>Manual compaction: merge every L0 file into L1.</>);
  compact(r, <>Merging {s0.l0.length} L0 file{s0.l0.length === 1 ? '' : 's'} with L1…</>);
  r.snap(undefined);
  const f = r.frames;
  return { frames: f, next: f[f.length - 1].s };
}

export function readFrames(s0: Lsm, k: string): LsmFrame[] {
  const r = recorder(s0);
  r.set({ hotKey: k });
  let read = 0;
  let skipped = 0;
  const probes: Record<number, Probe> = {};
  const done = (say: ReactNode) => {
    r.set({ hot: null, bloomCheck: null, lastRead: { read, skipped } });
    r.snap(say, 2);
  };

  r.set({ hot: 'mem' });
  const m = s0.mem.find((e) => e.k === k);
  r.set({ memProbe: m ? 'hit' : 'miss' });
  r.snap(<>GET <span className="hl">{k}</span>. Newest data first: check the <b>memtable</b> in RAM.</>);
  if (m) { done(result(k, m, 'the memtable', read, skipped)); return r.frames; }

  const check = (t: SST, levelName: string): Entry | undefined => {
    const bits = bloomBits(k);
    r.set({ hot: t.id, bloomCheck: { id: t.id, bits } });
    if (!bloomMaybe(t, k)) {
      probes[t.id] = 'skip';
      skipped++;
      r.set({ probes: { ...probes } });
      r.snap(<>{levelName} SST {t.id}: its <b>bloom filter</b> has a 0 at bit {bits.find((b) => !((t.bloom >> b) & 1))}, so {k} is{' '}
        <span className="hl info">definitely not here</span>. Skipped without touching disk.</>);
      return undefined;
    }
    read++;
    const hit = t.entries.find((e) => e.k === k);
    probes[t.id] = hit ? 'hit' : 'fp';
    r.set({ probes: { ...probes } });
    r.snap(
      hit ? (
        <>{levelName} SST {t.id}: bloom says <b>maybe</b>, so read the file… <span className="hl ok">found it</span>.</>
      ) : (
        <>{levelName} SST {t.id}: bloom says <b>maybe</b>, read the file… not there. A{' '}
          <span className="hl bad">false positive</span>: a wasted disk read.</>
      ),
    );
    return hit;
  };

  for (const t of s0.l0) {
    const hit = check(t, 'L0');
    if (hit) { done(result(k, hit, `L0 SST ${t.id}`, read, skipped)); return r.frames; }
  }
  const t1 = s0.l1.find((t) => k >= t.entries[0].k && k <= t.entries[t.entries.length - 1].k);
  if (s0.l1.length) {
    for (const t of s0.l1) if (t !== t1) probes[t.id] = 'range';
    r.set({ probes: { ...probes }, hot: null, bloomCheck: null });
    r.snap(
      t1 ? (
        <>L1 files don't overlap, so only the one whose key range covers {k} can hold it: SST {t1.id}.</>
      ) : (
        <>No L1 file's key range covers {k}, so L1 is ruled out without reading anything.</>
      ),
    );
  }
  if (t1) {
    const hit = check(t1, 'L1');
    if (hit) { done(result(k, hit, `L1 SST ${t1.id}`, read, skipped)); return r.frames; }
  }
  done(
    <><span className="hl bad">{k} not found</span> after reading {read} file{read === 1 ? '' : 's'} ({skipped} skipped by
      bloom filters). Reads pay for fast writes: data can be in many places.</>,
  );
  return r.frames;
}

function result(k: string, e: Entry, where: string, read: number, skipped: number): ReactNode {
  return e.v === null ? (
    <>Newest entry for {k}, in {where}, is a <span className="hl bad">tombstone</span>: the key is deleted. Stop here, even
      though older versions still sit in files below.</>
  ) : (
    <><span className="hl ok">{k}={e.v}</span> from {where}. Files read: {read}, skipped by bloom: {skipped}. Stopping at
      the first (newest) match is what makes overwrites correct.</>
  );
}

/** Deterministic warm-up so the stage starts with data in every layer. */
export function seeded(): Lsm {
  let s = emptyLsm();
  const script: [string, boolean][] = [
    ['a', false], ['c', false], ['f', false], ['h', false],
    ['b', false], ['c', false], ['j', false], ['e', false],
    ['k', false], ['a', false], ['d', false], ['g', false],
    ['f', true], ['i', false], ['c', false], ['l', false],
    ['b', false], ['h', true],
  ];
  for (const [k, del] of script) s = writeFrames(s, k, del).next;
  return s;
}
