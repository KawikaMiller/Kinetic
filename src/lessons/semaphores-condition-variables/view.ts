// Pure helpers that turn worlds into what the stage draws.
import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import type { Thread, World } from './model';

export type Shown = 'running' | 'ready' | 'asleep' | 'io' | 'done';

/** How a thread looks this tick: the one that ran is running; a woken or runnable one is ready. */
export function shownStatus(w: World, t: Thread): Shown {
  if (t.status === 'done') return w.active === t.id ? 'running' : 'done';
  if (w.active === t.id) return 'running';
  if (t.status === 'ready') return 'ready';
  if (t.status === 'io') return 'io';
  return 'asleep';
}

export const SHOWN_TONE: Record<Shown, Tone> = { running: 'hi', ready: 'info', asleep: 'dim', io: 'muted', done: 'ok' };
const KIND: Record<Shown, GanttBar['kind']> = { running: 'work', ready: 'wait', asleep: 'work', io: 'blocked', done: 'work' };

/** Ticks the timeline shows. */
export const WINDOW = 40;

/** Timeline bars for the last WINDOW ticks up to `index`, consecutive ticks in one state merged. */
export function laneBars(worlds: readonly World[], index: number): GanttBar[] {
  const bars: GanttBar[] = [];
  const from = Math.max(1, index - WINDOW + 1);
  const ids = worlds[0].threads.map((t) => t.id);
  for (const id of ids) {
    let run: { s: Shown; start: number } | null = null;
    const flush = (end: number) => {
      if (run && run.s !== 'done') bars.push({ id: `${id}-${run.start}`, lane: id, start: run.start - 1, end, tone: SHOWN_TONE[run.s], kind: KIND[run.s] });
    };
    for (let i = from; i <= index; i++) {
      const w = worlds[i];
      // A verdict frame repeats the last tick's world; it isn't a tick of its own.
      if (w.tick === worlds[i - 1].tick) continue;
      const s = shownStatus(w, w.threads.find((t) => t.id === id)!);
      if (!run || run.s !== s) {
        flush(w.tick - 1);
        run = { s, start: w.tick };
      }
    }
    flush(worlds[index].tick);
  }
  return bars;
}

/** CPU use over the last `n` ticks: share busy, and share of all ticks spent spinning. */
export function cpuWindow(cpu: readonly string[], n = 20) {
  const last = cpu.slice(-n);
  if (last.length === 0) return { busy: 0, spin: 0 };
  return { busy: last.filter((x) => x !== 'idle').length / last.length, spin: last.filter((x) => x === 'spin').length / last.length };
}

/**
 * The slot a broken step hit: a garbage read reads at head (the buffer is empty, so head is
 * not advanced), an overflow writes at the slot just before tail. Null when nothing broke.
 */
export function badSlot(w: World, capacity: number): number | null {
  const n = w.note;
  const what = n.kind === 'violation' ? n.what : n.kind === 'take' && n.garbage ? 'garbage' : n.kind === 'put' && n.overflow ? 'overflow' : null;
  if (what === 'garbage') return w.head;
  if (what === 'overflow') return (w.tail - 1 + capacity) % capacity;
  return null;
}
