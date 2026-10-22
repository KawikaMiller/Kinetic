/**
 * The invariants and the seeded fault schedules they are checked over (AC-0/T3 rule 20), plus the pinned seeds on which
 * the broken modes violate them. Pure.
 *
 *   convergence    once every operation is delivered and acknowledged and no new edit arrives, all replicas (both devices
 *                  and the server) show the same list.
 *   no silent loss for the merge and manual strategies: every acknowledged edit appears in the final list, is overwritten
 *                  by a later edit that had seen it, or is in a listed conflict.
 * Both are claims about a settled system, so a predicate returns null until the run has settled; the test also counts the
 * seeds that settled, so a run that never delivers cannot pass by staying silent (liveness is a separate claim).
 */
import type { Safety } from '../../core/distSim';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import { buildCluster, type Action, type DeviceState, type NodeState, type ScenarioConfig, type ServerState, type Timed } from './nodes';
import { DEVICES, lostUpdates, naiveView, viewKey, viewOf, type DeviceId, type Op, type Strategy, type View } from './ops';

export const SETTLE_AT_MS = 60_000;
export const HORIZON_MS = 120_000;
export const SEED_COUNT = 200;

/** The fault schedule of the invariant runs: slow, lossy, duplicating, reordering, partitioned and crashed. */
export const FAULTY = { latency: { min: 5, max: 400 }, loss: 0.15, duplicate: 0.2 } as const;
/** The quiet network of the scripted examples. */
export const QUIET = { latency: { min: 20, max: 60 }, loss: 0, duplicate: 0 } as const;

const TITLES = ['Milk', 'Eggs', 'Bread', 'Tea', 'Rice', 'Jam', 'Soap'];
const RENAMES = ['Oat milk', 'Free-range eggs', 'Rye bread', 'Green tea', 'Basmati', 'Plum jam', 'Dish soap'];
const SCHEDULE_START_MS = 1000;
const SCHEDULE_END_MS = 20_000;
const SCHEDULE_ACTIONS = 10;
const PHONE_OFFLINE = { from: 3000, to: 14_000 };
const SKEW_SCHEDULE_MS = 5 * 60_000;

/** A seeded random edit script: two items first, then edits from both devices spread over twenty seconds. */
export function randomScript(seed: number): Timed[] {
  const rnd: Rnd = mulberry32(seed ^ 0x5bd1e995);
  const script: Timed[] = [
    { at: 100, device: 'phone', action: { kind: 'add', title: TITLES[0] } },
    { at: 150, device: 'phone', action: { kind: 'add', title: TITLES[1] } },
  ];
  for (let i = 0; i < SCHEDULE_ACTIONS; i++) {
    const at = randInt(SCHEDULE_START_MS, SCHEDULE_END_MS, rnd);
    const device: DeviceId = pick(DEVICES, rnd);
    const r = rnd();
    const action: Action =
      r < 0.3 ? { kind: 'rename', pick: randInt(0, 5, rnd), title: pick(RENAMES, rnd) }
      : r < 0.55 ? { kind: 'tick', pick: randInt(0, 5, rnd) }
      : r < 0.65 ? { kind: 'delete', pick: randInt(0, 5, rnd) }
      : r < 0.75 ? { kind: 'add', title: pick(TITLES, rnd) }
      : { kind: 'inc' };
    script.push({ at, device, action });
  }
  return script.sort((a, b) => a.at - b.at);
}

/** The random-schedule scenario for a seed and strategy: the faulty network, the phone offline for eleven seconds, a skewed laptop clock. */
export const scheduleConfig = (seed: number, strategy: Strategy, dedupe = true, skewMs = SKEW_SCHEDULE_MS): ScenarioConfig => ({
  seed,
  strategy,
  dedupe,
  ...FAULTY,
  skewMs,
  script: randomScript(seed),
  airplane: [{ device: 'phone', ...PHONE_OFFLINE }],
  randomFaults: true,
});
export const runSchedule = (seed: number, strategy: Strategy, dedupe = true) => buildCluster(scheduleConfig(seed, strategy, dedupe));

// ---- reading a snapshot ------------------------------------------------------------------------

const asDevice = (s: NodeState | undefined) => s as DeviceState;
const asServer = (s: NodeState | undefined) => s as ServerState;
export const viewOfNode = (s: NodeState, strategy: Strategy): View =>
  strategy === 'arrival' ? naiveView(s.naive) : viewOf(s.log, strategy);

export interface Snap {
  time: number;
  nodes: Record<string, { state: NodeState | undefined; up: boolean }>;
}

/** Everything is delivered: no outbox, no device in airplane mode, and every accepted operation is at both devices. */
export function delivered(snap: Snap): boolean {
  const server = asServer(snap.nodes.server.state);
  for (const d of DEVICES) {
    const dev = asDevice(snap.nodes[d].state);
    if (dev.airplane || dev.outbox.length > 0) return false;
    for (const id of server.ids) if (!dev.ids.has(id)) return false;
    for (const op of dev.log) if (!server.ids.has(op.id)) return false;
  }
  return true;
}

/** Delivered, and long enough after the last fault that nothing more is expected. */
export const settled = (snap: Snap): boolean => snap.time >= SETTLE_AT_MS && delivered(snap);

export function replicaViews(snap: Snap, strategy: Strategy): Record<'phone' | 'laptop' | 'server', View> {
  return {
    phone: viewOfNode(asDevice(snap.nodes.phone.state), strategy),
    laptop: viewOfNode(asDevice(snap.nodes.laptop.state), strategy),
    server: viewOfNode(asServer(snap.nodes.server.state), strategy),
  };
}

/** Invariant 1: when settled, the three replicas show the same list. */
export const convergence = (strategy: Strategy): Safety<NodeState> => (snap) => {
  if (!settled(snap)) return null;
  const v = replicaViews(snap, strategy);
  const keys = { phone: viewKey(v.phone), laptop: viewKey(v.laptop), server: viewKey(v.server) };
  if (keys.phone === keys.server && keys.laptop === keys.server) return null;
  const odd = (['phone', 'laptop', 'server'] as const).filter((k) => keys[k] !== keys.server);
  return `the replicas differ once settled: ${odd.join(' and ')} disagree${odd.length === 1 ? 's' : ''} with the server`;
};

/** Invariant 2 (merge and manual): when settled, no acknowledged edit has disappeared silently. */
export const noSilentLoss = (strategy: Strategy): Safety<NodeState> => (snap) => {
  if (!settled(snap)) return null;
  const server = asServer(snap.nodes.server.state);
  const lost = lostUpdates(server.log, viewOfNode(server, strategy));
  return lost.length === 0 ? null : `${lost.length} acknowledged ${lost.length === 1 ? 'edit' : 'edits'} disappeared silently, first: ${lost[0].reason}`;
};

/** The operations the server accepted: the "acknowledged edits" of invariant 2. */
export const acceptedOps = (snap: Snap): Op[] => [...asServer(snap.nodes.server.state).log];

export { asDevice, asServer };
