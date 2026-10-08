import { hash32 } from '../../core/hash';

/**
 * One server, six limits, and the leaks that fill them. The model is deterministic: each leak
 * adds a fixed amount per request, so a gauge's reading at any hour is baseline plus
 * rate x time, with one exception (ephemeral ports sit at a steady state, see below). Every
 * number is illustrative except the ones named as real defaults.
 */

export const KIB = 1024;
export const MIB = KIB ** 2;
export const GIB = KIB ** 3;
export const SECONDS_PER_HOUR = 3600;
export const MAX_HOURS = 72;
export const ALERT_FRACTION = 0.8;

/** Linux default `net.ipv4.ip_local_port_range`: 32768 to 60999, both ends included. */
export const EPHEMERAL_LOW = 32768;
export const EPHEMERAL_HIGH = 60999;
export const EPHEMERAL_PORTS = EPHEMERAL_HIGH - EPHEMERAL_LOW + 1;
/** How long a closed TCP connection's port stays reserved (Linux's fixed TCP_TIMEWAIT_LEN). */
export const TIME_WAIT_SECONDS = 60;
/** A file system block, and so the smallest a file can take on disk. */
export const BLOCK_BYTES = 4096;
/** ext4's default is one inode per 16 KiB of disk. */
const BYTES_PER_INODE = 16 * KIB;
const DISK_BYTES = 100 * GIB;
/** `ulimit -n` is commonly 1024 for a login shell or service. */
const DEFAULT_FD_LIMIT = 1024;

export type GaugeId = 'disk' | 'inodes' | 'fds' | 'pool' | 'ports' | 'memory';
export const GAUGE_IDS: readonly GaugeId[] = ['disk', 'inodes', 'fds', 'pool', 'ports', 'memory'];

export interface Gauge {
  id: GaugeId;
  label: string;
  unit: 'bytes' | 'count';
  limit: number;
  baseline: number;
  /** What the system reports when this one runs out (the name it is documented under). */
  error: string;
  /** The lesson that teaches the mechanism. */
  lesson: string;
}

export const GAUGES: Record<GaugeId, Gauge> = {
  disk: { id: 'disk', label: 'Disk bytes', unit: 'bytes', limit: DISK_BYTES, baseline: 20 * GIB, error: 'ENOSPC', lesson: 'file-systems' },
  inodes: { id: 'inodes', label: 'Inodes', unit: 'count', limit: DISK_BYTES / BYTES_PER_INODE, baseline: 200_000, error: 'ENOSPC', lesson: 'file-systems' },
  fds: { id: 'fds', label: 'File descriptors', unit: 'count', limit: DEFAULT_FD_LIMIT, baseline: 60, error: 'EMFILE', lesson: 'file-descriptors' },
  pool: { id: 'pool', label: 'DB connections', unit: 'count', limit: 20, baseline: 3, error: 'pool acquire timeout', lesson: 'connection-pooling' },
  ports: { id: 'ports', label: 'Ephemeral ports', unit: 'count', limit: EPHEMERAL_PORTS, baseline: 150, error: 'EADDRNOTAVAIL', lesson: 'sockets-api' },
  memory: { id: 'memory', label: 'Memory', unit: 'bytes', limit: 2 * GIB, baseline: 600 * MIB, error: 'OOM kill (exit 137)', lesson: 'memory-leaks' },
};

// ── Leaks ───────────────────────────────────────────────────────────────

export type LeakId = 'logs' | 'tempfiles' | 'sockets' | 'pool' | 'outbound' | 'cache';
export const LEAK_IDS: readonly LeakId[] = ['logs', 'tempfiles', 'sockets', 'pool', 'outbound', 'cache'];

export interface Leak {
  id: LeakId;
  label: string;
  effects: { gauge: GaugeId; perRequest: number }[];
}

