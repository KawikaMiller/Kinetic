import { useMemo } from 'react';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { layoutTree, treeX } from '../../core/treeLayout';
import { childrenOf, depthsOf } from './model';

const TREE_WIDTH = 520;
const TREE_PAD = 40;
const LEVEL_PX = 46;
const MIN_HEIGHT = 230;
const TOP_PAD = 90;
const NODE_RADIUS = 15;
const TREE_MIN_WIDTH = 480;

/**
 * The rooted tree, tidy layout, nodes labelled by number; a click on a node reports its number.
 * `reveal` lists the nodes to keep on screen when the tree is wider than a phone.
 */
export function TreeView({
  parents, nodeMark, onNodeClick, ariaLabel, reveal,
}: {
  parents: readonly number[];
  nodeMark?: (id: number) => TreeNodeMark | null | undefined;
  onNodeClick?: (id: number) => void;
  ariaLabel: string;
  reveal?: readonly number[];
}) {
  const shape = useMemo(() => {
    const kids = childrenOf(parents);
    return { root: 0, children: (id: number) => kids[id] };
  }, [parents]);
  const layout = useMemo(() => layoutTree(shape, 'tidy', {}), [shape]);
  const height = Math.max(MIN_HEIGHT, TOP_PAD + Math.max(...depthsOf(parents)) * LEVEL_PX);
  const xs = (reveal ?? []).flatMap((id) => {
    const place = layout.place.get(id);
    return place ? [treeX(place.col, layout.columns, TREE_WIDTH, TREE_PAD)] : [];
  });
  const span = xs.length ? { from: (Math.min(...xs) - NODE_RADIUS) / TREE_WIDTH, to: (Math.max(...xs) + NODE_RADIUS) / TREE_WIDTH } : null;
  return (
    <WideRegion minWidth={TREE_MIN_WIDTH} label="The tree: scroll sideways to see all of it" reveal={span}>
      <TreeSvg
        shape={shape}
        layout="tidy"
        width={TREE_WIDTH}
        height={height}
        pad={TREE_PAD}
        levelGap={LEVEL_PX}
        radius={NODE_RADIUS}
        label={(id) => id}
        nodeMark={nodeMark}
        onNodeClick={onNodeClick}
        nodeAriaLabel={(id) => `Node ${id}`}
        ariaLabel={ariaLabel}
        natural
      />
    </WideRegion>
  );
}
