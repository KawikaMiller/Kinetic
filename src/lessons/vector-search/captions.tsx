/**
 * vector-search: every caption, built from the model on screen.
 */
import type { ReactNode } from 'react';
import { decimal, pctText, sig } from '../../core/format';
import type { CompareRow } from './compare';
import type { CurseRow } from './concentration';
import { CURSE_NLIST, CURSE_NPROBE } from './concentration';
import type { Neighbour } from './data';
import type { HnswResult } from './hnsw';
import type { IvfResult } from './ivf';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

export function exactCaption(o: { n: number; k: number; unit: boolean; metric: 'euclid' | 'cosine'; agree: boolean }): ReactNode {
  return (
    <>
      Brute force measures the distance from the query to all {hl('bad', o.n)} points and sorts them: {hl('', `${o.n} computations`)} to return the {o.k} nearest by {o.metric === 'euclid' ? 'Euclidean distance' : 'cosine similarity'}.{' '}
      {o.unit ? <>With every vector scaled to unit length |a − b|² = 2 − 2cos(a, b), so the two measures rank alike: {hl('ok', 'they agree')}.</> : o.agree ? <>On these raw vectors the two measures happen to pick the same {o.k}.</> : <>On these raw vectors the two measures pick {hl('bad', 'different neighbours')}: cosine ignores length, Euclidean does not.</>}
    </>
  );
}

export function ivfCaption(o: { nlist: number; nprobe: number; scanned: number; n: number; recall: number; k: number; missed: number; r: IvfResult }): ReactNode {
  return (
    <>
      K-means cut the points into {o.nlist} cells. The query ranks the {o.nlist} centroids, probes the nearest {hl('info', o.nprobe)} and scans {hl('info', o.scanned)} of {o.n} points: {hl('', `${o.r.computations} computations`)}, recall@{o.k} {hl(o.recall === 1 ? 'ok' : 'bad', pctText(o.recall, 0))}.{' '}
      {o.missed > 0 ? <>{hl('bad', `${o.missed} true ${noun(o.missed, 'neighbour')}`)} {noun(o.missed, 'lies', 'lie')} across a cell border in a cell that was not probed.</> : <>Every true neighbour was inside a probed cell.</>}
    </>
  );
}

export function hnswCaption(o: { r: HnswResult; truth: readonly Neighbour[]; recall: number; ef: number; k: number; n: number; top: number }): ReactNode {
  const stuck = o.recall < 1 && o.ef <= o.k;
  return (
    <>
      The search enters at the top layer ({o.top}), hops to closer neighbours, drops a layer when none is closer, and on layer 0 keeps a list of {hl('info', Math.max(o.ef, o.k))}: {hl('', `${o.r.computations} computations`)} against {o.n} for brute force, recall@{o.k} {hl(o.recall === 1 ? 'ok' : 'bad', pctText(o.recall, 0))}.{' '}
      {o.recall < 1 ? (stuck ? <>The walk ended in a {hl('bad', 'local minimum')}: no neighbour was closer, though better points exist. A longer list lets it climb out.</> : <>Some true neighbours were never reached.</>) : <>This run found every true neighbour.</>}
    </>
  );
}

export function curseCaption(o: { row: CurseRow; first: CurseRow; last: CurseRow }): ReactNode {
  return (
    <>
      In {hl('', `${o.row.d} dimensions`)} the gap between the farthest and the nearest of 500 random points, as a share of the nearest distance, is {hl('info', decimal(o.row.ratio, 2))} (it was {sig(o.first.ratio, 3)} at d = {o.first.d}, and is {sig(o.last.ratio, 3)} at d = {o.last.d}): nearest barely differs from average.{' '}
      With {CURSE_NPROBE} of {CURSE_NLIST} cells probed, IVF recall@10 is {hl(o.row.recall > 0.9 ? 'ok' : 'bad', pctText(o.row.recall, 0))} here, against {pctText(o.first.recall, 0)} at d = {o.first.d}.
    </>
  );
}

export function compareCaption(rows: readonly CompareRow[]): ReactNode {
  const [brute, ivf, hnsw] = rows;
  return (
    <>
      On this dataset brute force is exact at {brute.computations} computations. IVF costs about {sig(ivf.computations, 3)} for recall {pctText(ivf.recall, 0)}, HNSW about {sig(hnsw.computations, 3)} for {pctText(hnsw.recall, 0)}, and each pays in memory and build work: that is the trade, for this dataset only.
    </>
  );
}
