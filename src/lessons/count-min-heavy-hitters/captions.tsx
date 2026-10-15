/**
 * count-min-heavy-hitters: every caption, built from the model on screen.
 */
import type { ReactNode } from 'react';
import { pctText, sig } from '../../core/format';
import { undercounted, type GridModel, type Inspection } from './grid';
import type { HeavyState, Quality } from './heavy';
import type { MergeRun } from './merge';
import { deltaOf, epsilonOf } from './sketch';
import { TOP_K, UNIVERSE, overCount, overLimit, underCount, type ErrorRun } from './stream';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

export function gridCaption(o: { items: number; model: GridModel; look: Inspection | null }): ReactNode {
  if (o.items === 0) return <>An empty 4 by 16 grid. Each item is hashed once per row, and its estimate will be the smallest of the four cells it touches. Add an item, or stream 30.</>;
  const look = o.look;
  const under = undercounted(o.model);
  return (
    <>
      {o.items} {noun(o.items, 'item')} counted in {o.model.truth.size} distinct. {look && (
        <>
          {hl('hi', look.item)} touches cells holding {look.cells.map((c) => c.value).join(', ')}: the estimate is their minimum, {hl('ok', look.estimate)}, against a true {hl('ok', look.truth)}.{' '}
          {look.estimate === look.truth ? <>Here no other item shares its smallest cell, so the estimate is exact.</> : <>The extra {look.estimate - look.truth} come from other items sharing its smallest cell: collisions only add.</>}
        </>
      )}{' '}
      {under === 0 ? <>No item is estimated below its true count.</> : <>{hl('bad', `${under} ${noun(under, 'item')} below the truth`)}.</>}
    </>
  );
}

export function sizeCaption(o: { run: ErrorRun; w: number; d: number }): ReactNode {
  const eps = epsilonOf(o.w);
  const delta = deltaOf(o.d);
  const limit = eps * o.run.n;
  const share = overLimit(o.run, limit) / UNIVERSE;
  return (
    <>
      A sketch of width {o.w} and depth {o.d} promises, for one item, an overcount of at most {hl('violet', `ε·N = ${sig(limit, 3)}`)} with probability at least {hl('', pctText(1 - delta, 1))}: ε = e / w = {sig(eps, 3)}, δ = e^−d = {sig(delta, 3)}.{' '}
      In this run {hl(share <= delta ? 'ok' : 'bad', pctText(share, 1))} of the {UNIVERSE.toLocaleString('en-US')} items went over the line, against δ = {pctText(delta, 1)}. The bound is about total count N: it says nothing useful for an item rarer than ε·N.
    </>
  );
}

export function heavyCaption(o: { state: HeavyState; q: Quality; n: number }): ReactNode {
  const { state, q } = o;
  if (state.seen === 0) return <>Nothing seen yet. Each arriving item is added to the sketch, its estimate is read back, and it stays among {TOP_K} candidates only if that estimate beats the smallest one.</>;
  return (
    <>
      After {state.seen.toLocaleString('en-US')} of {o.n.toLocaleString('en-US')} items the {hl('info', state.heap.length)} {noun(state.heap.length, 'candidate')} hold {hl(q.hits === q.top.length ? 'ok' : 'bad', `${q.hits} of the ${q.top.length}`)} true top items: precision {pctText(q.precision, 0)}, recall {pctText(q.recall, 0)}.
      {' '}The sketch answers "how often?" for any item but cannot list its items, which is why the candidates exist.
    </>
  );
}

export function mergeCaption(o: { run: MergeRun; sameSeeds: boolean; items: number }): ReactNode {
  const { run } = o;
  return run.equal ? (
    <>
      Three partitions each keep a sketch with the same hash seeds. Adding the three grids cell by cell gives {hl('ok', 'exactly the sketch of the combined stream')}: all {run.merged.counts.length} cells match.
    </>
  ) : (
    <>
      The partitions used {hl('bad', 'different hash seeds')}, so a cell in one grid means different items than the same cell in another: the sum differs from the combined sketch in {hl('bad', `${run.differingCells} of ${run.merged.counts.length} cells`)}, and its estimates are wrong.
    </>
  );
}

export function breakCaption(o: { run: ErrorRun; how: 'min' | 'mean'; ghosts: number }): ReactNode {
  const under = underCount(o.run);
  const over = overCount(o.run);
  const worst = Math.max(...o.run.errors);
  return (
    <>
      Width {o.run.w}, depth {o.run.d}, estimate by {o.how === 'min' ? 'the minimum' : 'the mean'}{o.ghosts > 0 ? `, after ${o.ghosts} deletes of items that were never added` : ''}: {hl('bad', `${over} items overcounted`)} (by up to {sig(worst, 3)}),{' '}
      {under > 0 ? hl('bad', `${under} items undercounted`) : hl('ok', 'no item undercounted')}.
    </>
  );
}
