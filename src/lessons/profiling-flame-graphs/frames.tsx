import type { ReactNode } from 'react';
import { pct, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  HOT_LEAF, NO_FIXES, cpuTime, foldStacks, margin95, program, sample, timeline, type Fixes, type FlameNode, type Sample, type Segment,
} from './model';

/** At most this many steps to build the graph, however many samples. */
export const MAX_STEPS = 40;
const SUMMARY_HOLD = 3;

export interface PfFrame extends Frame {
  /** Samples taken so far. */
  shown: number;
  /** The one that just arrived (flashes), or null. */
  latest: Sample | null;
}

const arrow = (stack: readonly string[]) => stack.join(' → ');

/** Times as shown: one decimal, from the drift-free sum. Every on-screen ms goes through this. */
export const shownMs = (v: number) => Math.round(v * 10) / 10;
export const fmtMs = (v: number) => `${shownMs(v).toFixed(1)} ms`;

/** A saving counts as worth having (green, not amber) above this share of the run. */
export const WORTHWHILE = 0.1;

/** The cut from `before` to `now`, worked out from the values as shown, so the % matches them. */
export function saving(before: number, now: number): { share: number; worthwhile: boolean } {
  const [b, n] = [shownMs(before), shownMs(now)];
  const share = (b - n) / b;
  return { share, worthwhile: share > WORTHWHILE };
}
const fixed = (ms1: number) => (Number.isInteger(ms1) ? String(ms1) : ms1.toFixed(1));

/** Every node with this name, summed (a function can appear under several parents). */
export function byName(root: FlameNode, name: string): { total: number; self: number } {
  let total = 0;
  let self = 0;
  const walk = (n: FlameNode, inside: boolean) => {
    const here = n.name === name;
    if (here && !inside) total += n.total;
    if (here) self += n.self;
    n.children.forEach((c) => walk(c, inside || here));
  };
  walk(root, false);
  return { total, self };
}

/** The leaf with the most self samples. */
export function hottestLeaf(root: FlameNode): { name: string; self: number } {
  const selfs = new Map<string, number>();
  const walk = (n: FlameNode) => {
    if (n.self && n.name !== 'all') selfs.set(n.name, (selfs.get(n.name) ?? 0) + n.self);
    n.children.forEach(walk);
  };
  walk(root);
  return [...selfs].reduce((a, [name, self]) => (self > a.self ? { name, self } : a), { name: '', self: -1 });
}

function summary(samples: readonly Sample[], segs: readonly Segment[], fixes: Fixes): ReactNode {
  const root = foldStacks(samples);
  const n = samples.length;
  const render = byName(root, 'renderPage');
  const hot = hottestLeaf(root);
  const before = cpuTime(timeline(program(NO_FIXES)));
  const now = cpuTime(segs);
  const share = hot.self / n;
  const cut = saving(before, now);
  const fixNote =
    fixes.hoist || fixes.fastJson ? (
      <>
        {' '}With {[fixes.hoist && 'the formatter hoisted', fixes.fastJson && 'the faster parser'].filter(Boolean).join(' and ')}, the modelled on-CPU time is{' '}
        {fmtMs(now)} instead of {fmtMs(before)}, <span className={`hl ${cut.worthwhile ? 'ok' : 'amber'}`}>{pct(cut.share)} less</span>.
      </>
    ) : null;
  const moved = hot.name !== HOT_LEAF;
  return (
    <>
      {plural(n, 'sample')}. <b>renderPage</b> is on the stack in {pct(render.total / n)} of them, but only {pct(render.self / n)} are its own work.
      The widest leaf is <span className="hl">{hot.name}</span> at {pct(share)} (±{Math.round(margin95(share, n) * 100)} points):{' '}
      {moved ? <>the hot spot has moved, so that's where to look next.</> : <>that's where to look first.</>}
      {fixNote}
    </>
  );
}

/** Frames that add the samples in up to MAX_STEPS batches, then a summary. */
export function profileFrames(fixes: Fixes, n: number, seed: number): { frames: PfFrame[]; samples: Sample[]; segs: Segment[] } {
  const segs = timeline(program(fixes));
  const samples = sample(segs, n, seed);
  const steps = Math.min(n, MAX_STEPS);
  const wait = segs.find((s) => !s.onCpu)!;
  const frames: PfFrame[] = [
    {
      shown: 0,
      latest: null,
      say: (
        <>
          A sampling profiler interrupts the program at regular slices of CPU time and records the call stack each time. {plural(n, 'sample')} coming;
          each one drops into the flame graph.
        </>
      ),
    },
  ];
  let prevAt = -1;
  for (let k = 1; k <= steps; k++) {
    const shown = Math.round((k * n) / steps);
    const latest = samples[shown - 1];
    const skippedWait = prevAt < wait.start && latest.at > wait.end;
    frames.push({
      shown,
      latest,
      say: skippedWait ? (
        <>
          No samples from {fixed(wait.start)} to {fixed(wait.end)} ms: db.query was waiting for the database, <b>off the CPU</b>, so a CPU profiler never
          sees that time. (A wall-clock or off-CPU profiler would.)
        </>
      ) : (
        <>
          {shown === 1 ? 'Sample 1' : `Samples ${Math.round(((k - 1) * n) / steps) + 1}–${shown}`}: the latest caught <code>{arrow(latest.stack)}</code> at{' '}
          {fixed(latest.at)} ms.
        </>
      ),
      quiet: !skippedWait,
    });
    prevAt = latest.at;
  }
  frames.push({ shown: n, latest: null, say: summary(samples, segs, fixes), hold: SUMMARY_HOLD });
  return { frames, samples, segs };
}