export const LEAKS: Record<LeakId, Leak> = {
  logs: { id: 'logs', label: 'Logs never rotated', effects: [{ gauge: 'disk', perRequest: 5 * KIB }] },
  tempfiles: { id: 'tempfiles', label: 'Millions of tiny temp files', effects: [{ gauge: 'inodes', perRequest: 1 }, { gauge: 'disk', perRequest: BLOCK_BYTES }] },
  sockets: { id: 'sockets', label: 'Sockets never closed', effects: [{ gauge: 'fds', perRequest: 0.00025 }] },
  pool: { id: 'pool', label: 'Connections not returned to the pool', effects: [{ gauge: 'pool', perRequest: 0.000005 }] },
  outbound: { id: 'outbound', label: 'A new outbound connection per request', effects: [{ gauge: 'ports', perRequest: 1 }] },
  cache: { id: 'cache', label: 'An unbounded cache', effects: [{ gauge: 'memory', perRequest: 512 }] },
};

export interface Load {
  leaks: ReadonlySet<LeakId>;
  /** Requests per second. */
  rps: number;
}

export const DEFAULT_RPS = 100;
/** The Traffic slider's range; step 1 so the learner can land on both sides of the port edge (468 / 469). */
export const RPS_MIN = 20;
export const RPS_MAX = 600;
export const RPS_STEP = 1;
export const DEFAULT_LEAKS: readonly LeakId[] = ['logs', 'tempfiles'];

/** Units a gauge gains per hour from the steady leaks (everything except ports). */
export function ratePerHour(g: GaugeId, load: Load): number {
  if (g === 'ports') return 0;
  let rate = 0;
  for (const id of load.leaks) for (const e of LEAKS[id].effects) if (e.gauge === g) rate += e.perRequest * load.rps * SECONDS_PER_HOUR;
  return rate;
}

/**
 * Ports are different: a closed connection holds its port for TIME_WAIT_SECONDS and then frees
 * it, so with one new connection per request the count climbs for a minute and then sits at
 * rps x 60. It is a level that traffic sets, not a leak that grows with time.
 * (Real exhaustion is per destination address and port; one busy upstream is the usual case.)
 */
export const steadyPorts = (load: Load) => (load.leaks.has('outbound') ? load.rps * TIME_WAIT_SECONDS : 0);

/** Whether any enabled leak touches this gauge (an untouched gauge is idle). */
export const isActive = (g: GaugeId, load: Load) => [...load.leaks].some((id) => LEAKS[id].effects.some((e) => e.gauge === g));

/** The gauge's reading `hours` into the run, capped at its limit. */
export function usageAt(g: GaugeId, load: Load, hours: number): number {
  const { baseline, limit } = GAUGES[g];
  const raw = g === 'ports' ? baseline + steadyPorts(load) * Math.min(1, (hours * SECONDS_PER_HOUR) / TIME_WAIT_SECONDS) : baseline + ratePerHour(g, load) * hours;
  return Math.min(raw, limit);
}

/** Hours until the gauge reaches `target` units, or null if it never does. */
export function hoursToReach(g: GaugeId, load: Load, target: number): number | null {
  const { baseline } = GAUGES[g];
  if (target <= baseline) return 0;
  if (g === 'ports') {
    const level = steadyPorts(load);
    if (baseline + level < target) return null;
    return (target - baseline) / (load.rps * SECONDS_PER_HOUR);
  }
  const rate = ratePerHour(g, load);
  return rate > 0 ? (target - baseline) / rate : null;
}

export const hitHours = (g: GaugeId, load: Load) => hoursToReach(g, load, GAUGES[g].limit);
export const alertHours = (g: GaugeId, load: Load) => hoursToReach(g, load, GAUGES[g].limit * ALERT_FRACTION);

export interface Incident {
  gauge: GaugeId;
  hours: number;
}

