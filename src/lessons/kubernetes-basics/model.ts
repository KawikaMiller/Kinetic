/**
 * A tiny deterministic cluster: nodes with CPU, pods, ReplicaSets, a Deployment, a scheduler,
 * a node monitor, a kubelet and a Service. `tick` runs one round of every control loop, in a
 * fixed order. Timings (in ticks) are shortened for the lesson; names are illustrative.
 */

export const NODE_COUNT = 3;
export const NODE_CPU = 2000;
export const POD_CPU = 500;
/** Bigger than any node, so it can never be scheduled. */
export const BIG_CPU = 2500;
export const SLOTS = NODE_CPU / POD_CPU;
export const MAX_REPLICAS = 8;
export const DEFAULT_REPLICAS = 3;

/** Ticks a pod spends in each phase, and how long the control plane waits before it acts on a silent node. */
export const CREATING_TICKS = 1;
export const STARTING_TICKS = 1;
export const TERMINATING_TICKS = 1;
export const NOT_READY_TICKS = 3;
export const EVICT_TICKS = 2;
export const REQUESTS_PER_TICK = 2;

/** The rollout's 25% defaults: maxSurge rounds up, maxUnavailable rounds down. */
export const SURGE_SHARE = 0.25;
export const maxSurge = (replicas: number) => Math.ceil(SURGE_SHARE * replicas);
export const maxUnavailable = (replicas: number) => Math.floor(SURGE_SHARE * replicas);

export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'Terminating';
export type NodeStatus = 'Ready' | 'Unreachable' | 'NotReady';

export interface Pod {
  id: number;
  name: string;
  /** The ReplicaSet that owns it; null for a bare pod or one that was relabelled out of its set. */
  owner: string | null;
  image: string;
  cpu: number;
  labels: { app: string };
  /** Node index, or null while unscheduled. */
  node: number | null;
  slot: number | null;
  phase: PodPhase;
  ready: boolean;
  /** Ticks in the current phase. */
  age: number;
  pendingReason: string | null;
}

export interface ReplicaSet {
  name: string;
  image: string;
  /** The replica count the Deployment has asked it for. */
  spec: number;
  revision: number;
}

export interface NodeState {
  name: string;
  status: NodeStatus;
  cordoned: boolean;
  /** Ticks since it went silent. */
  silentFor: number;
}

export interface Deployment {
  replicas: number;
  image: string;
  revision: number;
}

export interface TrafficEvent {
  /** The pod the Service picked, or null when it had no endpoints. */
  pod: number | null;
  ok: boolean;
}

export interface Cluster {
  tick: number;
  nodes: NodeState[];
  pods: Pod[];
  sets: ReplicaSet[];
  deployment: Deployment;
  nextPodId: number;
  served: number;
  failed: number;
  rotation: number;
}

export interface TickReport {
  tick: number;
  /** The ReplicaSet loop: what it saw, the gap, what it did. */
  observe: string;
  diff: string;
  act: string;
  /** Everything else that happened this tick (scheduler, nodes, rollout). */
  notes: string[];
  traffic: TrafficEvent[];
}

export const APP_LABEL = 'web';
const DEBUG_LABEL = 'web-debug';

export const imageTag = (revision: number) => `v${revision}`;
const setName = (image: string) => `web-${image}`;

export function newCluster(): Cluster {
  const c: Cluster = {
    tick: 0,
    nodes: Array.from({ length: NODE_COUNT }, (_, i) => ({ name: `node-${i + 1}`, status: 'Ready' as NodeStatus, cordoned: false, silentFor: 0 })),
    pods: [],
    sets: [],
    deployment: { replicas: DEFAULT_REPLICAS, image: imageTag(1), revision: 1 },
    nextPodId: 1,
    served: 0,
    failed: 0,
    rotation: 0,
  };
  return c;
}

/** A cluster that has already settled on its desired state: how the lesson starts. */
export function settledCluster(replicas = DEFAULT_REPLICAS): Cluster {
  const c = newCluster();
  c.deployment.replicas = replicas;
  for (let i = 0; i < 20; i++) tick(c);
  c.tick = 0;
  c.served = 0;
  c.failed = 0;
  return c;
}

// ---------- queries ----------

