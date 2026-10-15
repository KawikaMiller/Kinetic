import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { BUCKETS, hashJoin, mergeJoin, nestedLoop, type Row, type Side, type Tables } from './join';
import { keyText } from './tables';

/** A row's coloured rail and its short label (the grids' `rowDecor`). */
export interface Mark {
  tone: Tone;
  label: string;
}

export interface JoinFrame extends Frame {
  /** What the running counter counts, in words. */
  unit: string;
  work: number;
  /** Pairs emitted so far. */
  out: number;
  aMark: readonly (Mark | null)[];
  bMark: readonly (Mark | null)[];
  /** Hash scene: the keys in each bucket, and the bucket just touched. */
  buckets?: readonly (readonly number[])[];
  hot?: number | null;
  /** Hash scene: rows written out so far. */
  spilled?: number;
  /** Merge scene: the two sorted sides' keys and the pointers into them (-1 when a pointer has finished). */
  strip?: { a: readonly number[]; b: readonly number[]; i: number; j: number; emitted: readonly number[] };
}

const row = (rows: readonly Row[], i: number): Row => rows[i];
const sideRows = (t: Tables, side: Side): readonly Row[] => (side === 'a' ? t.a : t.b);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const sideName = (side: Side): string => (side === 'a' ? 'customer' : 'order');
const hl = (cls: string, text: ReactNode): ReactNode => <span className={`hl ${cls}`}>{text}</span>;

const blank = (n: number): (Mark | null)[] => Array.from({ length: n }, () => null);

function initial(t: Tables, unit: string): Omit<JoinFrame, 'say' | 'hold'> {
  return { unit, work: 0, out: 0, aMark: blank(t.a.length), bMark: blank(t.b.length) };
}

const setMark = (marks: readonly (Mark | null)[], i: number, mark: Mark | null): (Mark | null)[] => marks.map((m, k) => (k === i ? mark : m));

/** Nested loop (optionally through an index on the inner key): one frame per comparison or probe. */
export function nestedFrames(t: Tables, indexed: boolean): JoinFrame[] {
  const run = nestedLoop(t, 'eq', indexed);
  const r = createRecorder<JoinFrame>(initial(t, indexed ? 'index node visits' : 'key comparisons'));
  r.snap(indexed
    ? <>Index nested loop: for each customer, probe an index on the orders&apos; key. A probe costs {plural(run.height, 'node visit')} (the height of the toy tree over {t.b.length} orders), however many rows it finds.</>
    : <>Nested loop: for each customer, scan every order and compare keys. {t.a.length} customers times {t.b.length} orders is {t.a.length * t.b.length} comparisons.</>);
  const matchesOf: number[] = t.a.map(() => 0);
  let prevA: number | null = null;
  const finish = (a: number) => {
    const n = matchesOf[a];
    r.set({ aMark: setMark(r.get().aMark, a, n > 0 ? { tone: 'ok', label: plural(n, 'match', 'matches') } : { tone: 'dim', label: 'no match' }) });
  };
  for (const e of run.events) {
    if (e.t === 'compare') {
      if (prevA !== null && prevA !== e.a) finish(prevA);
      prevA = e.a;
      const A = row(t.a, e.a);
      const B = row(t.b, e.b);
      let bMark = r.get().bMark.map((m) => (m?.tone === 'info' ? null : m));
      bMark = setMark(bMark, e.b, { tone: e.match ? 'ok' : 'info', label: e.match ? 'match' : 'compare' });
      if (e.match) matchesOf[e.a]++;
      r.snap(
        <>
          Customer {A.id} (key {keyText(A.key)}) against order {B.id} (key {keyText(B.key)}): {e.match ? hl('ok', 'match') : A.key === null || B.key === null ? hl('dim', 'a NULL never matches') : hl('dim', 'no match')}. {e.work} {e.work === 1 ? 'comparison' : 'comparisons'} so far.
        </>,
        undefined,
        { aMark: setMark(r.get().aMark, e.a, { tone: 'hi', label: 'outer' }), bMark, work: e.work, out: r.get().out + (e.match ? 1 : 0) },
      );
    } else if (e.t === 'probe') {
      if (prevA !== null) finish(prevA);
      prevA = e.a;
      const A = row(t.a, e.a);
      matchesOf[e.a] = e.matches.length;
      let bMark = blank(t.b.length);
      for (const m of e.matches) bMark = setMark(bMark, m, { tone: 'ok', label: 'found' });
      r.snap(
        <>
          Customer {A.id} (key {keyText(A.key)}): probe the index, {plural(e.visits, 'node visit')}, {e.matches.length === 0 ? hl('dim', 'no match') : hl('ok', plural(e.matches.length, 'match', 'matches'))}. {e.work} {e.work === 1 ? 'node visit' : 'node visits'} so far.
        </>,
        undefined,
        { aMark: setMark(r.get().aMark, e.a, { tone: 'hi', label: 'probe' }), bMark, work: e.work, out: r.get().out + e.matches.length },
      );
    } else {
      if (prevA !== null) finish(prevA);
      prevA = e.a;
      r.set({ aMark: setMark(r.get().aMark, e.a, { tone: 'dim', label: 'NULL: no probe' }) });
      r.snap(<>Customer {row(t.a, e.a).id} has a NULL key, which matches nothing, so the join skips the probe.</>);
    }
  }
  if (prevA !== null) finish(prevA);
  r.close(
    <>
      Done: {plural(run.pairs.length, 'pair')} found in {run.work} {indexed ? 'node visits' : 'comparisons'}.{' '}
      {indexed ? <>Without the index the same join takes {nestedLoop(t, 'eq', false).work} comparisons.</> : <>Switch on the index and the same join takes {nestedLoop(t, 'eq', true).work} node visits.</>}
    </>,
  );
  return r.frames.map((f, i) => (i === r.frames.length - 1 ? { ...f, bMark: blank(t.b.length) } : f));
}

