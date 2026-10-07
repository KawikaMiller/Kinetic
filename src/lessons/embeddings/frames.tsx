import type { ReactNode } from 'react';
import { pct } from '../../core/format';
import { cosine } from '../../core/vec';
import {
  MAP, MAP_POINTS, TOP_K, VOCAB, analogy, keywordOverlap, phraseVector, project, type Analogy, type Neighbour, type Phrase,
} from './model';

/** Two decimals with a real minus sign. */
export const num = (v: number, dp = 2) => (Math.abs(v) < 0.5 * 10 ** -dp ? (0).toFixed(dp) : v.toFixed(dp).replace('-', '−'));

export const KEPT = (MAP.variances[0] + MAP.variances[1]) / MAP.total;

const list = (ns: readonly Neighbour[]) => ns.map((n, i) => <span key={n.word.word}>{i ? ', ' : ''}<b>{n.word.word}</b> ({num(n.cos)})</span>);

/** How many of the true 8-D neighbours are also among the closest dots on the 2-D map. */
export function mapAgreement(v: readonly number[], top: readonly Neighbour[], exclude: readonly string[]): number {
  const [x, y] = project(MAP, v);
  const near = VOCAB.map((w, i) => ({ w: w.word, d: Math.hypot(MAP_POINTS[i][0] - x, MAP_POINTS[i][1] - y) }))
    .filter((p) => !exclude.includes(p.w))
    .sort((a, b) => a.d - b.d)
    .slice(0, top.length)
    .map((p) => p.w);
  return top.filter((n) => near.includes(n.word.word)).length;
}

export function queryCaption(text: string, p: Phrase, top: readonly Neighbour[]): ReactNode {
  const unknown = p.unknown.length ? <> Not in this toy vocabulary, so ignored: {p.unknown.join(', ')}.</> : null;
  if (!p.ok) return <><span className="hl bad">{p.reason}</span>{unknown}</>;
  const what = p.known.length === 1 ? <>&quot;{p.known[0]}&quot;</> : <>&quot;{text.trim()}&quot;, the mean of {p.known.length} word vectors,</>;
  const onMap = mapAgreement(p.vector, top, p.known);
  return <>{what} has these nearest words by cosine in all 8 dimensions: {list(top)}. On the 2-D map, {onMap} of those {top.length} are also among its {top.length} closest dots.{unknown}</>;
}

export function analogyCaption(x: Analogy): ReactNode {
  const r = analogy(x);
  const head = <>{x.a} − {x.b} + {x.c}</>;
  if (r.holds) {
    return <>{head} lands nearest <span className="hl ok">{r.top[0].word.word}</span> (cosine {num(r.top[0].cos)}), the answer you'd expect. That's built into
      these toy vectors on purpose: {x.expected} was written as {x.c} plus exactly the {x.a} − {x.b} difference. Input words are left out of the answers.</>;
  }
  const rank = r.top.findIndex((n) => n.word.word === x.expected);
  return <>{head}: you might expect {x.expected}, but the nearest word is <span className="hl bad">{r.top[0].word.word}</span> (cosine {num(r.top[0].cos)})
    {rank < 0 ? <>, and {x.expected} isn't in the top {TOP_K}</> : <>; {x.expected} comes {rank + 1}th</>}. In these dimensions &quot;small&quot; moves size, not age:
    the arithmetic follows the numbers, not what you meant. Real models fail analogies like this too.</>;
}

export function pairCaption(a: string, b: string, dist2d: number, cos: number): ReactNode {
  return <><b>{a}</b> and <b>{b}</b> sit almost on top of each other on the map ({num(dist2d, 3)} apart), yet their cosine in 8-D is only {num(cos)}.
    The map keeps {pct(KEPT)} of the variance; these two differ in what it threw away. Judge similarity in the full space, not in the picture.</>;
}

/** Above this cosine two phrases count as a close match. */
export const CLOSE = 0.8;

export function compareCaption(a: string, b: string): ReactNode {
  const overlap = keywordOverlap(a, b);
  const [pa, pb] = [phraseVector(a), phraseVector(b)];
  if (!pa.ok || !pb.ok) return <>Both phrases need at least one word from the toy vocabulary to get a vector.</>;
  const cos = cosine(pa.vector, pb.vector);
  const shared = overlap.shared.length
    ? <>{overlap.shared.length} shared {overlap.shared.length === 1 ? 'word' : 'words'} ({overlap.shared.join(', ')})</>
    : 'no shared words';
  return <>Keyword overlap: {shared}, a score of {num(overlap.score)}. Cosine of their toy vectors: <span className={`hl ${cos > CLOSE ? 'ok' : 'info'}`}>{num(cos, 3)}</span>.
    {overlap.score === 0 && cos > CLOSE ? ' Matching words would miss this pair entirely; comparing vectors finds it.' : ''}</>;
}