export const isActive = (p: Pod) => p.phase !== 'Terminating';
export const podsOnNode = (c: Cluster, node: number) => c.pods.filter((p) => p.node === node);
export const cpuUsed = (c: Cluster, node: number) => podsOnNode(c, node).reduce((sum, p) => sum + p.cpu, 0);
export const cpuFree = (c: Cluster, node: number) => NODE_CPU - cpuUsed(c, node);
export const matchesService = (p: Pod) => p.labels.app === APP_LABEL;
export const isReady = (p: Pod) => p.phase === 'Running' && p.ready;

/** The Service's endpoints: pods that match its selector and are Ready (the API's view, which lags a dead node). */
export const endpoints = (c: Cluster): Pod[] => c.pods.filter((p) => matchesService(p) && isReady(p));

/** Pods a ReplicaSet counts as its own: owned, still matching its selector, not being deleted. */
export const ownedBy = (c: Cluster, rs: ReplicaSet) => c.pods.filter((p) => p.owner === rs.name && matchesService(p) && isActive(p));

export const readyOwned = (c: Cluster, rs: ReplicaSet) => ownedBy(c, rs).filter(isReady);

export function schedulable(c: Cluster, node: number): boolean {
  const n = c.nodes[node];
  return n.status !== 'NotReady' && !n.cordoned;
}

export const fitsOn = (c: Cluster, p: Pod, node: number) => schedulable(c, node) && cpuFree(c, node) >= p.cpu;

/** "0/3 nodes are available: ..." from what each node lacks. */
export function unschedulableReason(c: Cluster, p: Pod): string {
  const lacking = c.nodes.map((_, i) => i).filter((i) => schedulable(c, i) && cpuFree(c, i) < p.cpu).length;
  const cordoned = c.nodes.filter((n) => n.cordoned).length;
  const notReady = c.nodes.filter((n) => n.status === 'NotReady' && !n.cordoned).length;
  const parts = [
    lacking > 0 ? `${lacking} Insufficient cpu` : null,
    cordoned > 0 ? `${cordoned} node(s) unschedulable` : null,
    notReady > 0 ? `${notReady} node(s) not ready` : null,
  ].filter((s): s is string => s !== null);
  return `0/${c.nodes.length} nodes are available: ${parts.join(', ')}.`;
}

// ---------- actions (what a person does) ----------

function newPod(c: Cluster, owner: string | null, image: string, cpu: number): Pod {
  const id = c.nextPodId++;
  return {
    id,
    name: owner ? `${owner}-${id}` : `big-job-${id}`,
    owner,
    image,
    cpu,
    labels: { app: owner ? APP_LABEL : DEBUG_LABEL },
    node: null,
    slot: null,
    phase: 'Pending',
    ready: false,
    age: 0,
    pendingReason: null,
  };
}

export function killPod(c: Cluster, id: number): Pod | null {
  const p = c.pods.find((x) => x.id === id);
  if (!p) return null;
  if (p.node === null) c.pods = c.pods.filter((x) => x.id !== id);
  else {
    p.phase = 'Terminating';
    p.ready = false;
    p.age = 0;
  }
  return p;
}

/** Change the pod's `app` label: it leaves the Service, and its ReplicaSet lets go of it (and starts a replacement). */
export function relabelPod(c: Cluster, id: number): Pod | null {
  const p = c.pods.find((x) => x.id === id);
  if (!p || !isActive(p)) return null;
  p.labels = { app: DEBUG_LABEL };
  p.owner = null;
  return p;
}

export const setReplicas = (c: Cluster, n: number) => {
  c.deployment.replicas = Math.max(0, Math.min(MAX_REPLICAS, Math.trunc(n)));
};

export function changeImage(c: Cluster): string {
  c.deployment.revision += 1;
  c.deployment.image = imageTag(c.deployment.revision);
  return c.deployment.image;
}

/** A pod no node can ever hold: a request bigger than a whole node. */
export function addBigPod(c: Cluster): Pod {
  const p = newPod(c, null, 'job', BIG_CPU);
  c.pods.push(p);
  return p;
}

/** The node crashes: it goes silent, and the control plane finds out later. */
export function killNode(c: Cluster, node: number) {
  c.nodes[node].status = 'Unreachable';
  c.nodes[node].silentFor = 0;
}