/** Hash join: build, probe, and with a memory limit the spill and the re-read batches. */
export function hashFrames(t: Tables, memory: number): JoinFrame[] {
  const run = hashJoin(t, memory);
  const probeSide: Side = run.buildSide === 'a' ? 'b' : 'a';
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  const r = createRecorder<JoinFrame>({ ...initial(t, 'hash operations'), buckets: buckets.map((b) => [...b]), hot: null, spilled: 0 });
  const marks = (side: Side) => (side === 'a' ? r.get().aMark : r.get().bMark);
  const withMark = (side: Side, i: number, mark: Mark | null) => (side === 'a' ? { aMark: setMark(marks('a'), i, mark) } : { bMark: setMark(marks('b'), i, mark) });
  r.snap(
    <>
      Hash join: build a hash table of {plural(run.buildRows, 'key')} from the smaller side ({sideName(run.buildSide)}s), then probe it with the {sideName(probeSide)}s. {run.batches > 1 ? <>Memory holds {Math.max(2, Math.floor(memory))} rows, so the build side is split into {run.batches} batches by key and only batch 0 is joined now.</> : <>The whole build side fits in memory, so nothing is spilled.</>}
    </>,
  );
  let spilled = 0;
  for (const e of run.events) {
    if (e.t === 'build') {
      const key = row(sideRows(t, e.side), e.row).key!;
      buckets[e.bucket].push(key);
      r.snap(
        <>Build: {sideName(e.side)} {row(sideRows(t, e.side), e.row).id} (key {key}) goes in bucket {e.bucket} ({key} mod {BUCKETS}). {e.work} {e.work === 1 ? 'operation' : 'operations'} so far.</>,
        undefined,
        { ...withMark(e.side, e.row, { tone: 'info', label: `bucket ${e.bucket}` }), buckets: buckets.map((b) => [...b]), hot: e.bucket, work: e.work },
      );
    } else if (e.t === 'probe') {
      const P = row(sideRows(t, e.side), e.row);
      const probed = marks(e.side).map((m): Mark | null => (m?.tone === 'hi' ? { tone: 'dim', label: 'probed' } : m));
      let patch: Partial<JoinFrame> = { [e.side === 'a' ? 'aMark' : 'bMark']: setMark(probed, e.row, { tone: 'hi', label: `probe bucket ${e.bucket}` }) };
      const buildMark = e.side === 'a' ? 'bMark' : 'aMark';
      let others = marks(run.buildSide);
      for (const m of e.matches) others = setMark(others, m, { tone: 'ok', label: 'match' });
      patch = { ...patch, [buildMark]: others };
      r.snap(
        <>
          Probe: {sideName(e.side)} {P.id} (key {P.key}) looks in bucket {e.bucket}: {e.matches.length === 0 ? hl('dim', 'nothing there with that key') : hl('ok', plural(e.matches.length, 'match', 'matches'))}. {e.work} {e.work === 1 ? 'operation' : 'operations'} so far.
        </>,
        undefined,
        { ...patch, hot: e.bucket, work: e.work, out: r.get().out + e.matches.length },
      );
    } else if (e.t === 'spill') {
      spilled++;
      const R = row(sideRows(t, e.side), e.row);
      r.snap(
        <>Memory is full: {sideName(e.side)} {R.id} (key {R.key}) belongs to batch {e.batch}, so it is written out instead of joined now. {spilled} {spilled === 1 ? 'row' : 'rows'} spilled so far.</>,
        undefined,
        { ...withMark(e.side, e.row, { tone: 'orange', label: `spilled to batch ${e.batch}` }), spilled },
      );
    } else {
      buckets.forEach((b) => (b.length = 0));
      r.snap(<>Batch {e.batch}: read its spilled rows back, rebuild the table from the {sideName(run.buildSide)}s in it and probe with the {sideName(probeSide)}s in it.</>, undefined, { buckets: buckets.map((b) => [...b]), hot: null });
    }
  }
  r.close(
    <>
      Done: {plural(run.pairs.length, 'pair')} in {run.work} hash operations, whatever the memory; {run.rowsSpilled === 0 ? 'no rows were spilled' : `${plural(run.rowsSpilled, 'row')} were spilled, written and read back`}.
    </>,
  );
  return r.frames;
}

