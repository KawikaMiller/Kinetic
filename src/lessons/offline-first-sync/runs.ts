/** Running a scenario and reading what it left behind: the views, whether they agree, and what was lost. Pure. */
import type { Snapshot, TraceRow } from '../../core/distSim';
import { acceptedOps, replicaViews } from './check';
import { buildCluster, type DeviceState, type Msg, type NodeState, type ScenarioConfig, type ServerState } from './nodes';
import { lostUpdates, viewKey, type Lost, type Op, type View } from './ops';

export interface Run {
  cfg: ScenarioConfig;
  until: number;
  snap: Snapshot<NodeState>;
  trace: readonly TraceRow<Msg>[];
  views: Record<'phone' | 'laptop' | 'server', View>;
  converged: boolean;
  accepted: Op[];
  lost: Lost[];
  phone: DeviceState;
  laptop: DeviceState;
  server: ServerState;
}

export function runConfig(cfg: ScenarioConfig, until: number): Run {
  const cluster = buildCluster(cfg);
  cluster.run({ until });
  const snap = cluster.snapshot();
  const views = replicaViews(snap, cfg.strategy);
  const keys = new Set([viewKey(views.phone), viewKey(views.laptop), viewKey(views.server)]);
  return {
    cfg,
    until,
    snap,
    trace: cluster.trace,
    views,
    converged: keys.size === 1,
    accepted: acceptedOps(snap),
    lost: lostUpdates(acceptedOps(snap), views.server),
    phone: snap.nodes.phone.state as DeviceState,
    laptop: snap.nodes.laptop.state as DeviceState,
    server: snap.nodes.server.state as ServerState,
  };
}
