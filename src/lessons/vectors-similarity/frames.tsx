import type { ReactNode } from 'react';
import { TOP_K, compare, direction, isZero, metricsDisagree, rank, read, topIds, type Metric, type V2 } from './model';

/** A number as the readouts show it: rounded, trailing zeros dropped, a real minus sign. */
export function num(v: number, dp = 2): string {
  const r = Number(v.toFixed(dp));
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

export const vec = ([x, y]: V2) => `(${num(x, 1)}, ${num(y, 1)})`;

const listIds = (ids: string[]) => ids.join(', ');

/** The caption for the dot-product scene, from the vectors on screen. */
export function dotCaption(a: V2, b: V2, doubled: boolean, pinned: V2 | null): ReactNode {
  const bName = doubled ? '2b' : 'b';
  const main = mainDotCaption(a, b, bName);
  const scaleNote = doubled && !isZero(a) && !isZero(b)
    ? <> b is doubled: a·b was {num(read(a, b).dot / 2)}, a·2b is {num(read(a, b).dot)}, and cos θ didn't move. Cosine divides length back out.</>
    : null;
  return <>{main}{scaleNote}{pinned && comparisonNote(a, pinned, b, bName)}</>;
}

function mainDotCaption(a: V2, b: V2, bName: string): ReactNode {
  if (isZero(a) || isZero(b)) {
    const which = isZero(a) && isZero(b) ? 'Both vectors are' : isZero(a) ? 'a is' : `${bName} is`;
    return <>{which} the zero vector: no direction, so θ and cos θ are <span className="hl bad">undefined</span>. a·{bName} is 0.</>;
  }
  const r = read(a, b);
  const cos = r.cos!;
  switch (direction(a, b)) {
    case 'same':
      return <>Same direction: θ = 0°, cos θ = 1. All of {bName} lies along a, so a·{bName} = ‖a‖‖{bName}‖ = {num(r.dot)}, the most these lengths can give.</>;
    case 'opposite':
      return <>Opposite: θ = 180°, cos θ = −1. a·{bName} = −‖a‖‖{bName}‖ = {num(r.dot)}, the most negative it can be.</>;
    case 'perpendicular':
      return <>Perpendicular: θ = 90°, cos θ = 0. {bName} casts no shadow on a, so a·{bName} = 0.</>;
    case 'similar':
      return <>θ ≈ {num(r.angle!, 0)}°, cos θ ≈ {num(cos, 3)}. {bName}'s shadow along a is {num(r.shadowLength!)} long; times ‖a‖ ≈ {num(r.normA)} that's a·{bName} = {num(r.dot)}.</>;
    default:
      return <>θ ≈ {num(r.angle!, 0)}°: more than 90°, so {bName}'s shadow falls behind a ({num(r.shadowLength!)}) and a·{bName} is negative: {num(r.dot)}.</>;
  }
}

function comparisonNote(a: V2, pinned: V2, b: V2, bName: string): ReactNode {
  const c = compare(a, pinned, b);
  const p = read(a, pinned);
  const n = read(a, b);
  if (c.cosPrefers === 'undefined') return <> Against b′, cosine can't compare: a zero vector has no angle.</>;
  const winner = (side: 'pinned' | 'current' | 'tie') => (side === 'pinned' ? 'b′' : side === 'current' ? bName : 'neither');
  const dotPart = <>a·b′ = {num(p.dot)} vs a·{bName} = {num(n.dot)}</>;
  const cosPart = <>cos {num(p.cos!, 3)} vs {num(n.cos!, 3)}</>;
  if (c.disagree) {
    const dotWinnerLonger = c.dotPrefers === 'pinned' ? p.normB > n.normB : n.normB > p.normB;
    const moral = dotWinnerLonger ? <> Length won the dot product; direction won cosine.</> : <> Cosine compares direction alone; the dot product also weighs length.</>;
    return <> Compared with b′: the dot product prefers {winner(c.dotPrefers)} ({dotPart}), cosine prefers {winner(c.cosPrefers)} ({cosPart}).{moral}</>;
  }
  return <> Compared with b′: both scores prefer {winner(c.dotPrefers === 'tie' ? c.cosPrefers : c.dotPrefers)} ({dotPart}; {cosPart}).</>;
}

const METRIC_NAME: Record<Metric, string> = { cosine: 'cosine', euclidean: 'distance' };

/** The caption for the neighbours scene. */
export function neighbourCaption(query: V2, metric: Metric): ReactNode {
  if (metric === 'cosine' && isZero(query)) {
    return <>The empty query (0, 0) has no direction, so its cosine with every document is <span className="hl bad">undefined</span>. Drag the query, or rank by distance.</>;
  }
  const mine = topIds(rank(query, metric));
  const other: Metric = metric === 'cosine' ? 'euclidean' : 'cosine';
  const theirs = topIds(rank(query, other));
  const lead = <>By {METRIC_NAME[metric]}, the top {TOP_K} for q = {vec(query)} are <span className="hl ok">{listIds(mine)}</span>.</>;
  if (theirs.length === 0) return <>{lead} Cosine can't rank an empty query at all.</>;
  if (!metricsDisagree(query)) return <>{lead} Both metrics agree on these {TOP_K} here.</>;
  const why = metric === 'cosine'
    ? 'it also rewards documents of a similar length, not just a similar mix of words.'
    : 'it compares only direction, the mix of cat and dog words, and ignores length.';
  return <>{lead} {other === 'cosine' ? 'Cosine' : 'Distance'} would pick {listIds(theirs)} instead: {why}</>;
}
