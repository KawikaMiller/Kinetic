import type { ReactNode } from 'react';
import { joinList } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { CHAIN, COMBOS, N, opLabel, replay, SCRIPT, totals, type Op, type Opts, type Step } from './model';

export type Mode = 'free' | 'chain' | 'script';

export interface UfFrame extends Frame {
  parents: number[];
  ranks: number[];
  /** The find path being walked, node first, root last. */
  path: number[];
  root: number | null;
  /** Nodes path compression just re-pointed at the root. */
  reparented: number[];
  /** [new parent root, root that went under it] for a link. */
  linked: number[];
  /** Pointer hops so far, over the operations shown. */
  hops: number;
  height: number;
  /** Operations finished. */
  done: number;
}

const hopWord = (k: number) => `${k} hop${k === 1 ? '' : 's'}`;
const comboText = (o: Opts) => COMBOS.find((c) => c.opts.byRank === o.byRank && c.opts.compress === o.compress)!.label;

/** Height of the tallest tree in a parent array. */
function heightOf(parents: readonly number[]): number {
  let max = 0;
  parents.forEach((_, i) => {
    let d = 0;
    for (let x = i; parents[x] !== x; x = parents[x]) d++;
    max = Math.max(max, d);
  });
  return max;
}

/** Why the link went the way it did, from the ranks the link saw. */
function linkReason(step: Step, root: number, child: number, opts: Opts): ReactNode {
  if (!opts.byRank) return <>Without union by rank, the second argument's root always goes under the first's, however tall that makes the tree.</>;
  const rr = step.ranksBefore[root];
  const rc = step.ranksBefore[child];
  return rr > rc
    ? <>By rank: {root}'s tree has rank {rr}, {child}'s has {rc}, so the shorter tree goes under the taller and the height doesn't grow.</>
    : <>By rank: both ranks are {rr}, a tie, so {child} goes under {root} and {root}'s rank rises to {rr + 1}.</>;
}

/** Detailed frames for one step: each find, each compression, then the link. */
function detailStep(rec: ReturnType<typeof createRecorder<UfFrame>>, step: Step, opts: Opts) {
  let parents = step.before.slice();
  let ranks = step.ranksBefore.slice();
  const events = step.events;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind === 'find') {
      const k = e.path.length - 1;
      const root = e.path[k];
      rec.snap(
        k === 0
          ? <>find({e.node}): {e.node} is its own parent, so it's a root. 0 hops.</>
          : <>find({e.node}): follow parent pointers {e.path.join(' → ')}. {hopWord(k)}, and {root} is the root.</>,
        undefined,
        { path: e.path, root, reparented: [], linked: [], hops: rec.get().hops + k },
      );
      const moved: number[] = [];
      while (events[i + 1]?.kind === 'reparent') {
        const r = events[++i];
        if (r.kind !== 'reparent') break;
        parents = parents.slice();
        parents[r.node] = r.to;
        moved.push(r.node);
      }
      if (moved.length) {
        rec.snap(
          <>Path compression: point {joinList(moved.map(String))} straight at {root}. From now on, find from {moved.length === 1 ? 'it' : 'any of them'} is 1 hop.</>,
          undefined,
          { parents, reparented: moved, path: [], height: heightOf(parents) },
        );
      }
    } else if (e.kind === 'rank') {
      ranks = ranks.slice();
      ranks[e.root] = e.rank;
    } else if (e.kind === 'union') {
      if (!e.merged) {
        rec.snap(<>{e.a} and {e.b} already share root {e.root}: they're connected, so there's nothing to link.</>, undefined, { path: [], reparented: [], root: e.root });
      } else {
        parents = parents.slice();
        parents[e.child!] = e.root;
        rec.snap(
          <>Link: root {e.child} now points at root {e.root}, merging the two sets. {linkReason(step, e.root, e.child!, opts)}</>,
          undefined,
          { parents, ranks, path: [], reparented: [], root: null, linked: [e.root, e.child!], height: heightOf(parents) },
        );
      }
    }
  }
  rec.set({ parents: step.after, ranks: step.ranksAfter, height: step.height, done: rec.get().done + 1 });
}

