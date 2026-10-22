/**
 * The namespaces and cgroups scene's model. Every name, address and number is fictional and nothing is
 * measured: the views are lesson-authored text, the limits are exact functions of the sliders.
 */

export type NamespaceId = 'pid' | 'mount' | 'net' | 'uts' | 'ipc' | 'user' | 'cgroup';

export const NAMESPACE_ORDER: readonly NamespaceId[] = ['pid', 'mount', 'net', 'uts', 'ipc', 'user', 'cgroup'];

export interface NamespaceView {
  label: string;
  /** What the process sees with no namespace of this kind. */
  host: string;
  /** What it sees inside a private one. */
  private: string;
}

/** The uid map a user namespace prints: inside id, outside id, range. */
export const USER_MAP = { inside: 0, outside: 100_000, range: 65_536 } as const;

export const VIEWS: Record<NamespaceId, NamespaceView> = {
  pid: { label: 'pid (process list)', host: 'every process on the host, PIDs 1, 2, 301, 302 and more', private: 'only itself, as PID 1' },
  mount: { label: 'mount (files)', host: 'the host root: /etc, /home and everything mounted', private: 'a prepared root: /app and /tmp' },
  net: { label: 'net (network)', host: 'the host interfaces: lo and eth0 (10.0.0.5)', private: 'loopback only' },
  uts: { label: 'uts (host name)', host: 'host-a.example', private: 'sandbox-1' },
  ipc: { label: 'ipc (shared memory)', host: 'the shared-memory segments other processes made', private: 'none' },
  user: {
    label: 'user (ids)',
    host: 'uid 0 inside is uid 0 on the host',
    private: `uid ${USER_MAP.inside} inside is uid ${USER_MAP.outside.toLocaleString('en-US')} on the host (map ${USER_MAP.inside} ${USER_MAP.outside} ${USER_MAP.range})`,
  },
  cgroup: { label: 'cgroup (control groups)', host: 'the whole host hierarchy: /system.slice/…', private: 'its own group as the root: /' },
};

export type NamespaceSet = ReadonlySet<NamespaceId>;

/** What the process sees for one namespace kind given the set that is on. */
export const viewOf = (id: NamespaceId, on: NamespaceSet): string => (on.has(id) ? VIEWS[id].private : VIEWS[id].host);

/** Is root inside the sandbox root on the host too? Only when no user namespace maps it away. */
export const rootIsHostRoot = (on: NamespaceSet): boolean => !on.has('user');

// ── cgroups ──────────────────────────────────────────────────────────────

export const MIB = 1024 * 1024;

export interface MemoryOutcome {
  /** The plugin tried to hold this many bytes. */
  requested: number;
  limit: number;
  killed: boolean;
  /** The byte that crossed the limit (limit + 1) when killed. */
  killedAtByte: number | null;
  /** Bytes it held when the run ended. */
  held: number;
}

/** The memory limit in this model: past it, the first byte over kills the plugin. */
export function memoryOutcome(limitMiB: number, allocateMiB: number): MemoryOutcome {
  const limit = limitMiB * MIB;
  const requested = allocateMiB * MIB;
  const killed = requested > limit;
  return { requested, limit, killed, killedAtByte: killed ? limit + 1 : null, held: killed ? limit : requested };
}

export interface PidsOutcome {
  limit: number;
  attempted: number;
  /** Children that started: the plugin itself counts as one process against the limit. */
  started: number;
  failed: number;
  /** The 1-based fork attempt that first failed, or null. */
  firstFailure: number | null;
}

export function pidsOutcome(limit: number, attempted: number): PidsOutcome {
  const started = Math.min(attempted, Math.max(0, limit - 1));
  return { limit, attempted, started, failed: attempted - started, firstFailure: attempted > started ? started + 1 : null };
}

/** The plugin's share of the CPU when it and another group compete: weight over the sum of weights. Weights are relative. */
export function cpuShare(pluginWeight: number, otherWeight: number): number {
  return pluginWeight / (pluginWeight + otherWeight);
}

export const MEMORY_LIMIT_RANGE = { min: 32, max: 512, step: 32 } as const;
export const ALLOCATE_RANGE = { min: 0, max: 640, step: 8 } as const;
export const PIDS_LIMIT_RANGE = { min: 4, max: 64, step: 1 } as const;
export const FORKS_RANGE = { min: 0, max: 100, step: 1 } as const;
export const CPU_WEIGHT_RANGE = { min: 10, max: 1000, step: 10 } as const;
/** The weight of the other workload the plugin competes with. */
export const OTHER_CPU_WEIGHT = 100;
