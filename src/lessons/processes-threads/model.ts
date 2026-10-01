// Two processes, five threads and two CPU cores. Scenarios (scenarios.tsx) are scripts of
// small patches; this module turns them into consistent frames: thread states follow from
// who is on a core, and the context-switch count follows from how the cores change.
import type { Frame } from '../../core/types';

export type PId = 'A' | 'B';
/** blocked = waiting for something (I/O, a lock): normal, not an error. */
export type TState = 'ready' | 'running' | 'blocked' | 'crash' | 'dead';

export interface ThreadDef {
  id: string;
  name: string;
  proc: PId;
}

export const PROCS: { id: PId; name: string; pid: number; color: string }[] = [
  { id: 'A', name: 'Browser', pid: 4120, color: 'var(--info)' },
  { id: 'B', name: 'Music', pid: 5306, color: 'var(--violet)' },
];

export const THREADS: ThreadDef[] = [
  { id: 'A1', name: 'ui', proc: 'A' },
  { id: 'A2', name: 'network', proc: 'A' },
  { id: 'A3', name: 'render', proc: 'A' },
  { id: 'B1', name: 'decode', proc: 'B' },
  { id: 'B2', name: 'playback', proc: 'B' },
];

export const CORES = 2;

export const procOf = (tid: string) => THREADS.find((t) => t.id === tid)!.proc;
export const colorOf = (p: PId) => PROCS.find((x) => x.id === p)!.color;

export interface PtFrame extends Frame {
  cores: (string | null)[];
  /** Mid context switch: the cores are saving one thread's registers and loading the next. */
  switching: boolean;
  states: Record<string, TState>;
  procDead: Record<PId, boolean>;
  heap: Record<PId, string[]>;
  /** Heap cell (by index) glowing this frame. */
  heapHot: { proc: PId; index: number; kind: 'write' | 'read' | 'denied' } | null;
  /** Threads glowing because they touch memory this frame. */
  touching: string[];
  /** A message travelling through the kernel. */
  ipc: { label: string; from: PId } | null;
  /** Context switches so far: a core going from one thread to a different one. */
  switches: number;
}

/** What a scenario step may change; states for running/ready are derived, not written. */
export type Patch = Partial<Omit<PtFrame, 'switches'>>;

export function initialFrame(): PtFrame {
  return {
    cores: Array(CORES).fill(null),
    switching: false,
    states: Object.fromEntries(THREADS.map((t) => [t.id, 'ready' as TState])),
    procDead: { A: false, B: false },
    heap: { A: ['tabs = 2', 'cache[ ]'], B: ['track = "Aria"', 'state = playing'] },
    heapHot: null,
    touching: [],
    ipc: null,
    switches: 0,
  };
}

/** Put threads on the cores (null = idle). */
export const runOn = (...cores: (string | null)[]): Patch => ({ cores });
/** A context-switch frame: both cores busy saving and loading registers. */
export const SWITCH: Patch = { switching: true };

/** How many cores went from one thread to a different thread (a core starting from idle isn't a switch). */
function coreChanges(from: (string | null)[], to: (string | null)[]) {
  return from.reduce((n, t, i) => n + (t && to[i] && to[i] !== t ? 1 : 0), 0);
}

/**
 * Build frames from a script. Each step patches the previous frame; per-frame highlights
 * reset; anyone alive and not blocked is running if on a core (and not mid-switch), else
 * ready. Switches are counted from the cores: a switch frame is charged with the changes
 * it leads into, so the counter ticks while the "⇄ switching" chip is on screen.
 */
export function script(steps: ((f: PtFrame) => Patch)[]): PtFrame[] {
  const frames: PtFrame[] = [];
  let cur = initialFrame();
  for (const step of steps) {
    const prev: PtFrame = {
      ...cur,
      states: { ...cur.states },
      heap: { A: [...cur.heap.A], B: [...cur.heap.B] },
      heapHot: null,
      touching: [],
      ipc: null,
      switching: false,
    };
    const next: PtFrame = { ...prev, ...step(prev) };
    for (const t of THREADS) {
      const s = next.states[t.id];
      if (s === 'dead' || s === 'crash' || s === 'blocked') continue;
      next.states[t.id] = next.cores.includes(t.id) && !next.switching ? 'running' : 'ready';
    }
    frames.push(next);
    cur = next;
  }

  let total = 0;
  let last: (string | null)[] = Array(CORES).fill(null);
  frames.forEach((f, i) => {
    if (f.switching) {
      const after = frames.slice(i + 1).find((x) => !x.switching)?.cores ?? last;
      total += coreChanges(last, after);
      last = after;
    } else {
      total += coreChanges(last, f.cores);
      last = f.cores;
    }
    f.switches = total;
  });
  return frames;
}
