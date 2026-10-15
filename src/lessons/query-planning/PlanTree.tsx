import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { misestimate, planNodes, type NodeKind, type PlanNode } from './model';
import type { Tone } from '../../core/tone';

const NODE_W = 300;
const NODE_H = 66;
const LEVEL_GAP = 84;
const TREE_TOP = 40;
const TREE_WIDTH = 340;
const TREE_PAD = 20;

/** Sort is a costly step (orange, not an error); an index in use is secondary (info); the rest are plain. */
const KIND_TONE: Record<NodeKind, Tone | null> = { Limit: null, Sort: 'orange', 'Seq Scan': null, 'Index Scan': 'info' };

const money = (x: number): string => x.toFixed(2);

/** The node's three text lines: what it is, where it reads, and the numbers. */
function nodeLines(node: PlanNode, analyze: boolean): [string, string, string] {
  const [head, ...rest] = node.title.split(' using ');
  const first = head.replace(/ on orders$/, '');
  const what = rest.length ? `using ${rest.join(' using ')}` : node.kind === 'Seq Scan' ? 'on orders' : (node.detail[0] ?? '');
  const rows = `rows ${Math.round(node.estRows).toLocaleString('en-US')}${analyze ? `  actual ${node.actualRows.toLocaleString('en-US')}` : ''}`;
  return [first, what, `cost ${money(node.startup)}..${money(node.total)}  ${rows}`];
}

/**
 * One plan as a vertical chain of nodes (a plan is a tree; with one table every node has one child).
 * Orange marks a Sort, blue an index scan, red a node whose estimate is far from the actual rows (shown
 * only with EXPLAIN ANALYZE), and a yellow ring the node whose cost is being worked out.
 */
export function PlanTree({ root, analyze, selected, onSelect, rejected }: {
  root: PlanNode;
  analyze: boolean;
  selected: number;
  onSelect: (depth: number) => void;
  /** A candidate that lost: drawn dim. */
  rejected: boolean;
}) {
  const nodes = planNodes(root);
  const shape: TreeShape<number> = { root: 0, children: (i) => (i + 1 < nodes.length ? [i + 1] : []) };
  const height = TREE_TOP + (nodes.length - 1) * LEVEL_GAP + NODE_H;
  return (
    <TreeSvg
      shape={shape}
      layout="tidy"
      width={TREE_WIDTH}
      height={height}
      pad={TREE_PAD}
      top={TREE_TOP}
      levelGap={LEVEL_GAP}
      natural
      ariaLabel={`Query plan: ${nodes.map((n) => n.kind).join(', then ')}`}
      onNodeClick={onSelect}
      nodeAriaLabel={(i) => `${nodes[i].kind}, cost ${money(nodes[i].total)}: show how this cost is worked out`}
      nodeClass={(i) => {
        const tone = KIND_TONE[nodes[i].kind];
        const off = analyze && misestimate(nodes[i].estRows, nodes[i].actualRows).flagged;
        return ['qp-node', tone ? `tone-${tone}` : '', off ? 'is-off' : '', i === selected ? 'is-costed' : '', rejected ? 'is-rejected' : ''].filter(Boolean).join(' ');
      }}
      renderNode={(i) => {
        const [a, b, c] = nodeLines(nodes[i], analyze);
        return (
          <>
            <rect x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} />
            <text className="qp-node-title" y={-NODE_H / 2 + 19} textAnchor="middle">{a}</text>
            <text className="qp-node-sub" y={-NODE_H / 2 + 36} textAnchor="middle">{b}</text>
            <text className="qp-node-sub" y={-NODE_H / 2 + 54} textAnchor="middle">{c}</text>
          </>
        );
      }}
    />
  );
}