/** Merge join: sort (or not), then one frame per pointer step. */
export function mergeFrames(t: Tables, alreadySorted: boolean): JoinFrame[] {
  const run = mergeJoin(t, alreadySorted);
  const keysA = run.sortedA.map((x) => x.key);
  const keysB = run.sortedB.map((x) => x.key);
  const rowIndex = (rows: readonly Row[], id: number) => rows.findIndex((x) => x.id === id);
  const r = createRecorder<JoinFrame>({ ...initial(t, 'sort and merge comparisons'), strip: { a: keysA, b: keysB, i: 0, j: 0, emitted: [] } });
  let emitted: number[] = [];
  const mark = (i: number, j: number): Pick<JoinFrame, 'aMark' | 'bMark'> => {
    let aMark = blank(t.a.length);
    let bMark = blank(t.b.length);
    run.sortedA.forEach((x, k) => {
      if (k < i) aMark = setMark(aMark, rowIndex(t.a, x.id), { tone: 'dim', label: 'passed' });
    });
    run.sortedB.forEach((x, k) => {
      if (k < j) bMark = setMark(bMark, rowIndex(t.b, x.id), { tone: 'dim', label: 'passed' });
    });
    if (i < run.sortedA.length) aMark = setMark(aMark, rowIndex(t.a, run.sortedA[i].id), { tone: 'hi', label: 'outer' });
    if (j < run.sortedB.length) bMark = setMark(bMark, rowIndex(t.b, run.sortedB[j].id), { tone: 'info', label: 'inner' });
    return { aMark, bMark };
  };
  r.snap(
    <>
      Merge join: both sides are sorted on the key, then two pointers walk them once. NULL-key rows can never match, so they are left out first ({t.a.length - run.sortedA.length} customers, {t.b.length - run.sortedB.length} orders).
    </>,
  );
  for (const e of run.events) {
    if (e.t === 'sorted') {
      r.snap(
        e.comparisons === 0 && alreadySorted
          ? <>An index already supplies both sides in key order, so sorting costs {hl('ok', '0')}.</>
          : <>Sort both sides on the key: {hl('orange', `${e.comparisons} comparisons`)} (a merge sort; the toy counts every key comparison).</>,
        undefined,
        { work: e.work, ...mark(0, 0), strip: { a: keysA, b: keysB, i: 0, j: 0, emitted } },
      );
    } else if (e.t === 'step') {
      const cmp = e.order < 0 ? <>{keysA[e.i]} &lt; {keysB[e.j]}: advance the customer pointer</> : e.order > 0 ? <>{keysA[e.i]} &gt; {keysB[e.j]}: advance the order pointer</> : <>{keysA[e.i]} = {keysB[e.j]}: a match</>;
      r.snap(
        <>Compare customer key {keysA[e.i]} with order key {keysB[e.j]}: {cmp}. {e.work} {e.work === 1 ? 'comparison' : 'comparisons'} so far.</>,
        undefined,
        { work: e.work, ...mark(e.i, e.j), strip: { a: keysA, b: keysB, i: e.i, j: e.j, emitted } },
      );
    } else if (e.t === 'emit') {
      emitted = [...emitted, e.k];
      const f = r.get();
      r.snap(
        <>Emit customer {run.sortedA[e.i].id} with order {run.sortedB[e.k].id} (key {run.sortedA[e.i].key}).</>,
        undefined,
        { work: e.work, out: f.out + 1, aMark: setMark(f.aMark, rowIndex(t.a, run.sortedA[e.i].id), { tone: 'ok', label: 'emit' }), bMark: setMark(f.bMark, rowIndex(t.b, run.sortedB[e.k].id), { tone: 'ok', label: 'emit' }), strip: { a: keysA, b: keysB, i: e.i, j: e.k, emitted } },
      );
    } else {
      emitted = [];
      r.snap(
        <>The next customer has the same key, so the order pointer {hl('violet', 'rewinds')} to the start of its run of equal keys (position {e.to + 1}) instead of moving on.</>,
        undefined,
        { work: e.work, strip: { a: keysA, b: keysB, i: r.get().strip!.i, j: e.to, emitted } },
      );
    }
  }
  r.set({ work: run.work });
  r.close(
    <>
      Done: {plural(run.pairs.length, 'pair')} in {run.work} comparisons ({run.sortComparisons} sorting, {run.work - run.sortComparisons} merging); the pointers advanced {run.advances} times and rewound {run.rewinds}.
    </>,
  );
  return r.frames;
}
