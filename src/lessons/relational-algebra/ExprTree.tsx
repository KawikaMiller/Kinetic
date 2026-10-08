import { TreeSvg } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { nodeTitle } from './frames';
import { children, postOrder, type Evaluation, type Expr } from './model';

const NODE_H = 30;
const CHAR_W = 6.9;
const MIN_W = 46;
const MAX_CHARS = 22;
const COL_W = 150;
const MIN_TREE_W = 420;
const LEVEL_GAP = 62;
const TOP = 26;
const BOTTOM = 46;
const EDGE_ROOM = 6;
/** The smallest text drawn in the tree (the row-count chips), for the phone floor. */
const CHIP_PX = 11;

const clip = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);
const boxW = (s: string) => Math.max(MIN_W, clip(s).length * CHAR_W + 20);

function treeSize(e: Expr) {
  const leaves = postOrder(e).filter((x) => children(x).length === 0).length;
  const depth = (x: Expr): number => 1 + Math.max(0, ...children(x).map(depth));
  const width = Math.max(MIN_TREE_W, leaves * COL_W);
  // Leaves sit `pad` in from the edge: leave room for the widest box's half.
  const pad = Math.max(...postOrder(e).map((x) => boxW(nodeTitle(x)) / 2)) + EDGE_ROOM;
  return { width, pad, height: TOP + (depth(e) - 1) * LEVEL_GAP + BOTTOM, minWidth: minWidthForText(width, CHIP_PX, 320) };
}

/**
 * The expression tree: each operator a box with its glyph and parameters, base relations
 * at the leaves. `current` is the operator running now, `selected` the one picked for
 * editing; `counts` shows a row-count chip under each node whose result is known.
 */
export function ExprTree({ expr, ev, current, selected, counted, chipTone = () => 'hi', onSelect, label }: {
  expr: Expr;
  ev: Evaluation;
  current: string | null;
  selected?: string | null;
  counted: ReadonlySet<string>;
  chipTone?: (id: string) => Tone;
  onSelect?: (id: string) => void;
  label: string;
}) {
  const byId = new Map(postOrder(expr).map((x) => [x.id, x]));
  const { width, height, pad, minWidth } = treeSize(expr);
  const state = (id: string) => {
    const r = ev.get(id);
    return [
      'ra-node',
      byId.get(id)!.op === 'rel' ? 'is-rel' : 'is-op',
      id === current && 'is-current',
      id === selected && 'is-selected',
      r && !r.ok && r.own && 'is-error',
    ].filter(Boolean).join(' ');
  };
  const countText = (id: string) => {
    const r = ev.get(id);
    return r && r.ok ? plural(r.out.rows.length, 'row') : 'error';
  };
  return (
    <WideRegion minWidth={minWidth} label={`${label}: scroll sideways to see all of it`}>
      <TreeSvg
        shape={{ root: expr.id, children: (id) => children(byId.get(id)!).map((c) => c.id) }}
        layout="tidy"
        width={width}
        height={height}
        pad={pad}
        levelGap={LEVEL_GAP}
        top={TOP}
        natural
        className="ra-tree"
        nodeClass={state}
        onNodeClick={onSelect}
        nodeAriaLabel={(id) => `${nodeTitle(byId.get(id)!)}${counted.has(id) ? `, ${countText(id)}` : ''}${id === selected ? ', selected' : ''}`}
        ariaLabel={label}
        renderNode={(id) => {
          const title = nodeTitle(byId.get(id)!);
          const w = boxW(title);
          return (
            <>
              <rect x={-w / 2} y={-NODE_H / 2} width={w} height={NODE_H} rx={8} className="ra-box" />
              <text y={4.5} textAnchor="middle" className="ra-label">{clip(title)}</text>
              {counted.has(id) && (
                <text y={NODE_H / 2 + 14} textAnchor="middle" className={`ra-count tone-${ev.get(id)?.ok === false ? 'bad' : chipTone(id)}`}>{countText(id)}</text>
              )}
            </>
          );
        }}
      />
    </WideRegion>
  );
}
