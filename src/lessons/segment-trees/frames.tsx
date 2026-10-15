import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { OPS, addRange, cellValues, queryRange, setCell, type Op, type SegResult, type SegTree } from './model';

export type Action =
  | { kind: 'query'; l: number; r: number }
  | { kind: 'set'; i: number; v: number }
  | { kind: 'add'; l: number; r: number; v: number; lazy: boolean };

export interface SegFrame extends Frame {
  tree: SegTree;
  current: number | null;
  covering: number[];
  partial: number[];
  outside: number[];
  /** Nodes a tag was just pushed from. */
  pushed: number[];
  range: { l: number; r: number } | null;
}

export interface SegRun {
  frames: SegFrame[];
  result: SegResult;
}

const hl = (n: number | string, tone = '') => <span className={`hl ${tone}`.trim()}>{n}</span>;
const nameOf = (t: SegTree, id: number) => (t.nodes[id].l === t.nodes[id].r ? `[${t.nodes[id].l}]` : `[${t.nodes[id].l}, ${t.nodes[id].r}]`);
const signed = (v: number) => (v < 0 ? `−${-v}` : `+${v}`);

export const runAction = (tree: SegTree, a: Action): SegResult =>
  a.kind === 'query' ? queryRange(tree, a.l, a.r, { record: true }) : a.kind === 'set' ? setCell(tree, a.i, a.v, { record: true }) : addRange(tree, a.l, a.r, a.v, a.lazy, { record: true });

/** One frame per event of the operation, narrated from the model's own event list. */
export function segFrames(base: SegTree, a: Action): SegRun {
  const result = runAction(base, a);
  const op: Op = base.op;
  const range = a.kind === 'set' ? null : { l: a.l, r: a.r };
  const rec = createRecorder<SegFrame>({ tree: base, current: null, covering: [], partial: [], outside: [], pushed: [], range }, { transient: { pushed: [] } });
  rec.snap(
    a.kind === 'query' ? (
      <>Query the {OPS[op].label} of cells {hl(`${a.l} to ${a.r}`)}: take whole nodes that sit inside the range, go down into nodes that only overlap it, skip the rest.</>
    ) : a.kind === 'set' ? (
      <>Set cell {hl(a.i)} to {hl(a.v)}: walk down to its leaf, then recompute every ancestor on the way back up.</>
    ) : a.lazy ? (
      <>Add {hl(signed(a.v))} to cells {hl(`${a.l} to ${a.r}`)} lazily: a node inside the range takes a tag instead of its leaves being visited.</>
    ) : (
      <>Add {hl(signed(a.v))} to cells {hl(`${a.l} to ${a.r}`)} the eager way: every leaf in the range is visited and every ancestor recomputed.</>
    ),
  );
  for (const e of result.events) {
    const t = e.tree;
    const cur = rec.get();
    switch (e.kind) {
      case 'visit':
        if (e.verdict === 'outside') {
          rec.snap(<>{nameOf(t, e.node)} is outside the range: skip it.</>, undefined, { tree: t, current: e.node, outside: [...cur.outside, e.node] });
        } else if (e.verdict === 'cover') {
          rec.snap(
            a.kind === 'query' ? (
              <>{nameOf(t, e.node)} lies inside the range: <span className="hl ok">take its aggregate {t.nodes[e.node].agg}</span>.</>
            ) : (
              <>{nameOf(t, e.node)} lies inside the range: go down to its leaves (no lazy tags here).</>
            ),
            undefined,
            { tree: t, current: e.node, covering: [...cur.covering, e.node] },
          );
        } else {
          rec.snap(<>{nameOf(t, e.node)} overlaps the range only in part: <span className="hl info">go down into both children</span>.</>, undefined, { tree: t, current: e.node, partial: [...cur.partial, e.node] });
        }
        break;
      case 'push':
        rec.snap(<>{nameOf(t, e.node)} holds a pending tag <span className="hl violet">{signed(e.tag)}</span>: push it down onto its two children before looking inside.</>, undefined, { tree: t, current: e.node, pushed: [e.node] });
        break;
      case 'tag':
        rec.snap(<>{nameOf(t, e.node)} lies inside the range: its aggregate becomes {t.nodes[e.node].agg} and it keeps the tag <span className="hl violet">{signed(e.v)}</span> for its children, instead of touching them.</>, undefined, { tree: t, current: e.node, covering: [...cur.covering, e.node] });
        break;
      case 'leaf':
        rec.snap(<>Leaf {nameOf(t, e.node)} gets {signed(e.v)} and becomes {t.nodes[e.node].agg}.</>, undefined, { tree: t, current: e.node, covering: [...cur.covering, e.node] });
        break;
      case 'set':
        rec.snap(<>Leaf {nameOf(t, e.node)} is now {hl(e.value, 'hi')}.</>, undefined, { tree: t, current: e.node, partial: [...cur.partial, e.node] });
        break;
      case 'recompute':
        rec.snap(<>Recompute {nameOf(t, e.node)} from its children: {OPS[op].label} = {t.nodes[e.node].agg}.</>, undefined, { tree: t, current: e.node });
        break;
    }
  }
  const final = result.tree;
  rec.set({ current: null });
  if (a.kind === 'query') {
    const want = naive(cellValues(final), op, a.l, a.r);
    rec.close(
      <>
        Answer {hl(String(result.value), 'ok')}, from {plural(result.covering.length, 'covering node')} and {plural(result.partial.length, 'node')} entered but not covered. A plain loop over the cells gives {want}
        {want === result.value ? ': they agree.' : ': they differ.'}
      </>,
      2,
    );
  } else {
    rec.close(
      <>
        Done after touching {hl(plural(result.touched, 'node'))}.{' '}
        {a.kind === 'add' ? <>{a.lazy ? 'Lazy tags left the leaves below them alone until a query or update needs them.' : 'Every leaf in the range was visited.'}</> : <>That is the leaf and its ancestors: one node per level.</>}
      </>,
      2,
    );
  }
  return { frames: rec.frames, result };
}

/** A plain loop over the cells: the oracle the captions and tests compare against. */
export function naive(values: readonly number[], op: Op, l: number, r: number): number {
  const def = OPS[op];
  return values.slice(l, r + 1).reduce((acc, v) => def.combine(acc, v), def.identity);
}
