/**
 * The seccomp scene's model: twenty real system call NAMES offered as checkboxes, a toy image resizer whose
 * system call trace is a fixed script, and a replay of that script against the learner's allow-list.
 * No system call is made anywhere: the "strace output" is lesson-authored text.
 */

export interface Syscall {
  name: string;
  /** What allowing it grants, in plain words (a risky call), or null for an ordinary runtime call. */
  grants: string | null;
}

/** The catalogue the learner ticks. Names are real Linux system call names; the descriptions are the lesson's own. */
export const SYSCALLS: readonly Syscall[] = [
  { name: 'read', grants: null },
  { name: 'write', grants: null },
  { name: 'openat', grants: 'can open files wherever its other limits let it reach' },
  { name: 'close', grants: null },
  { name: 'fstat', grants: null },
  { name: 'mmap', grants: null },
  { name: 'munmap', grants: null },
  { name: 'brk', grants: null },
  { name: 'futex', grants: null },
  { name: 'clock_gettime', grants: null },
  { name: 'getpid', grants: null },
  { name: 'exit_group', grants: null },
  { name: 'socket', grants: 'can open connections' },
  { name: 'connect', grants: 'can open connections' },
  { name: 'execve', grants: 'can start other programs' },
  { name: 'clone', grants: 'can create threads and processes' },
  { name: 'mount', grants: 'can mount filesystems' },
  { name: 'ptrace', grants: 'can inspect and control other processes' },
  { name: 'kill', grants: 'can signal other processes' },
  { name: 'unlink', grants: 'can delete files' },
];

export const SYSCALL_NAMES: readonly string[] = SYSCALLS.map((s) => s.name);

/** What the filter does with a call that is not on the list. Real filters have more actions (kill, errno, trap, trace, log, allow); verify against seccomp(2). */
export type DefaultAction = 'kill' | 'errno';

/** The toy image resizer's system calls, in order, as a script. The same call can appear many times. */
export const TRACE: readonly string[] = [
  'openat', 'fstat', 'mmap', 'read', 'read', 'brk', 'futex', 'mmap', 'clock_gettime', 'write', 'write', 'close', 'munmap', 'exit_group',
];

/** The distinct calls the trace needs, in the order they first appear. */
export const NEEDED: readonly string[] = [...new Set(TRACE)];

export type Allowed = ReadonlySet<string>;

export type ReplayStatus = 'allowed' | 'denied' | 'not-run';

export interface ReplayRow {
  index: number;
  name: string;
  status: ReplayStatus;
}

export interface Replay {
  rows: ReplayRow[];
  /** Index of the first denied call, or null when the whole trace ran. */
  firstDenied: number | null;
  /** How the run ended. */
  ending: 'completed' | 'killed' | 'failed';
}

/** Replay the trace against an allow-list: the first denied call ends the run (killed, or failed with an error the toy does not handle). */
export function replay(allowed: Allowed, otherwise: DefaultAction, trace: readonly string[] = TRACE): Replay {
  const firstDenied = trace.findIndex((name) => !allowed.has(name));
  const rows = trace.map<ReplayRow>((name, index) => ({
    index,
    name,
    status: firstDenied < 0 || index < firstDenied ? 'allowed' : index === firstDenied ? 'denied' : 'not-run',
  }));
  return {
    rows,
    firstDenied: firstDenied < 0 ? null : firstDenied,
    ending: firstDenied < 0 ? 'completed' : otherwise === 'kill' ? 'killed' : 'failed',
  };
}

/** The capabilities an allow-list grants beyond what the trace needs: (call, what it grants) for each risky extra. */
export function grantedExtras(allowed: Allowed): { name: string; grants: string }[] {
  return SYSCALLS.filter((s) => allowed.has(s.name) && s.grants !== null && !NEEDED.includes(s.name)).map((s) => ({ name: s.name, grants: s.grants! }));
}

export interface MinimalCheck {
  runs: boolean;
  /** Needed calls the list lacks. */
  missing: string[];
  /** Allowed calls the trace never makes. */
  extra: string[];
  /** The list runs the trace and has nothing extra: the smallest that still works. */
  minimal: boolean;
}

export function checkMinimal(allowed: Allowed): MinimalCheck {
  const missing = NEEDED.filter((n) => !allowed.has(n));
  const extra = [...allowed].filter((n) => !NEEDED.includes(n)).sort();
  return { runs: missing.length === 0, missing, extra, minimal: missing.length === 0 && extra.length === 0 };
}

/** The list the scene opens on: everything the trace needs except mmap and munmap, so the run is killed at the first mmap. */
export const OPENING_ALLOWED: readonly string[] = NEEDED.filter((n) => n !== 'mmap' && n !== 'munmap');
