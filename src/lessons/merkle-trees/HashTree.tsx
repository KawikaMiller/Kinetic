import { useMemo } from 'react';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { flatten, shortHash, type MNode } from './merkle';
import { TREE_HEIGHT, TREE_MIN_WIDTH, TREE_WIDTH, depthOf } from './treeSize';

const NODE_W = 34;
const NODE_H = 20;

export interface HashTreeProps {
  tree: MNode;
  /** A node's mark: tone and fill, or null for a plain node. */
  mark: (n: MNode) => TreeNodeMark | null;
  /** The text a node shows (default: its hash at 4 hex characters). */
  text?: (n: MNode) => string;
  /** Clicking a leaf (its position among the leaves). */
  onLeaf?: (index: number) => void;
  ariaLabel: string;
  /** Marks an edge as part of a path. */
  edge?: (parent: MNode, child: MNode) => boolean;
}

/** A Merkle tree as an SVG tree of small boxes holding the first four hex characters of each hash (display only: the full hash is what is compared). */
export function HashTree({ tree, mark, text, onLeaf, ariaLabel, edge }: HashTreeProps) {
  const byId = useMemo(() => Object.fromEntries(flatten(tree).map((n) => [n.id, n])), [tree]);
  const shape = useMemo(() => ({ root: tree.id, children: (id: string) => (byId[id].left ? [byId[id].left!.id, byId[id].right!.id] : []) }), [tree, byId]);
  return (
    <WideRegion minWidth={TREE_MIN_WIDTH} label="Hash tree: scroll sideways to see all of it">
    <TreeSvg
      shape={shape}
      layout="tidy"
      width={TREE_WIDTH}
      height={TREE_HEIGHT}
      pad={24}
      top={20}
      bottomRoom={40}
      levelGap={Math.min(62, (TREE_HEIGHT - 60) / Math.max(1, depthOf(tree)))}
      natural
      onNodeClick={onLeaf ? (id) => { if (!byId[id].left) onLeaf(byId[id].lo); } : undefined}
      nodeAriaLabel={(id) => (byId[id].left ? `Hash of leaves ${byId[id].lo} to ${byId[id].hi - 1}: ${shortHash(byId[id].hash)}` : `Leaf ${byId[id].lo}: ${shortHash(byId[id].hash)}`)}
      nodeMark={(id) => mark(byId[id])}
      edgeMark={edge ? (p, c) => (edge(byId[p], byId[c]) ? { tone: 'hi' } : null) : undefined}
      renderNode={(id) => {
        const n = byId[id];
        return (
          <>
            <rect className="mkl-box" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={5} />
            <text className="mkl-hash" y={3.5} textAnchor="middle">{text ? text(n) : shortHash(n.hash)}</text>
            {!n.left && <text className="mkl-index" y={NODE_H + 4} textAnchor="middle">{n.copy ? 'copy' : `#${n.lo}`}</text>}
          </>
        );
      }}
      ariaLabel={ariaLabel}
    />
    </WideRegion>
  );
}

