import { balanceOf, heightOf, type Tree } from '../../core/avl';
import { BinaryTreeView, TREE_NODE_RADIUS } from '../../components/BinaryTreeView';
import type { TreeEdgeMark, TreeNodeMark } from '../../components/TreeSvg';
import { signed } from './text';

const BADGE_DY = TREE_NODE_RADIUS + 10;
const TOP = 30;
const MAX_LEVEL_GAP = 48;

export interface AvlTreeViewProps {
  tree: Tree;
  /** Write the balance factor under each node (not for the plain tree, which has none). */
  showBalance?: boolean;
  /** Write the stored height beside it. */
  showHeight?: boolean;
  nodeMark?: (key: number) => TreeNodeMark | null | undefined;
  edgeMark?: (parent: number, child: number) => TreeEdgeMark | null | undefined;
  nodeScale?: (key: number) => number;
  onNodeClick?: (key: number) => void;
  ariaLabel: string;
}

/** A binary tree on TreeSvg in-order layout, with each node's balance factor (and height) written under it. */
export function AvlTreeView({ tree, showBalance = true, showHeight = false, nodeMark, edgeMark, nodeScale, onNodeClick, ariaLabel }: AvlTreeViewProps) {
  const { nodes } = tree;
  const badge = (id: number) => {
    const bf = balanceOf(tree, id);
    const parts = [showHeight ? `h${nodes[id].h}` : '', showBalance ? signed(bf) : ''].filter(Boolean).join(' ');
    return (
      <text className={`avl-bf ${showBalance && Math.abs(bf) > 1 ? 'is-bad' : ''}`} y={BADGE_DY}>
        {parts}
      </text>
    );
  };
  return (
    <BinaryTreeView
      tree={tree}
      levels={heightOf(tree)}
      top={TOP}
      maxGap={MAX_LEVEL_GAP}
      className="avl-svg"
      renderNode={(id) => (
        <>
          <circle r={TREE_NODE_RADIUS} />
          <text className="avl-key" y={3.5}>
            {id}
          </text>
          {(showBalance || showHeight) && badge(id)}
        </>
      )}
      nodeMark={nodeMark}
      edgeMark={edgeMark}
      nodeScale={nodeScale}
      onNodeClick={onNodeClick}
      nodeAriaLabel={(id) => `Node ${id}, balance factor ${signed(balanceOf(tree, id))}`}
      ariaLabel={ariaLabel}
    />
  );
}
