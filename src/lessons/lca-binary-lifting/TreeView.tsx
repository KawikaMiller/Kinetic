import { useMemo } from 'react';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { childrenOf, depthsOf } from './model';

const TREE_WIDTH = 520;
const LEVEL_PX = 46;
const MIN_HEIGHT = 230;
const TOP_PAD = 90;
const NODE_RADIUS = 15;
const TREE_MIN_WIDTH = 480;

/** The rooted tree, tidy layout, nodes labelled by number; a click on a node reports its number. */
export function TreeView({
  parents, nodeMark, onNodeClick, ariaLabel,
}: {
  parents: readonly number[];
  nodeMark?: (id: number) => TreeNodeMark | null | undefined;
  onNodeClick?: (id: number) => void;
  ariaLabel: string;
}) {
  const shape = useMemo(() => {
    const kids = childrenOf(parents);
    return { root: 0, children: (id: number) => kids[id] };
  }, [parents]);
  const height = Math.max(MIN_HEIGHT, TOP_PAD + Math.max(...depthsOf(parents)) * LEVEL_PX);
  return (
    <WideRegion minWidth={TREE_MIN_WIDTH} label="The tree: scroll sideways to see all of it">
      <TreeSvg
        shape={shape}
        layout="tidy"
        width={TREE_WIDTH}
        height={height}
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