/** The first limit to be hit within the run, if any. */
export function firstIncident(load: Load): Incident | null {
  let best: Incident | null = null;
  for (const gauge of GAUGE_IDS) {
    const hours = hitHours(gauge, load);
    if (hours !== null && hours <= MAX_HOURS && (best === null || hours < best.hours)) best = { gauge, hours };
  }
  return best;
}

// ── The cascade ─────────────────────────────────────────────────────────

export type NodeId =
  | 'enospc-bytes' | 'enospc-inodes' | 'emfile' | 'pool-timeout' | 'eaddrnotavail' | 'oom'
  | 'log-writes-fail' | 'tmp-fails' | 'refused' | 'piled' | 'outbound-fails' | 'lost' | 'errors5xx' | 'health' | 'restart' | 'loop';

export const PRIMARY: Record<GaugeId, NodeId> = {
  disk: 'enospc-bytes', inodes: 'enospc-inodes', fds: 'emfile', pool: 'pool-timeout', ports: 'eaddrnotavail', memory: 'oom',
};

export const NODE_TEXT: Record<Exclude<NodeId, 'loop'>, string> = {
  'enospc-bytes': 'ENOSPC: no space left on device',
  'enospc-inodes': 'ENOSPC: no space left on device, while free bytes remain',
  emfile: 'EMFILE: too many open files',
  'pool-timeout': 'Pool acquire timeout: no free connection',
  eaddrnotavail: 'EADDRNOTAVAIL: cannot assign requested address',
  oom: 'OOM killer sends SIGKILL, exit code 137',
  'log-writes-fail': 'Log writes fail',
  'tmp-fails': 'Creating temp files fails',
  refused: 'New connections and file opens fail',
  piled: 'Request threads pile up waiting for a connection',
  'outbound-fails': 'Outbound calls fail',
  lost: 'In-flight requests are lost',
  errors5xx: 'Requests return 5xx',
  health: 'Health check fails',
  restart: 'The orchestrator restarts the process',
};

/** cause -> effect, with the delay in seconds. Illustrative: your health check and timeouts will differ. */
export const EDGES: readonly { from: NodeId; to: NodeId; seconds: number }[] = [
  { from: 'enospc-bytes', to: 'log-writes-fail', seconds: 1 },
  { from: 'log-writes-fail', to: 'health', seconds: 30 },
  { from: 'enospc-inodes', to: 'tmp-fails', seconds: 1 },
  { from: 'tmp-fails', to: 'errors5xx', seconds: 2 },
  { from: 'emfile', to: 'refused', seconds: 1 },
  { from: 'refused', to: 'errors5xx', seconds: 2 },
  { from: 'refused', to: 'health', seconds: 10 },
  { from: 'pool-timeout', to: 'piled', seconds: 30 },
  { from: 'piled', to: 'errors5xx', seconds: 1 },
  { from: 'piled', to: 'health', seconds: 15 },
  { from: 'eaddrnotavail', to: 'outbound-fails', seconds: 1 },
  { from: 'outbound-fails', to: 'errors5xx', seconds: 2 },
  { from: 'oom', to: 'lost', seconds: 0 },
  { from: 'lost', to: 'restart', seconds: 5 },
  { from: 'errors5xx', to: 'health', seconds: 30 },
  { from: 'health', to: 'restart', seconds: 60 },
  { from: 'restart', to: 'loop', seconds: 1 },
];

export interface CascadeStep {
  node: NodeId;
  /** Seconds after the first limit was hit. */
  seconds: number;
}

/** Everything the first failure sets off, with the earliest time each effect can happen, in time order. */
export function cascade(first: GaugeId): CascadeStep[] {
  const at = new Map<NodeId, number>([[PRIMARY[first], 0]]);
  // The graph has no cycles, so repeating the relaxation until no time improves finds the earliest time of each effect.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of EDGES) {
      const t = at.get(e.from);
      if (t !== undefined && t + e.seconds < (at.get(e.to) ?? Infinity)) {
        at.set(e.to, t + e.seconds);
        changed = true;
      }
    }
  }
  const order = new Map(EDGES.flatMap((e) => [e.from, e.to]).map((n, i) => [n, i] as const));
  return [...at.entries()].map(([node, seconds]) => ({ node, seconds })).sort((a, b) => a.seconds - b.seconds || (order.get(a.node) ?? 0) - (order.get(b.node) ?? 0));
}