/** One frame for a whole step, for the 30-operation script. */
function compactStep(rec: ReturnType<typeof createRecorder<UfFrame>>, step: Step, index: number, total: number) {
  const finds = step.events.filter((e) => e.kind === 'find');
  const moved = step.events.flatMap((e) => (e.kind === 'reparent' ? [e.node] : []));
  const link = step.events.find((e) => e.kind === 'union');
  const path = [...new Set(finds.flatMap((e) => e.path))];
  const what =
    step.op.kind === 'find'
      ? `root ${finds[0].path[finds[0].path.length - 1]}`
      : link?.kind === 'union' && link.merged
        ? `linked ${link.child} under ${link.root}`
        : 'already connected';
  rec.snap(
    <>
      {index + 1}/{total} {opLabel(step.op)}: {what} · {hopWord(step.hops)}
      {moved.length > 0 && <> · compressed {joinList(moved.map(String))}</>} · tallest tree {step.height}
    </>,
    undefined,
    {
      parents: step.after, ranks: step.ranksAfter, path, root: finds.length === 1 ? finds[0].path[finds[0].path.length - 1] : null, reparented: moved,
      linked: link?.kind === 'union' && link.merged ? [link.root, link.child!] : [], hops: rec.get().hops + step.hops, height: step.height, done: index + 1,
    },
  );
}

const singletons = () => Array.from({ length: N }, (_, i) => i);
const blank = (): Omit<UfFrame, 'say' | 'hold'> => ({ parents: singletons(), ranks: new Array(N).fill(0), path: [], root: null, reparented: [], linked: [], hops: 0, height: 0, done: 0 });

/** The playground: the structure before the newest operation, then that operation in detail. */
export function freeFrames(ops: readonly Op[], opts: Opts): UfFrame[] {
  const steps = replay(N, ops, opts);
  const rec = createRecorder<UfFrame>(blank());
  if (!steps.length) {
    rec.snap(<>Ten elements, each its own set: every node is a root that points at itself. Pick two nodes to union them, or switch to Find.</>);
    return rec.frames;
  }
  const last = steps[steps.length - 1];
  const earlier = steps.slice(0, -1).reduce((s, x) => s + x.hops, 0);
  rec.snap(<>{opLabel(last.op)}, operation {steps.length}.</>, undefined, {
    parents: last.before, ranks: last.ranksBefore, hops: earlier, height: steps[steps.length - 2]?.height ?? 0, done: steps.length - 1,
  });
  detailStep(rec, last, opts);
  rec.close(<>{opLabel(last.op)} took {hopWord(last.hops)}. {last.count === 1 ? 'Everything is one set.' : `${last.count} sets remain.`} Tallest tree: {last.height}.</>);
  return rec.frames;
}

export function scriptedFrames(mode: 'chain' | 'script', opts: Opts): UfFrame[] {
  const ops = mode === 'chain' ? CHAIN : SCRIPT;
  const steps = replay(N, ops, opts);
  const rec = createRecorder<UfFrame>(blank());
  rec.snap(
    mode === 'chain'
      ? <>The chain: union(1, 0), union(2, 1), … each hangs the set built so far under one new element. Then find(0) twice. Settings: {comboText(opts)}.</>
      : <>A scripted workload of 30 operations: a chain grows with the odd query, then mostly queries. Settings: {comboText(opts)}. Count the hops.</>,
  );
  steps.forEach((s, i) => (mode === 'chain' ? detailStep(rec, s, opts) : compactStep(rec, s, i, steps.length)));
  rec.close(closing(ops, opts), 2);
  return rec.frames;
}

/** The closing line: this run's totals and the same operations under all four settings. */
export function closing(ops: readonly Op[], opts: Opts): ReactNode {
  const all = COMBOS.map((c) => ({ ...c, t: totals(N, ops, c.opts) }));
  const mine = all.find((c) => c.opts.byRank === opts.byRank && c.opts.compress === opts.compress)!;
  const best = Math.min(...all.map((c) => c.t.hops));
  const tied = all.filter((c) => c.t.hops === best).length > 1;
  return (
    <>
      {ops.length} operations, <b>{mine.t.hops} pointer hops</b>, tallest tree {mine.t.maxHeight}. Same operations under all four settings:{' '}
      {all.map((c, i) => (
        <span key={c.label}>
          {c.label} {c.t.hops}
          {i < all.length - 1 ? ', ' : '.'}
        </span>
      ))}{' '}
      {mine.t.hops > best ? `${mine.t.hops - best} more than the best setting.` : tied ? 'This setting ties for the fewest.' : 'This setting needs the fewest.'}
    </>
  );
}
