import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import type { Tone } from '../../core/tone';
import { childrenOf, isLeaf, type Spec } from './tree';
import { boundText, roleOf, type NodeView } from './view';

export const BOARD_WIDTH = 640;
const BOARD_HEIGHT = 300;
const LEVEL_GAP = 66;
const NODE_R = 15;
const LEAF_R = 10;

/** Marks the lesson adds on top of the search: the selected leaf, the learner's predicted cuts. */
export interface BoardMarks {
  selected?: number | null;
  predicted?: ReadonlySet<number>;
}

/** The game tree: max nodes blue, min nodes violet, the node being worked on yellow, skipped subtrees faded and struck. */
export function TreeBoard({
  spec, leaves, view, showWindows, marks = {}, onNodeClick, ariaLabel,
}: {
  spec: Spec;
  leaves: readonly number[];
  view: NodeView;
  showWindows: boolean;
  marks?: BoardMarks;
  onNodeClick?: (id: number) => void;
  ariaLabel: string;
}) {
  const first = (spec.b ** spec.d - 1) / (spec.b - 1);
  const shape: TreeShape<number> = { root: 0, children: (id) => (isLeaf(id, spec) ? [] : childrenOf(id, spec.b)) };
  const valueOf = (id: number): string => {
    if (isLeaf(id, spec)) return String(leaves[id - first]);
    return view.values.has(id) ? String(view.values.get(id)) : '?';
  };

  return (
    <TreeSvg
      shape={shape}
      layout="tidy"
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      pad={22}
      levelGap={LEVEL_GAP}
      ariaLabel={ariaLabel}
      nodeMark={(id) => {
        if (id === view.current) return { tone: 'hi', fill: 'solid' };
        if (marks.predicted?.has(id)) return { tone: 'orange', fill: 'tint', tint: 40 };
        if (marks.selected === id) return { tone: 'amber', fill: 'tint', tint: 40 };
        const role = roleOf(id, spec);
        if (role === 'leaf') return null;
        const tone: Tone = role === 'max' ? 'info' : 'violet';
        return { tone, fill: 'tint', tint: view.visited.has(id) ? 26 : 8 };
      }}
      nodeOpacity={(id) => (view.struck.has(id) ? 0.35 : 1)}
      edgeMark={(parent, child) => {
        if (view.struck.has(child)) return { tone: 'dim', dashed: true };
        return view.chosen.get(parent) === child ? { tone: 'ok' } : null;
      }}
      onNodeClick={onNodeClick}
      nodeAriaLabel={(id) => `${roleOf(id, spec) === 'leaf' ? 'Leaf' : roleOf(id, spec) === 'max' ? 'Max node' : 'Min node'} ${id}, value ${valueOf(id)}${view.struck.has(id) ? ', skipped' : ''}`}
      renderNode={(id) => {
        const leaf = isLeaf(id, spec);
        const window = !leaf && showWindows ? view.windows.get(id) : undefined;
        return (
          <>
            <circle r={leaf ? LEAF_R : NODE_R} />
            <text y={4} textAnchor="middle" className="gt-value">{valueOf(id)}</text>
            {view.struck.has(id) && <line className="gt-strike" x1={-NODE_R} y1={-NODE_R} x2={NODE_R} y2={NODE_R} />}
            {window && <text className="gt-window" y={NODE_R + 14} textAnchor="middle">({boundText(window[0])}, {boundText(window[1])})</text>}
          </>
        );
      }}
    />
  );
}
