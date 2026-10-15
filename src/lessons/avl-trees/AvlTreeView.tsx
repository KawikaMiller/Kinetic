import { TreeSvg, type TreeEdgeMark, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { balanceOf, type Tree } from './model';
import { signed } from './text';
import { RADIUS, SIDE_PAD, TOP, treeBox } from './treeBox';

const BADGE_DY = RADIUS + 10;

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
  const { nodes, root } = tree;
  const box = treeBox(tree);
  const shape: TreeShape<number> = { root, children: (id) => [nodes[id].left, nodes[id].right] };
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
      className="avl-svg"
      label={(id) => id}
      renderNode={(id) => (
        <>
          <circle r={RADIUS} />
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
