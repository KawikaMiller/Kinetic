import type { ReactNode } from 'react';
import { clamp } from '../core/math';
import { minWidthForText } from '../core/scale';
import { TreeSvg, type TreeEdgeMark, type TreeGeometry, type TreeNodeMark, type TreeShape } from './TreeSvg';
import { WideRegion } from './WideRegion';

const COLUMN_PX = 30;
/** Space between the drawing's edge and the outermost node's centre. */
export const TREE_SIDE_PAD = 30;
const MIN_WIDTH = 330;
const MAX_WIDTH = 960;
const BOTTOM = 40;
const TARGET_DEPTH_PX = 300;
const MIN_GAP = 14;
export const TREE_NODE_RADIUS = 13;
/** Smallest text a binary-tree lesson draws: the badge under a node (balance factor, colour and black-height). */
export const TREE_BADGE_TEXT_PX = 10;

/** The tree shape this draws: node ids are the keys, children are keys or null. */
export interface BinaryTreeLike {
  root: number | null;
  nodes: Readonly<Record<number, { left: number | null; right: number | null }>>;
}

export interface BinaryTreeBoxOptions {
  /** Room above the root's centre. */
  top: number;
  /** The tallest a level gap may grow (a short tree does not spread out). */
  maxGap: number;
}

/**
 * Size of the drawing for a tree of `size` nodes and `levels` levels: one column per node, levels
 * squeezed to fit a chain on screen.
 */
export function binaryTreeBox(size: number, levels: number, { top, maxGap }: BinaryTreeBoxOptions): { width: number; height: number; gap: number } {
  const depth = Math.max(0, levels - 1);
  const gap = clamp(TARGET_DEPTH_PX / Math.max(1, depth), MIN_GAP, maxGap);
  return { width: clamp(size * COLUMN_PX + 2 * TREE_SIDE_PAD, MIN_WIDTH, MAX_WIDTH), height: top + depth * gap + BOTTOM, gap };
}

export interface BinaryTreeViewProps extends BinaryTreeBoxOptions {
  tree: BinaryTreeLike;
  /** Levels used to size the drawing: the lesson's own height of the tree. */
  levels: number;
  /** Class on the SVG (lesson prefix). */
  className: string;
  /** Draws one node around (0, 0); the default circle and key are the lesson's to supply. */
  renderNode: (key: number) => ReactNode;
  nodeMark?: (key: number) => TreeNodeMark | null | undefined;
  edgeMark?: (parent: number, child: number) => TreeEdgeMark | null | undefined;
  nodeScale?: (key: number) => number;
  onNodeClick?: (key: number) => void;
  nodeAriaLabel?: (key: number) => string;
  overlay?: (geometry: TreeGeometry<number>) => ReactNode;
  ariaLabel: string;
}

/**
 * A binary search tree on `TreeSvg`'s in-order layout inside a `WideRegion`: the box is sized from
 * the node count and levels, and a phone scrolls the drawing sideways before its badge text drops
 * under 8px. avl-trees and red-black-trees each draw their nodes with `renderNode`.
 */
export function BinaryTreeView({ tree, levels, top, maxGap, className, renderNode, nodeMark, edgeMark, nodeScale, onNodeClick, nodeAriaLabel, overlay, ariaLabel }: BinaryTreeViewProps) {
  const { nodes, root } = tree;
  const size = Object.keys(nodes).length;
  const box = binaryTreeBox(size, levels, { top, maxGap });
  const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] };
  return (
    <WideRegion minWidth={minWidthForText(box.width, TREE_BADGE_TEXT_PX)} label={`Tree: scroll sideways to see all ${size} nodes`}>
      <TreeSvg
        shape={shape}
        layout="inorder"
        width={box.width}
        height={box.height}
        pad={TREE_SIDE_PAD}
        top={top}
        levelGap={box.gap}
        radius={TREE_NODE_RADIUS}
        natural
        className={className}
        label={(id) => id}
        renderNode={renderNode}
        nodeMark={nodeMark}
        edgeMark={edgeMark}
        nodeScale={nodeScale}
        onNodeClick={onNodeClick}
        nodeAriaLabel={nodeAriaLabel}
        overlay={overlay}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
