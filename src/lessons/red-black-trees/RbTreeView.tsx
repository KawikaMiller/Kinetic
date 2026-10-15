import { TreeSvg, type TreeGeometry, type TreeShape } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { blackHeights, colorOf, type Group, type RbTree } from './model';
import { colorWord } from './text';
import { RADIUS, SIDE_PAD, TOP, treeBox, treeMinWidth } from './treeBox';

const BADGE_DY = RADIUS + 10;
const RING_GAP = 4;
const GHOST_DX = 30;
const GHOST_R = 10;
const HULL_PAD_X = 20;
const HULL_PAD_Y = 21;
const EMPHASIS = 1.12;

export interface RbTreeViewProps {
  tree: RbTree;
  /** Under each node: its colour letter, the letter with its black-height, or nothing. */
  badge?: 'color' | 'blackHeight' | 'none';
  rings?: (key: number) => Tone | null | undefined;
  /** A spot one black short: a ring on the node, or a dashed ghost where an empty child is. */
  short?: { node: number | null; parent: number; side: 'left' | 'right' } | null;
  /** Draw each group as one multiway node. */
  groups?: readonly Group[] | null;
  onNodeClick?: (key: number) => void;
  ariaLabel: string;
}

/** A binary tree on TreeSvg: red nodes pink with an R, black nodes grey with a B, so colour is never the only cue. */
export function RbTreeView({ tree, badge = 'color', rings, short, groups, onNodeClick, ariaLabel }: RbTreeViewProps) {
  const { nodes, root } = tree;
  const box = treeBox(tree);
  const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] };
  const bh = badge === 'blackHeight' ? blackHeights(tree) : null;
  const badgeText = (id: number) => {
    const letter = nodes[id].color;
    if (badge === 'none') return '';
    if (!bh) return letter;
    const h = bh.get(id);
    return `${letter}${h === null || h === undefined ? '?' : h}`;
  };
  const overlay = ({ at, levelGap }: TreeGeometry<number>) => (
    <>
      {groups?.map((g) => {
        const pts = g.keys.map((k) => at(k)).filter((p): p is { x: number; y: number } => p !== undefined);
        if (pts.length === 0) return null;
        const x0 = Math.min(...pts.map((p) => p.x)) - HULL_PAD_X;
        const x1 = Math.max(...pts.map((p) => p.x)) + HULL_PAD_X;
        const y0 = Math.min(...pts.map((p) => p.y)) - HULL_PAD_Y;
        const y1 = Math.max(...pts.map((p) => p.y)) + HULL_PAD_Y;
        return (
          <g key={g.top} className="rb-hull">
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={RADIUS + 4} />
            <text x={x0 + 6} y={y0 - 3}>{`${g.keys.length + 1}-node`}</text>
          </g>
        );
      })}
      {short && short.node === null && (
        <ShortGhost parent={at(short.parent)} side={short.side} gap={levelGap} />
      )}
    </>
  );
  const ringOf = (id: number): Tone | null => {
    if (short && short.node === id) return 'violet';
    return rings?.(id) ?? null;
  };
  return (
    <WideRegion minWidth={treeMinWidth(tree)} label={`Tree: scroll sideways to see all ${Object.keys(nodes).length} nodes`}>
      <TreeSvg
        shape={shape}
        layout="inorder"
        width={box.width}
        height={box.height}
        pad={SIDE_PAD}
        top={TOP}
        levelGap={box.gap}
        radius={RADIUS}
        natural
        className="rb-svg"
        label={(id) => id}
        renderNode={(id) => {
          const ring = ringOf(id);
          return (
            <>
              {ring && <circle className={`rb-ring tone-${ring}`} r={RADIUS + RING_GAP} />}
              <circle className={`rb-node ${nodes[id].color === 'R' ? 'is-red' : 'is-black'}`} r={RADIUS} />
              <text className={`rb-key ${nodes[id].color === 'R' ? 'is-red' : 'is-black'}`} y={3.5}>
                {id}
              </text>
              {badge !== 'none' && (
                <text className="rb-badge" y={BADGE_DY}>
                  {badgeText(id)}
                </text>
              )}
            </>
          );
        }}
        nodeScale={(id) => (ringOf(id) === 'hi' ? EMPHASIS : 1)}
        onNodeClick={onNodeClick}
        nodeAriaLabel={(id) => `Node ${id}, ${colorWord(colorOf(tree, id))}${onNodeClick ? ', press to recolour' : ''}`}
        overlay={overlay}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}

function ShortGhost({ parent, side, gap }: { parent: { x: number; y: number } | undefined; side: 'left' | 'right'; gap: number }) {
  if (!parent) return null;
  const x = parent.x + (side === 'left' ? -GHOST_DX : GHOST_DX);
  const y = parent.y + Math.min(gap, 44);
  return (
    <g className="rb-ghost">
      <line x1={parent.x} y1={parent.y} x2={x} y2={y} />
      <circle cx={x} cy={y} r={GHOST_R} />
      <text x={x} y={y + 3}>
        nil
      </text>
    </g>
  );
}
