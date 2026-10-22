/**
 * The concentric boundaries around an abstract untrusted plugin, and what each one does to eight abstract
 * actions. Nothing here makes a system call or describes how a boundary is defeated: it is a table of rules
 * the lesson wrote, labelled simulated and from memory on screen.
 *
 * An action travels outward from the plugin through the rings that are switched on. A ring BLOCKS it (the
 * action stops there), LIMITS it (it goes on, but restricted), or does nothing. The verdict is "blocked by" the
 * first blocking ring, else "limited by" the first limiting ring, else "allowed" (which, for these actions, is
 * the outcome a sandbox exists to prevent).
 */

export type RingId = 'process' | 'seccomp' | 'namespaces' | 'cgroup' | 'runtime' | 'microvm';

/** Innermost first: the order an action meets them, and so the order credit is given in. */
export const RING_ORDER: readonly RingId[] = ['process', 'seccomp', 'namespaces', 'cgroup', 'runtime', 'microvm'];

export const RING_LABEL: Record<RingId, string> = {
  process: 'process',
  seccomp: 'seccomp filter',
  namespaces: 'namespaces',
  cgroup: 'cgroup limits',
  runtime: 'container runtime',
  microvm: 'microVM',
};

/** One plain line on what the ring is. */
export const RING_ABOUT: Record<RingId, string> = {
  process: 'its own address space, run as an unprivileged user, behind the user/kernel boundary',
  seccomp: 'a filter that allows or denies system calls by name and number',
  namespaces: 'private views of processes, files, network, names and users',
  cgroup: 'limits on memory, process count and CPU share',
  runtime: 'the tool that starts the container: a prepared root filesystem and dropped privileges',
  microvm: 'a separate guest kernel behind a hypervisor, here with no network device attached',
};

export type ActionId = 'file' | 'net' | 'fork' | 'memory' | 'syscall' | 'processes' | 'mount' | 'kernel-bug';

export const ACTION_ORDER: readonly ActionId[] = ['file', 'net', 'fork', 'memory', 'syscall', 'processes', 'mount', 'kernel-bug'];

export const ACTION_LABEL: Record<ActionId, string> = {
  file: 'read a file outside its folder',
  net: 'open a network connection',
  fork: 'start very many child processes',
  memory: 'use a very large amount of memory',
  syscall: 'call a system call that is not on the list',
  processes: 'see the other processes',
  mount: 'mount a filesystem',
  'kernel-bug': 'trigger a kernel bug (abstract)',
};

export type Effect = 'blocked' | 'limited';

/** What each ring does to each action; a missing entry means the ring does nothing about it. The lesson's own toy rules, from memory. */
export const RULES: Record<RingId, Partial<Record<ActionId, Effect>>> = {
  process: { file: 'limited', mount: 'blocked' },
  seccomp: { net: 'blocked', fork: 'blocked', syscall: 'blocked', mount: 'blocked', 'kernel-bug': 'limited' },
  namespaces: { file: 'blocked', net: 'blocked', processes: 'blocked', mount: 'limited' },
  cgroup: { fork: 'limited', memory: 'limited' },
  runtime: { file: 'blocked', mount: 'blocked' },
  microvm: { file: 'blocked', net: 'blocked', fork: 'limited', memory: 'limited', syscall: 'limited', processes: 'blocked', mount: 'limited', 'kernel-bug': 'limited' },
};

/** One line on what the limit means, for the ring that limits the action. */
export const LIMIT_NOTE: Record<RingId, Partial<Record<ActionId, string>>> = {
  process: { file: 'only files an unprivileged user may read' },
  seccomp: { 'kernel-bug': 'fewer system calls reach the kernel at all' },
  namespaces: { mount: 'the mount changes only its own private view' },
  cgroup: { fork: 'children are refused past the process limit', memory: 'the plugin is killed past the memory limit' },
  runtime: {},
  microvm: { fork: 'the storm stays inside the guest', memory: 'the guest has a fixed amount of memory', syscall: 'the guest kernel answers, not the host', mount: 'the mount stays inside the guest', 'kernel-bug': 'it reaches the guest kernel, not the host one' },
};

export type RingSet = ReadonlySet<RingId>;
export const ringSet = (...rings: RingId[]): RingSet => new Set(rings);
export const ALL_RINGS: RingSet = ringSet(...RING_ORDER);

export type Decision =
  | { kind: 'allowed' }
  | { kind: 'blocked'; by: RingId }
  | { kind: 'limited'; by: RingId };

/** What happens to an action given the rings that are on. */
export function decide(action: ActionId, rings: RingSet): Decision {
  const met = RING_ORDER.filter((r) => rings.has(r));
  const blocker = met.find((r) => RULES[r][action] === 'blocked');
  if (blocker) return { kind: 'blocked', by: blocker };
  const limiter = met.find((r) => RULES[r][action] === 'limited');
  return limiter ? { kind: 'limited', by: limiter } : { kind: 'allowed' };
}

/** How strong a verdict is: allowed 0, limited 1, blocked 2. */
export const strength = (d: Decision): number => (d.kind === 'blocked' ? 2 : d.kind === 'limited' ? 1 : 0);

/** The ring where the action's path ends: the blocker, else null (it passed every ring that is on). */
export const stoppedAt = (d: Decision): RingId | null => (d.kind === 'blocked' ? d.by : null);

/** Every subset of the six rings, as sets. */
export function allRingSets(): RingSet[] {
  return Array.from({ length: 1 << RING_ORDER.length }, (_, mask) => ringSet(...RING_ORDER.filter((_, i) => mask & (1 << i))));
}

export const decisionText = (d: Decision): string =>
  d.kind === 'allowed' ? 'allowed' : d.kind === 'blocked' ? `blocked by ${RING_LABEL[d.by]}` : `limited by ${RING_LABEL[d.by]}`;
