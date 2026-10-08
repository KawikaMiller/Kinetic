import { CellGridGroup } from '../../components/CellGrid';
import { cellGridLayout } from '../../components/cellGridLayout';
import { Packet, SceneNode } from '../../components/scene';
import { endpoints, ownedBy, readyOwned, SLOTS, type Cluster, type TickReport } from './model';
import { GRID_ROWS, liveSets, nodeIsDown, nodeLabel, podAt, podCell, podState, rings } from './view';

export const SCENE_W = 560;
const GRID_COLS = 3;
const CELL = 76;
const CELL_GAP = 14;
const GRID_AT = { x: (SCENE_W - (GRID_COLS * CELL + (GRID_COLS - 1) * CELL_GAP)) / 2, y: 156 };
const GRID_SHAPE = { rows: GRID_ROWS, cols: GRID_COLS, size: { cell: CELL, gap: CELL_GAP, font: 15 }, colLabels: ['node-1', 'node-2', 'node-3'] } as const;
const SERVICE_AT = { x: SCENE_W / 2, y: 108 };
const DEPLOY_AT = { x: 110, y: 34 };
const SET_X = [290, 440] as const;
const SERVICE_BOX = { w: 190, h: 44 };
/** The most sets drawn beside the Deployment (a rollout shows the old and the new). */
const SETS_SHOWN = 2;

export const sceneHeight = GRID_AT.y + 16 + GRID_ROWS * (CELL + CELL_GAP) + 10;

interface Props {
  cluster: Cluster;
  report: TickReport | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
}

export function ClusterScene({ cluster, report, selected, onSelect }: Props) {
  const layout = cellGridLayout(GRID_SHAPE, GRID_AT);
  const sets = liveSets(cluster);
  const shown = sets.slice(-SETS_SHOWN);
  const d = cluster.deployment;
  return (
    <svg viewBox={`0 0 ${SCENE_W} ${sceneHeight}`} className="k8s-scene" role="group" aria-label="Cluster: a Deployment, its ReplicaSets, a Service and three nodes with pod slots">
      <SceneNode at={DEPLOY_AT} w={180} h={54} title="Deployment web" sub={`replicas: ${d.replicas}, image ${d.image}`} tone="info" />
      {shown.map((s, i) => (
        <SceneNode
          key={s.name}
          at={{ x: SET_X[i], y: DEPLOY_AT.y }}
          w={132}
          h={54}
          title={`ReplicaSet ${s.name.replace('web-', '')}`}
          sub={`${ownedBy(cluster, s).length} of ${s.spec} · ${readyOwned(cluster, s).length} Ready`}
          tone={sets.length > 1 ? (s === sets[0] ? 'violet' : 'sky') : 'info'}
          on={sets.length > 1}
        />
      ))}
      <SceneNode at={SERVICE_AT} w={SERVICE_BOX.w} h={SERVICE_BOX.h} title="Service web" sub={`app=web → ${endpoints(cluster).length} endpoints`} tone="info" />
      <CellGridGroup
        at={GRID_AT}
        {...GRID_SHAPE}
        colLabels={cluster.nodes.map((_, i) => nodeLabel(cluster, i))}
        cell={(r, c) => podCell(cluster, c, r)}
        highlight={rings(cluster, selected)}
        onCellClick={(r, c) => onSelect(podAt(cluster, c, r)?.id ?? null)}
        cellAriaLabel={(r, c) => {
          const p = podAt(cluster, c, r);
          return p ? `${p.name} on ${cluster.nodes[c].name}: ${podState(p)}` : `${cluster.nodes[c].name}, free slot ${r + 1} of ${SLOTS}`;
        }}
        cellTitle={(r, c) => podAt(cluster, c, r)?.name ?? 'free slot'}
        ariaLabel="Pod slots on each node"
        overlay={(g) => (
          <>
            {cluster.nodes.map((_, c) =>
              nodeIsDown(cluster, c) ? (
                <rect key={c} className="k8s-down" x={g.at(0, c).x - 3} y={g.at(0, c).y - 3} width={g.cell + 6} height={g.at(GRID_ROWS - 1, c).y + g.cell - g.at(0, c).y + 6} rx={10} />
              ) : null,
            )}
          </>
        )}
      />
      {report?.traffic.map((t, i) => {
        const pod = t.pod === null ? undefined : cluster.pods.find((p) => p.id === t.pod);
        const to = pod && pod.node !== null && pod.slot !== null ? layout.center(pod.slot, pod.node) : { x: SERVICE_AT.x, y: GRID_AT.y - 8 };
        return (
          <Packet
            key={`${report.tick}-${i}`}
            path={[{ x: SERVICE_AT.x, y: SERVICE_AT.y + SERVICE_BOX.h / 2 }, to]}
            label={t.ok ? 'req' : t.pod === null ? '503' : 'timeout'}
            color={t.ok ? 'var(--info)' : 'var(--bad)'}
            arrive={t.ok ? 'absorb' : 'stay'}
            duration={0.6}
            delay={0.12 * i}
          />
        );
      })}
    </svg>
  );
}
