import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { CANVAS, EDGES, POSITIONS, REGIONS, asName, type Asn, type AsEdge } from './asgraph';

/** Narrowest container at which the drawing, regions included, keeps its text readable on a phone. */
export const MAP_MIN_WIDTH = 560;
const ARROW_AT = 0.58;
const NODE_RADIUS = 22;

/** Small arrowheads for customer-to-provider links: the arrow points at the provider. Peer links have none. */
function Arrows() {
  return (
    <>
      {EDGES.filter((e) => e.kind === 'c2p').map((e) => {
        const from = POSITIONS[e.a];
        const to = POSITIONS[e.b];
        const x = from.x + (to.x - from.x) * ARROW_AT;
        const y = from.y + (to.y - from.y) * ARROW_AT;
        const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        return <path key={`${e.a}-${e.b}`} className="bgp-arrow" d="M-6,-5 L7,0 L-6,5 z" transform={`translate(${x} ${y}) rotate(${angle})`} />;
      })}
    </>
  );
}

function Regions() {
  return (
    <>
      {REGIONS.map((r) => (
        <g key={r.tier}>
          <rect className={`bgp-region is-${r.tint}`} x={6} y={r.y} width={CANVAS.width - 12} height={r.h} rx={12} />
          <text className="bgp-region-label" x={16} y={r.y + 15}>
            {r.label}
          </text>
        </g>
      ))}
    </>
  );
}

/** The eight ASes in their regions. Every link is violet (solid customer-to-provider, dashed peer) unless the scene marks it. */
export function AsMap({
  edgeMark, nodeMark, onNodeClick, ariaLabel,
}: {
  edgeMark?: (e: AsEdge) => GraphEdgeMark | null | undefined;
  nodeMark?: (asn: Asn) => GraphNodeMark | null | undefined;
  onNodeClick?: (asn: Asn) => void;
  ariaLabel: string;
}) {
  return (
    <WideRegion minWidth={MAP_MIN_WIDTH} label="Map of the eight autonomous systems: scroll sideways to see all of it">
      <GraphView
        nodes={Object.keys(POSITIONS).map((k) => ({ id: Number(k), at: POSITIONS[Number(k)], label: String(k) }))}
        edges={EDGES.map((e) => ({ from: e.a, to: e.b }))}
        width={CANVAS.width}
        height={CANVAS.height}
        radius={NODE_RADIUS}
        underlay={
          <>
            <Regions />
            <Arrows />
          </>
        }
        edgeMark={(_, i) => edgeMark?.(EDGES[i]) ?? { tone: 'violet', dashed: EDGES[i].kind === 'p2p', width: 2.5 }}
        nodeMark={nodeMark}
        onNodeClick={onNodeClick}
        nodeAriaLabel={asName}
        edgeAriaLabel={(_, i) => `${asName(EDGES[i].a)} ${EDGES[i].kind === 'c2p' ? 'is a customer of' : 'peers with'} ${asName(EDGES[i].b)}`}
        ariaLabel={ariaLabel}
        className="bgp-graph"
      />
    </WideRegion>
  );
}