/** Cordon the node and evict its pods gracefully. */
export function drainNode(c: Cluster, node: number) {
  c.nodes[node].cordoned = true;
  for (const p of podsOnNode(c, node)) if (isActive(p)) killPod(c, p.id);
}

export function restoreNode(c: Cluster, node: number) {
  c.nodes[node].status = 'Ready';
  c.nodes[node].cordoned = false;
  c.nodes[node].silentFor = 0;
}

// ---------- the control loops ----------

function monitorNodes(c: Cluster, notes: string[]) {
  c.nodes.forEach((n, i) => {
    if (n.status === 'Ready') return;
    n.silentFor += 1;
    if (n.status === 'Unreachable' && n.silentFor >= NOT_READY_TICKS) {
      n.status = 'NotReady';
      for (const p of podsOnNode(c, i)) p.ready = false;
      notes.push(`${n.name} has been silent for ${n.silentFor} ticks: the control plane marks it NotReady, and its pods stop being Ready.`);
    }
    if (n.status === 'NotReady' && n.silentFor >= NOT_READY_TICKS + EVICT_TICKS) {
      const gone = podsOnNode(c, i);
      if (gone.length > 0) {
        c.pods = c.pods.filter((p) => p.node !== i);
        notes.push(`${n.name} is still gone, so its ${gone.length} pod${gone.length === 1 ? ' is' : 's are'} evicted.`);
      }
    }
  });
}

function runKubelets(c: Cluster) {
  const gone = new Set<number>();
  for (const p of c.pods) {
    p.age += 1;
    if (p.node === null || c.nodes[p.node].status !== 'Ready') continue;
    if (p.phase === 'ContainerCreating' && p.age >= CREATING_TICKS) {
      p.phase = 'Running';
      p.age = 0;
    } else if (p.phase === 'Running' && !p.ready && p.age >= STARTING_TICKS) p.ready = true;
    else if (p.phase === 'Terminating' && p.age >= TERMINATING_TICKS) gone.add(p.id);
  }
  if (gone.size > 0) c.pods = c.pods.filter((p) => !gone.has(p.id));
}

function lowestFreeSlot(c: Cluster, node: number): number {
  const used = new Set(podsOnNode(c, node).map((p) => p.slot));
  let s = 0;
  while (used.has(s)) s++;
  return s;
}

/** Bind each unscheduled pod to the schedulable node with the most free CPU that still fits it (lowest index on a tie). */
export function schedule(c: Cluster, notes: string[] = []) {
  for (const p of c.pods.filter((x) => x.node === null && x.phase === 'Pending').sort((a, b) => a.id - b.id)) {
    const options = c.nodes.map((_, i) => i).filter((i) => fitsOn(c, p, i));
    if (options.length === 0) {
      const reason = unschedulableReason(c, p);
      if (p.pendingReason !== reason) notes.push(`${p.name} can't be scheduled. ${reason}`);
      p.pendingReason = reason;
      continue;
    }
    const best = options.reduce((a, b) => (cpuFree(c, b) > cpuFree(c, a) ? b : a));
    p.node = best;
    p.slot = lowestFreeSlot(c, best);
    p.phase = 'ContainerCreating';
    p.age = 0;
    p.pendingReason = null;
    notes.push(`The scheduler binds ${p.name} to ${c.nodes[best].name}.`);
  }
}

/** Which of a ReplicaSet's pods to delete first: unscheduled, then not ready, then newest. */
const deletionRank = (p: Pod) => (p.node === null ? 0 : isReady(p) ? 2 : 1);

