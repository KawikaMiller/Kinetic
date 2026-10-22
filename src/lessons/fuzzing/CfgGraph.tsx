import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { nodeName, reachedNodes } from './model';
import { BRANCH, ENTRY, cfgEdges, edgeId, type BranchId, type TargetOptions } from './target';

const GRAPH_WIDTH = 520;
const GRAPH_HEIGHT = 280;
const NODE_RADIUS = 23;
const EDGE_WIDTH = 2.5;
const DIM_EDGE_WIDTH = 1.5;

/** Where each branch sits: the magic bytes along the top, the payload and checksum below, the reject node above the magic row. */
const POSITIONS: Record<number, { x: number; y: number }> = {
  [ENTRY]: { x: 40, y: 100 },
  [BRANCH.magic0]: { x: 125, y: 100 },
  [BRANCH.magic1]: { x: 210, y: 100 },
  [BRANCH.magic2]: { x: 295, y: 100 },
  [BRANCH.magicOk]: { x: 380, y: 100 },
  [BRANCH.lengthRead]: { x: 465, y: 100 },
  [BRANCH.reject]: { x: 210, y: 32 },
  [BRANCH.payloadByte]: { x: 465, y: 185 },
  [BRANCH.payloadDone]: { x: 380, y: 185 },
  [BRANCH.checksumRead]: { x: 295, y: 185 },
  [BRANCH.checksumOk]: { x: 210, y: 185 },
  [BRANCH.checksumBad]: { x: 295, y: 242 },
};

const SINGLE_HIDDEN: ReadonlySet<number> = new Set([BRANCH.magic0, BRANCH.magic1, BRANCH.magic2]);

/** The branches this mode has: the one-comparison mode has no per-byte branches b1..b3. */
const nodesOf = (magic: TargetOptions['magic']): number[] => Object.keys(POSITIONS).map(Number).filter((n) => magic === 'bytewise' || !SINGLE_HIDDEN.has(n));

/**
 * The target's control-flow graph with a fuzzer's coverage painted on it: a covered branch and its edges
 * `--ok`, the branches the newest discovery reached `--hi`, a crash site `--bad`, anything not reached `--dim`.
 */
export function CfgGraph({
  magic, covered, newest, crashSites, ariaLabel,
}: {
  magic: TargetOptions['magic'];
  covered: ReadonlySet<number>;
  newest: ReadonlySet<number>;
  crashSites: ReadonlySet<BranchId>;
  ariaLabel: string;
}) {
  const nodes: GraphNode<number>[] = nodesOf(magic).map((n) => ({ id: n, label: nodeName(n), at: POSITIONS[n], shape: 'circle' }));
  const edges: GraphEdge<number>[] = cfgEdges(magic).map(([from, to]) => ({ from, to }));
  const reached = reachedNodes(covered);
  return (
    <WideRegion minWidth={GRAPH_WIDTH}>
      <GraphView
        nodes={nodes}
        edges={edges}
        directed
        layout="fixed"
        width={GRAPH_WIDTH}
        height={GRAPH_HEIGHT}
        radius={NODE_RADIUS}
        arrowSize={5}
        nodeMark={(n) => {
          if (crashSites.has(n as BranchId)) return { tone: 'bad', fill: 'tint' };
          if (newest.has(n)) return { tone: 'hi', fill: 'tint' };
          return reached.has(n) ? { tone: 'ok', fill: 'tint' } : { tone: 'dim', fill: 'tint', tint: 6 };
        }}
        edgeMark={(e) => (covered.has(edgeId(e.from, e.to)) ? { tone: 'ok', width: EDGE_WIDTH } : { tone: 'dim', dashed: true, width: DIM_EDGE_WIDTH })}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
