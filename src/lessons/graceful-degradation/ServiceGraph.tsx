import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import {
  SERVICES, SERVICE_NAME, type Health, type HealthMap, type ServiceId, type Tag,
} from './model';

type Id = ServiceId | 'page';

const WIDTH = 440;
const ROW_GAP = 44;
const TOP = 30;
const HEIGHT = TOP * 2 + ROW_GAP * (SERVICES.length - 1);
const PAGE_AT = { x: 70, y: HEIGHT / 2 };
const SERVICE_X = 350;
const BOX = { w: 104, h: 32 };

const NODES: GraphNode<Id>[] = [
  { id: 'page', label: 'Page', shape: 'box', at: PAGE_AT },
  ...SERVICES.map((s, i) => ({ id: s as Id, label: SERVICE_NAME[s], shape: 'box' as const, at: { x: SERVICE_X, y: TOP + i * ROW_GAP } })),
];
const EDGES: GraphEdge<Id>[] = SERVICES.map((s) => ({ from: 'page', to: s }));

/** Width the drawing keeps on a phone: it scrolls sideways inside its region below this. */
export const SERVICE_GRAPH_MIN_WIDTH = WIDTH;

/** The page and the eight services it reads: click or press Enter on a service to cycle up, slow, down. Hard dependencies are solid lines, soft ones dashed. */
export function ServiceGraph({ health, tags, journeyOk, onCycle }: { health: HealthMap; tags: Record<ServiceId, Tag>; journeyOk: boolean; onCycle: (s: ServiceId) => void }) {
  const markFor = (h: Health) => (h === 'down' ? { tone: 'bad' as const, fill: 'solid' as const } : h === 'slow' ? { tone: 'orange' as const, fill: 'solid' as const } : { tone: 'ok' as const, fill: 'tint' as const });
  return (
    <GraphView<Id>
      nodes={NODES}
      edges={EDGES}
      directed
      width={WIDTH}
      height={HEIGHT}
      box={BOX}
      ariaLabel="The page and the eight services it reads. Press a service to change its health."
      nodeMark={(id) => (id === 'page' ? { tone: journeyOk ? 'ok' : 'bad', fill: 'tint' } : markFor(health[id]))}
      edgeMark={(e) => ({ tone: 'muted', dashed: tags[e.to as ServiceId] === 'soft', width: 2 })}
      onNodeClick={(id) => {
        if (id !== 'page') onCycle(id);
      }}
      nodeAriaLabel={(id) => (id === 'page' ? 'The page' : `${SERVICE_NAME[id]}: ${health[id]}, tagged ${tags[id]}. Press to change.`)}
    />
  );
}