/** One Deployment sync: scale the new ReplicaSet up and the old ones down inside maxSurge and maxUnavailable. */
function syncDeployment(c: Cluster, notes: string[]) {
  const d = c.deployment;
  let next = c.sets.find((s) => s.image === d.image);
  if (!next) {
    next = { name: setName(d.image), image: d.image, spec: 0, revision: d.revision };
    c.sets.push(next);
    notes.push(`The Deployment creates ReplicaSet ${next.name} (the pod template changed).`);
  }
  const olds = c.sets.filter((s) => s !== next).sort((a, b) => a.revision - b.revision);
  const before = new Map(c.sets.map((s) => [s.name, s.spec]));

  if (olds.every((s) => s.spec === 0 && ownedBy(c, s).length === 0)) {
    next.spec = d.replicas;
  } else {
    next.spec = Math.min(next.spec, d.replicas);
    const total = c.sets.reduce((sum, s) => sum + s.spec, 0);
    const room = d.replicas + maxSurge(d.replicas) - total;
    next.spec = Math.min(d.replicas, next.spec + Math.max(0, room));
    let removable = c.pods.filter((p) => isReady(p) && matchesService(p) && p.owner !== null).length - (d.replicas - maxUnavailable(d.replicas));
    for (const s of olds) {
      const unhealthy = ownedBy(c, s).filter((p) => !isReady(p)).length;
      const cut = Math.min(s.spec, unhealthy);
      s.spec -= cut;
    }
    for (const s of olds) {
      if (removable <= 0) break;
      const cut = Math.min(s.spec, removable);
      s.spec -= cut;
      removable -= cut;
    }
  }
  for (const s of c.sets) {
    const was = before.get(s.name);
    if (was !== undefined && was !== s.spec) notes.push(`The Deployment scales ${s.name} from ${was} to ${s.spec}.`);
    else if (was === undefined && s.spec > 0) notes.push(`The Deployment scales ${s.name} from 0 to ${s.spec}.`);
  }
  // Keep only the newest empty ReplicaSet (history for a rollback).
  const empty = c.sets.filter((s) => s !== next && s.spec === 0 && ownedBy(c, s).length === 0).sort((a, b) => b.revision - a.revision);
  c.sets = c.sets.filter((s) => s === next || !empty.slice(1).includes(s));
}

interface SetReport {
  observe: string;
  diff: string;
  act: string;
}

/** One ReplicaSet sync: compare matching pods with the wanted count, then create or delete the difference. */
function syncReplicaSet(c: Cluster, rs: ReplicaSet): SetReport {
  const mine = ownedBy(c, rs);
  const gap = rs.spec - mine.length;
  const observe = `${rs.name}: ${mine.length} pod${mine.length === 1 ? '' : 's'}, want ${rs.spec}`;
  if (gap > 0) {
    for (let i = 0; i < gap; i++) c.pods.push(newPod(c, rs.name, rs.image, POD_CPU));
    return { observe, diff: `${gap} missing`, act: `create ${gap} pod${gap === 1 ? '' : 's'}` };
  }
  if (gap < 0) {
    const doomed = [...mine].sort((a, b) => deletionRank(a) - deletionRank(b) || b.id - a.id).slice(0, -gap);
    for (const p of doomed) killPod(c, p.id);
    return { observe, diff: `${-gap} too many`, act: `delete ${-gap} pod${gap === -1 ? '' : 's'}` };
  }
  return { observe, diff: 'none', act: 'nothing to do' };
}

function routeTraffic(c: Cluster): TrafficEvent[] {
  const events: TrafficEvent[] = [];
  for (let i = 0; i < REQUESTS_PER_TICK; i++) {
    const targets = endpoints(c);
    if (targets.length === 0) {
      events.push({ pod: null, ok: false });
      c.failed += 1;
      continue;
    }
    const pod = targets[c.rotation % targets.length];
    c.rotation += 1;
    const ok = pod.node !== null && c.nodes[pod.node].status === 'Ready';
    events.push({ pod: pod.id, ok });
    if (ok) c.served += 1;
    else c.failed += 1;
  }
  return events;
}

/** Run one round of every loop and say what the ReplicaSet loop saw and did. */
export function tick(c: Cluster): TickReport {
  c.tick += 1;
  const notes: string[] = [];
  monitorNodes(c, notes);
  runKubelets(c);
  schedule(c, notes);
  const syncNotes: string[] = [];
  syncDeployment(c, syncNotes);
  const reports = [...c.sets].sort((a, b) => b.revision - a.revision).map((rs) => ({ rs, r: syncReplicaSet(c, rs) }));
  const busy = reports.find((x) => x.r.act !== 'nothing to do');
  const shown = busy?.r ?? reports[0]?.r ?? { observe: 'no ReplicaSets yet', diff: 'none', act: 'nothing to do' };
  const traffic = routeTraffic(c);
  return { tick: c.tick, ...shown, notes: [...syncNotes, ...notes], traffic };
}

export function runTicks(c: Cluster, n: number) {
  for (let i = 0; i < n; i++) tick(c);
}
