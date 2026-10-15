import { TreeSvg, type TreeEdgeMark, type TreeShape } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import type { SegFrame } from './frames';
import { ROOT, isLeaf, leftOf, rightOf, type SegTree } from './model';

const COLUMN_PX = 50;
const SIDE_PAD = 32;
const TOP = 30;
const BOTTOM = 26;
const LEVEL_PX = 60;
const BOX_W = 46;
const BOX_H = 34;
/** Smallest text drawn: the range label above each aggregate. */
export const SEG_TEXT_PX = 10;

const depthOf = (t: SegTree): number => {
  let id = ROOT;
  let d = 0;
  while (!isLeaf(t.nodes[id])) {
    id = leftOf(id);
    d++;
  }
  return d;
};

const size = (t: SegTree) => ({ width: t.n * COLUMN_PX + 2 * SIDE_PAD, height: TOP + depthOf(t) * LEVEL_PX + BOTTOM + BOX_H / 2 });

type Role = 'current' | 'cover' | 'partial' | 'outside' | null;

/** The role a frame gives a node; a node can be in several lists as the operation goes on, the latest news wins. */
const roleOf = (f: SegFrame, id: number): Role => {
  if (f.current === id) return 'current';
  if (f.covering.includes(id)) return 'cover';
  if (f.partial.includes(id)) return 'partial';
  if (f.outside.includes(id)) return 'outside';
  return null;
};

/** The segment tree as boxes: the cell range above, the aggregate inside, a lazy tag as a badge. Leaves line up under their cells. */
export function SegTreeView({ tree, frame, ariaLabel }: { tree: SegTree; frame: SegFrame; ariaLabel: string }) {
  const { width, height } = size(tree);
  const shape: TreeShape<number> = {
    root: ROOT,
    children: (id) => (isLeaf(tree.nodes[id]) ? [] : [leftOf(id), rightOf(id)]),
  };
  const edgeMark = (_parent: number, child: number): TreeEdgeMark | null => (frame.covering.includes(child) || frame.partial.includes(child) ? { tone: 'info' } : null);
  return (
    <WideRegion minWidth={minWidthForText(width, SEG_TEXT_PX)} label={`Segment tree over ${tree.n} cells: scroll sideways to see all of it`}>
      <TreeSvg
        shape={shape}
        layout="tidy"
        width={width}
        height={height}
        pad={SIDE_PAD}
        top={TOP}
        levelGap={LEVEL_PX}
        natural
        className="st-svg"
        label={(id) => id}
        edgeMark={edgeMark}
        renderNode={(id) => {
          const n = tree.nodes[id];
          const role = roleOf(frame, id);
          const pushed = frame.pushed.includes(id);
          return (
            <>
              <rect className={`st-box ${role ? `is-${role}` : ''} ${pushed ? 'is-pushed' : ''}`} x={-BOX_W / 2} y={-BOX_H / 2} width={BOX_W} height={BOX_H} rx={7} />
              <text className="st-range" y={-4}>
                {isLeaf(n) ? `[${n.l}]` : `${n.l}..${n.r}`}
              </text>
              <text className="st-agg" y={11}>
                {Number.isFinite(n.agg) ? n.agg : n.agg > 0 ? '+inf' : '-inf'}
              </text>
              {n.tag !== 0 && (
                <g className="st-tag">
                  <rect x={BOX_W / 2 - 14} y={-BOX_H / 2 - 9} width={28} height={13} rx={4} />
                  <text x={BOX_W / 2} y={-BOX_H / 2 + 1}>{n.tag > 0 ? `+${n.tag}` : `−${-n.tag}`}</text>
                </g>
              )}
            </>
          );
        }}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
