import { TreeSvg, type TreeEdgeMark, type TreeNodeMark } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { FACTOR_SHAPE, factorOf } from './tree';

const TREE_W = 820;
const TREE_H = 300;
const NODE_W = 104;
const NODE_H = 38;
const NODE_TEXT_PX = 11;
/** The narrowest width at which the node text stays readable. */
const TREE_MIN_WIDTH = minWidthForText(TREE_W, NODE_TEXT_PX);

/** The factors tree, drawn as pills of two short lines. Which nodes show, and how they are marked, is the scene's call. */
export function FactorTree({ shown, mark, edge, faded, onPick, ariaLabel }: {
  shown: (id: string) => boolean;
  mark: (id: string) => TreeNodeMark | null;
  edge?: (parent: string, child: string) => TreeEdgeMark | null;
  faded?: (id: string) => boolean;
  onPick?: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <WideRegion minWidth={TREE_MIN_WIDTH} label="Factors tree: scroll sideways to see all of it">
    <TreeSvg
      shape={FACTOR_SHAPE}
      layout="tidy"
      width={TREE_W}
      height={TREE_H}
      levelGap={78}
      top={30}
      pad={NODE_W / 2 + 4}
      hidden={(id) => !shown(id)}
      nodeMark={mark}
      edgeMark={edge}
      nodeOpacity={(id) => (faded?.(id) ? 0.4 : 1)}
      onNodeClick={onPick}
      nodeAriaLabel={(id) => factorOf(id).text}
      ariaLabel={ariaLabel}
      natural
      renderNode={(id) => {
        const [a, b] = factorOf(id).short;
        return (
          <>
            <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={9} className="pm-node" />
            <text y={-3} textAnchor="middle" className="pm-node-text">{a}</text>
            <text y={11} textAnchor="middle" className="pm-node-text">{b}</text>
          </>
        );
      }}
    />
    </WideRegion>
  );
}
