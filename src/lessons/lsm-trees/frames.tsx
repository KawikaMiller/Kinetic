import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  L0_TRIGGER, MEM_CAP, appendWal, compactAll, flushMem, insertMem, nextEntry, readPath,
  type Dropped, type Entry, type Lsm, type Probe, type ReadPath,
} from './lsm';

export interface LsmFrame extends Frame {
  s: Lsm;
  hot: 'wal' | 'mem' | number | null;
  hotKey: string | null;
  probes: Record<number, Probe>;
  bloomCheck: { id: number; bits: number[] } | null;
  memProbe: 'hit' | 'miss' | null;
  compacting: number[];
  dropped: Dropped[];
  lastRead: { read: number; skipped: number } | null;
}

/** A frame showing `s` with nothing highlighted. */
export function blankState(s: Lsm): Omit<LsmFrame, 'say' | 'hold'> {
  return { s, hot: null, hotKey: null, probes: {}, bloomCheck: null, memProbe: null, compacting: [], dropped: [], lastRead: null };
}

function recorder(s0: Lsm) {
  const r = createRecorder<LsmFrame>(blankState(s0));
  /** Replace the tree itself (the frame's nested `s`). */
  const state = (s: Lsm) => r.set({ s });
  return { ...r, state };
}

type Rec = ReturnType<typeof recorder>;

const tombCount = (dropped: Dropped[]) => dropped.filter((d) => d.why === 'tombstone').length;

function flush(r: Rec) {
  const { s, sst } = flushMem(r.get().s);
  r.state(s);
  r.set({ hot: sst.id });
  r.snap(
    <>Memtable is full, so it's <b>flushed</b>: written once, sequentially, as an immutable sorted file{' '}
      <span className="hl info">SST {sst.id}</span> in L0. The WAL can now be thrown away.</>,
    1.4,
  );
}

function compact(r: Rec, reason: ReactNode) {
  const s = r.get().s;
  if (!s.l0.length) return;
  const c = compactAll(s);
  r.set({ hot: null, compacting: c.merged, dropped: [] });
  r.snap(reason, 1.3);

  r.state(c.s);
  r.set({ compacting: c.s.l1.map((t) => t.id), dropped: c.dropped });
  r.snap(
    <>One sorted merge pass: keep the <b>newest</b> version of each key, drop{' '}
      <span className="hl bad">{plural(c.dropped.length, 'dead entry', 'dead entries')}</span> (
      {plural(tombCount(c.dropped), 'tombstone')}; this model drops a tombstone because L1 is
      its bottom level), and rewrite {c.inCount} entries as {c.outCount} in L1. Rewriting is the price of fast writes.</>,
    1.8,
  );
  r.set({ compacting: [], dropped: [] });
}

export function writeFrames(s0: Lsm, k: string, del: boolean): { frames: LsmFrame[]; next: Lsm } {
  const r = recorder(s0);
  const e = nextEntry(s0, k, del);
  r.set({ hotKey: k });
  r.state(appendWal(s0, e));
  r.set({ hot: 'wal' });
  r.snap(
    del ? (
      <>DELETE <span className="hl">{k}</span>. Nothing is erased yet: a delete is just a write of a{' '}
        <span className="hl bad">tombstone</span>. First, append it to the WAL.</>
    ) : (
      <>PUT <span className="hl">{k}={e.v}</span>. First, <b>append</b> to the write-ahead log on disk: a fast sequential write, so a crash can't lose it.</>
    ),
  );
  r.state(insertMem(r.get().s, e));
  r.set({ hot: 'mem' });
  r.snap(<>Then into the <b>memtable</b>, a sorted map in RAM. The write is done: no file on disk was updated in place.</>);
  if (r.get().s.mem.length >= MEM_CAP) flush(r);
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
  compact(r, <>Merging {plural(s0.l0.length, 'L0 file')} with L1…</>);
  r.snap(undefined);
  const f = r.frames;
  return { frames: f, next: f[f.length - 1].s };
}

export function readFrames(s0: Lsm, k: string): LsmFrame[] {
  const r = recorder(s0);
  const path: ReadPath = readPath(s0, k);
  const probes: Record<number, Probe> = {};
  r.set({ hotKey: k });
  const done = (say: ReactNode) => {
    r.set({ hot: null, bloomCheck: null, lastRead: { read: path.read, skipped: path.skipped } });
    r.snap(say, 2);
  };

  for (const step of path.steps) {
    if (step.kind === 'mem') {
      r.set({ hot: 'mem', memProbe: step.hit ? 'hit' : 'miss' });
      r.snap(<>GET <span className="hl">{k}</span>. Newest data first: check the <b>memtable</b> in RAM.</>);
    } else if (step.kind === 'bloom') {
      const { sst: t } = step;
      r.set({ hot: t.id, bloomCheck: { id: t.id, bits: step.bits } });
      probes[t.id] = step.outcome;
      r.set({ probes: { ...probes } });
      if (step.outcome === 'skip') {
        const zero = step.bits.find((b) => !((t.bloom >> b) & 1));
        r.snap(<>{step.level} SST {t.id}: its <b>bloom filter</b> has a 0 at bit {zero}, so {k} is{' '}
          <span className="hl info">definitely not here</span>. Skipped without touching disk.</>);
      } else if (step.outcome === 'hit') {
        r.snap(<>{step.level} SST {t.id}: bloom says <b>maybe</b>, so read the file… <span className="hl ok">found it</span>.</>);
      } else {
        r.snap(<>{step.level} SST {t.id}: bloom says <b>maybe</b>, read the file… not there. A{' '}
          <span className="hl bad">false positive</span>: a wasted disk read.</>);
      }
    } else {
      for (const t of step.ruledOut) probes[t.id] = 'range';
      r.set({ probes: { ...probes }, hot: null, bloomCheck: null });
      r.snap(
        step.covering ? (
          <>L1 files don't overlap, so only the one whose key range covers {k} can hold it: SST {step.covering.id}.</>
        ) : (
          <>No L1 file's key range covers {k}, so L1 is ruled out without reading anything.</>
        ),
      );
    }
  }

  if (path.found && path.where) done(result(k, path.found, path.where, path.read, path.skipped));
  else {
    done(
      <><span className="hl bad">{k} not found</span> after reading {plural(path.read, 'file')} ({path.skipped} skipped by
        bloom filters). Reads pay for fast writes: data can be in many places.</>,
    );
  }
  return r.frames;
}

function result(k: string, e: Entry, where: string, read: number, skipped: number): ReactNode {
  return e.v === null ? (
    <>Newest entry for {k}, in {where}, is a <span className="hl bad">tombstone</span>: the key is deleted. Stop here, even
      though older versions may still sit in files below.</>
  ) : (
    <><span className="hl ok">{k}={e.v}</span> from {where}. Files read: {read}, skipped by bloom: {skipped}. Stopping at
      the first (newest) match is what makes overwrites correct.</>
  );
}
