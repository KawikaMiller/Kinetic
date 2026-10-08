import type { Frame } from '../../core/types';
import { resolve, type Registration } from './container';

export interface DiFrame extends Frame {
  say: string;
  /** The key being resolved, built or reused now. */
  current: string | null;
  /** The chain of keys from the root to `current`. */
  path: string[];
  /** Instances created so far, per key. */
  created: Record<string, number>;
  cycle: string[] | null;
}

const arrow = (keys: readonly string[]) => keys.join(' → ');

/** One frame per container event, then a summary computed from the run. */
export function containerFrames(regs: readonly Registration[], root: string, times: number): DiFrame[] {
  const r = resolve(regs, root, times);
  const impl = (k: string) => regs.find((x) => x.key === k)?.impl ?? k;
  const counts: Record<string, number> = Object.fromEntries(regs.map((x) => [x.key, 0]));
  const frames: DiFrame[] = [
    {
      say: `Resolve "${root}" ${times} times. The container reads each registration and builds what it needs, dependencies first. Press play.`,
      current: null,
      path: [],
      created: { ...counts },
      cycle: null,
    },
  ];
  for (const e of r.events) {
    let say: string;
    if (e.kind === 'resolve') {
      const deps = regs.find((x) => x.key === e.key)!.deps;
      say = `Resolving ${e.key} (${impl(e.key)}): ${deps.length ? `needs ${deps.join(' and ')} first` : 'needs nothing'}.`;
    } else if (e.kind === 'create') {
      counts[e.key] = e.instance;
      const single = regs.find((x) => x.key === e.key)!.lifetime === 'singleton';
      say = `Created ${impl(e.key)} #${e.instance}${single ? ': a singleton, shared from now on' : ': transient, a new one each time it is asked for'}.`;
    } else if (e.kind === 'reuse') {
      say = `${impl(e.key)} is a singleton: reusing instance #${e.instance}, nothing new built.`;
    } else if (e.kind === 'cycle') {
      say = `Cycle: ${arrow(r.cycle!)}. Neither constructor can run first, so resolution fails.`;
    } else {
      say = `Nothing is registered for "${e.key}", so resolution fails.`;
    }
    frames.push({ say, current: e.key, path: e.path, created: { ...counts }, cycle: e.kind === 'cycle' ? r.cycle : null });
  }
  const total = Object.values(r.created).reduce((a, b) => a + b, 0);
  const summary = r.cycle
    ? `Failed: ${arrow(r.cycle)} is a cycle. Fix it by splitting a class or passing a factory instead of the object.`
    : r.missing
      ? `Failed: "${r.missing}" is not registered.`
      : `Resolved ${root} ${times}×, building ${total} instances: ${regs.map((x) => `${impl(x.key)} ×${r.created[x.key]}`).join(', ')}.`;
  frames.push({ say: summary, current: null, path: [], created: { ...r.created }, cycle: r.cycle });
  return frames;
}
