import type { ReactNode } from 'react';
import { bytes as fmtBytes } from '../../core/format';
import { verdict, type HeapRun, type LeakId } from './model';

export const mb = (b: number) => fmtBytes(b, { dp: 0 });

/** The stage's caption: what the troughs say, computed from the run. */
export function verdictCaption(leak: LeakId, run: HeapRun): ReactNode {
  const v = verdict(run);
  const floor = mb(run.troughs.at(-1)?.heap ?? run.samples.at(-1)!.heap);
  if (v.verdict === 'leak') {
    return <>Every GC drops the heap to a higher floor: the troughs climb by about {mb(v.growthPerHour)} an hour. That is a leak: something reachable keeps what the app no longer needs.</>;
  }
  if (leak === 'bigCache') return <>The heap is high, about {floor} after each GC, but flat: a big cache with a fixed size is high usage, not a leak.</>;
  return <>With the fix the troughs stay flat: each GC gets back to the same floor, about {floor}.</>;
}