/** What the restart changes: files stay on disk, but a leaked descriptor, connection or byte of memory is freed. */
export function loopText(first: GaugeId, load: Load): string {
  if (first === 'disk' || first === 'inodes') return 'The files are still on disk: it is still full, so it fails again at once';
  if (first === 'ports') return 'The process restarts, but the kernel still holds its TIME_WAIT ports for up to 60 s and the traffic refills them';
  const again = hitHours(first, load);
  return again === null ? 'The leak starts over' : `The leak starts over: the limit is reached again in about ${formatHours(again)}`;
}

export const formatHours = (h: number) => (h < 1 / 60 ? `${Math.max(1, Math.round(h * SECONDS_PER_HOUR))} s` : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

// ── Alerts ──────────────────────────────────────────────────────────────

export type AlertSet = ReadonlySet<GaugeId>;

/** How long before the limit an 80% alert fires, in hours; null when no limit is reached. */
export function warningHours(g: GaugeId, load: Load): number | null {
  const hit = hitHours(g, load);
  const warn = alertHours(g, load);
  return hit === null || warn === null ? null : hit - warn;
}

// ── Find the limit ──────────────────────────────────────────────────────

export const WRONG_GUESS_MINUTES = 10;

export const SYMPTOMS: Record<GaugeId, string> = {
  disk: 'Everything that writes fails: uploads, log files, the package manager. Reads still work.',
  inodes: 'Creating any file fails, yet df -h shows plenty of free space.',
  fds: 'New connections are refused and opening any file fails. The process was fine for hours.',
  pool: 'Requests hang for 30 seconds, then return a 500.',
  ports: 'Outbound calls fail instantly with "cannot assign requested address" under heavy traffic, though the upstream is healthy.',
  memory: 'The service vanishes every few hours with nothing in its own log. The container shows exit code 137.',
};

/** The leak that makes each gauge the first to fail, with the traffic that does it. */
export const SCENARIO_FOR: Record<GaugeId, Load> = {
  disk: { leaks: new Set<LeakId>(['logs']), rps: DEFAULT_RPS },
  inodes: { leaks: new Set<LeakId>(['tempfiles']), rps: DEFAULT_RPS },
  fds: { leaks: new Set<LeakId>(['sockets']), rps: DEFAULT_RPS },
  pool: { leaks: new Set<LeakId>(['pool']), rps: DEFAULT_RPS },
  ports: { leaks: new Set<LeakId>(['outbound']), rps: 500 },
  memory: { leaks: new Set<LeakId>(['cache']), rps: DEFAULT_RPS },
};

/** The six symptoms in a seeded order. */
export function symptomOrder(seed: number): GaugeId[] {
  return [...GAUGE_IDS].sort((a, b) => hash32(`${seed}:${a}`) - hash32(`${seed}:${b}`));
}

export interface Check {
  correct: boolean;
  /** How full the checked gauge reads at the moment of the failure, 0..1. */
  reading: number;
  minutesLost: number;
}

/** Checking a gauge costs nothing if it is the culprit and WRONG_GUESS_MINUTES if not; the reading comes from the model at the failure. */
export function check(answer: GaugeId, guess: GaugeId): Check {
  const load = SCENARIO_FOR[answer];
  const at = hitHours(answer, load) ?? 0;
  return { correct: guess === answer, reading: usageAt(guess, load, at) / GAUGES[guess].limit, minutesLost: guess === answer ? 0 : WRONG_GUESS_MINUTES };
}
