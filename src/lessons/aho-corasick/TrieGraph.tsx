import { useMemo } from 'react';
import { GraphView, type GraphEdge, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import type { LinkMark } from './links';
import { ROOT, type Machine } from './model';

const LAYER_GAP = 100;
const NODE_GAP = 40;
const BOX = { w: 82, h: 30, rx: 8 } as const;
const GRAPH_PAD = 90;
const MIN_GRAPH_WIDTH = 360;
const LINK_WIDTH = 2;

/** Hand-built trie drawing: pattern ends are double outlines, trie edges carry their letter, extra links are dashed. */
export function TrieGraph({
  machine, links, nodeMark, edgeMark, onNodeClick, ariaLabel, reveal,
}: {
  machine: Machine;
  links: readonly LinkMark[];
  nodeMark?: (id: number) => GraphNodeMark | null | undefined;
  /** Marks a trie edge by its endpoints. */
  edgeMark?: (from: number, to: number) => GraphEdgeMark | null | undefined;
  onNodeClick?: (id: number) => void;
  ariaLabel: string;
  /** States to keep on screen when the trie is wider than the view (the token, the link being followed, the next state to set). */
  reveal?: readonly number[];
}) {
  const { trie } = machine;
  const nodes = useMemo(
    () => trie.states.map((s) => ({ id: s.id, shape: 'box' as const, accept: s.ends >= 0, label: s.id === ROOT ? '0 root' : `${s.id} ${s.string}` })),
    [trie],
  );
  const trieEdges = useMemo(
    () => trie.states.filter((s) => s.id !== ROOT).map((s): GraphEdge<number> => ({ from: s.parent, to: s.id, label: s.letter })),
    [trie],
  );
  const edges = useMemo(() => [...trieEdges, ...links.map((l): GraphEdge<number> => ({ from: l.from, to: l.to }))], [trieEdges, links]);
  const maxDepth = Math.max(...trie.states.map((s) => s.depth));
  const minWidth = Math.max(MIN_GRAPH_WIDTH, maxDepth * LAYER_GAP + BOX.w + GRAPH_PAD);
  const depths = (reveal ?? []).map((id) => trie.states[id]?.depth).filter((d): d is number => d !== undefined);
  const span = depths.length
    ? { from: (GRAPH_PAD / 2 + Math.min(...depths) * LAYER_GAP) / minWidth, to: (GRAPH_PAD / 2 + Math.max(...depths) * LAYER_GAP + BOX.w) / minWidth }
    : null;
  return (
    <WideRegion minWidth={minWidth} label="The trie: scroll sideways to see all of it" reveal={span}>
      <GraphView
        nodes={nodes}
        edges={edges}
        layoutEdges={trieEdges}
        directed
        layout="layered"
        spacing={{ direction: 'right', layerGap: LAYER_GAP, nodeGap: NODE_GAP, padMain: 50, padCross: 24 }}
        box={BOX}
        labelHalo
        nodeMark={nodeMark}
        onNodeClick={onNodeClick}
        nodeAriaLabel={(id) => `State ${id}, ${id === ROOT ? 'the root' : trie.states[id].string}`}
        edgeMark={(e, index) => {
          if (index >= trieEdges.length) {
            const link = links[index - trieEdges.length];
            return { tone: link.tone, dashed: true, width: LINK_WIDTH };
          }
          return edgeMark?.(e.from, e.to);
        }}
        ariaLabel={ariaLabel}
        className="ac-graph"
      />
    </WideRegion>
  );
}
