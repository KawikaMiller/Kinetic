import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder, type Recorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  COINS_PER_OP, coinsNeeded, firstOverdraft, growthLabel, lowestBalance, pushes, run, TRAP_FILL, TRAP_OPS,
  type Growth, type ShrinkRule, type Step,
} from './model';

/** At most this many copy frames per resize; bigger copies go in batches. */
const MAX_COPY_FRAMES = 8;

export interface AmFrame extends Frame {
  /** The live block: element values, null for empty capacity. */
  block: (number | null)[];
  /** The old block while a resize copies out of it; null otherwise. */
  old: (number | null)[] | null;
  /** Slot of `block` being written (or cleared, for a pop) right now. */
  writing: number | null;
  /** Elements copied so far in the current resize (the first `copied` slots of both blocks). */
  copied: number;
  /** Operations finished, for the cost bars. */
  done: number;
  balance: number;
  total: number;
}

const slots = (items: readonly number[], cap: number): (number | null)[] => Array.from({ length: cap }, (_, i) => items[i] ?? null);
const avg = (total: number, n: number) => (n ? (total / n).toFixed(2) : '0');

const blank = (): Omit<AmFrame, 'say' | 'hold'> => ({ block: slots([], 1), old: null, writing: null, copied: 0, done: 0, balance: 0, total: 0 });

/** The banker's line for one push: what came in, what went out, where the balance is. */
function bankLine(s: Step): ReactNode {
  const out = s.copies ? <>−1 for the write, −{s.copies} for the copies</> : <>−1 for the write</>;
  return (
    <>
      Bank: +{COINS_PER_OP}, {out}, so the balance is <b>{s.balance}</b>
      {s.balance < 0 ? <>: below zero, the saved coins didn't cover this resize.</> : '.'}
    </>
  );
}

/** Detailed frames for one push: allocate, copy (in up to MAX_COPY_FRAMES batches), free, write. */
function detailPush(rec: Recorder<AmFrame>, s: Step) {
  const base = rec.get();
  if (!s.resize) {
    rec.snap(
      <>Push {s.value}: there's room ({s.before.length} of {s.capBefore} used), so it writes slot {s.before.length}. Cost 1. {bankLine(s)}</>,
      undefined,
      { block: slots(s.after, s.capAfter), writing: s.before.length, done: s.n, balance: s.balance, total: base.total + s.cost },
    );
    return;
  }
  const c = s.before.length;
  const oldBlock = slots(s.before, s.capBefore);
  rec.snap(
    <>Push {s.value}: the block is full ({c} of {c}). Allocate a new block of {s.capAfter} slots.</>,
    undefined,
    { old: oldBlock, block: slots([], s.capAfter), writing: null, copied: 0 },
  );
  const batch = Math.ceil(c / MAX_COPY_FRAMES);
  for (let m = batch; m < c + batch; m += batch) {
    const k = Math.min(m, c);
    rec.snap(
      k === 1
        ? <>Copy element 1 into the new block: 1 of {c} copied.</>
        : <>Copy {batch === 1 ? <>element {k}</> : <>elements up to {k}</>} into the new block: {k} of {c} copied.</>,
      undefined,
      { block: slots(s.before.slice(0, k), s.capAfter), copied: k },
    );
  }
  rec.snap(<>All {c} copied. Free the old block.</>, undefined, { old: null });
  rec.snap(
    <>Now write {s.value} into slot {c}. This push cost 1 + {c} = <b>{s.cost}</b> writes. {bankLine(s)}</>,
    undefined,
    { block: slots(s.after, s.capAfter), writing: c, copied: c, done: s.n, balance: s.balance, total: base.total + s.cost },
  );
}

/** One frame for one operation (several pushes at once, or the trap script). */
function compactStep(rec: Recorder<AmFrame>, s: Step) {
  const what =
    s.op === 'push'
      ? s.resize
        ? <>push {s.value}: full, grow {s.capBefore} → {s.capAfter} and copy {s.copies}, cost {s.cost}</>
        : <>push {s.value}: cost 1</>
      : s.resize
        ? <>pop {s.value}: shrink {s.capBefore} → {s.capAfter} and copy {s.copies}, cost {s.cost}</>
        : <>pop {s.value}: cost 1</>;
  rec.snap(
    <>Operation {s.n}, {what}. Balance {s.balance}.</>,
    undefined,
    {
      // A pop clears the slot after the new last element; after a shrink that slot is gone.
      block: slots(s.after, s.capAfter), old: null, writing: s.op === 'push' ? s.after.length - 1 : s.resize ? null : s.after.length,
      copied: s.copies, done: s.n, balance: s.balance, total: rec.get().total + s.cost,
    },
  );
}

/** The verdict on the bank account, from the steps themselves. */
export function bankVerdict(steps: readonly Step[], growth: Growth): ReactNode {
  const over = firstOverdraft(steps);
  if (!over) return <>The balance never went below zero (lowest {lowestBalance(steps)}): {COINS_PER_OP} coins per push paid for every copy in advance.</>;
  return (
    <>
      The balance first went below zero at push {over.n}: {COINS_PER_OP} coins per push can't prepay {growthLabel(growth)} growth.
      {growth === 'plus10'
        ? <> Over these {steps.length} pushes it would need {coinsNeeded(steps.length, growth)} per push, and that keeps rising as n grows.</>
        : <> Over these {steps.length} pushes it would need {coinsNeeded(steps.length, growth)} per push.</>}
    </>
  );
}

/**
 * The push playground: `n` pushes so far, the newest `batch` of them just made. One push
 * gets the detailed allocate-copy-free-write frames; a batch gets a frame per push.
 */
export function pushFrames(n: number, batch: number, growth: Growth): AmFrame[] {
  const rec = createRecorder<AmFrame>(blank());
  if (n === 0) {
    rec.snap(<>An empty dynamic array with capacity 1, growing by {growthLabel(growth)}. Press Push to add an element.</>);
    return rec.frames;
  }
  const steps = run(pushes(n), growth);
  const from = n - batch;
  const prev = steps[from - 1];
  const total = steps.slice(0, from).reduce((t, s) => t + s.cost, 0);
  rec.snap(
    from === 0
      ? <>Start: an empty array with capacity 1, growing by {growthLabel(growth)}.</>
      : <>{plural(from, 'push', 'pushes')} so far: {prev.after.length} of {prev.capAfter} slots used, balance {prev.balance}.</>,
    undefined,
    { block: prev ? slots(prev.after, prev.capAfter) : slots([], 1), done: from, balance: prev?.balance ?? 0, total },
  );
  steps.slice(from).forEach((s) => (batch === 1 ? detailPush(rec, s) : compactStep(rec, s)));
  // The summary is about the whole run: nothing is being written or copied any more.
  rec.set({ copied: 0, writing: null });
  rec.close(
    <>
      {plural(n, 'push', 'pushes')}: {plural(rec.get().total, 'write')} in all, an average of <b>{avg(rec.get().total, n)}</b> per push. {bankVerdict(steps, growth)}
    </>,
    2,
  );
  return rec.frames;
}

/** Copies made after the fill, i.e. during the alternating push/pop part of the trap. */
export const trapCopies = (steps: readonly Step[]) => steps.slice(TRAP_FILL).reduce((t, s) => t + s.copies, 0);

export function trapFrames(shrink: Exclude<ShrinkRule, 'none'>): AmFrame[] {
  const steps = run(TRAP_OPS, 'double', shrink);
  const rec = createRecorder<AmFrame>(blank());
  const fill = steps[TRAP_FILL - 1];
  const fillCost = steps.slice(0, TRAP_FILL).reduce((t, s) => t + s.cost, 0);
  const rule = shrink === 'half' ? 'half full or less' : 'a quarter full or less';
  rec.snap(
    <>Doubling growth, filled with {TRAP_FILL} pushes: {fill.after.length} of {fill.capAfter} slots, exactly full. A pop shrinks the block to half its capacity when it leaves it {rule}. Now alternate push and pop.</>,
    undefined,
    { block: slots(fill.after, fill.capAfter), done: TRAP_FILL, balance: fill.balance, total: fillCost },
  );
  steps.slice(TRAP_FILL).forEach((s) => compactStep(rec, s));
  const alt = steps.length - TRAP_FILL;
  const copies = trapCopies(steps);
  const copying = steps.slice(TRAP_FILL).filter((s) => s.copies > 0).length;
  rec.set({ copied: 0, writing: null });
  rec.close(
    <>
      {alt} alternating operations made {plural(copies, 'copy', 'copies')}
      {copying === alt ? <>: every single one resized. Thrashing.</> : copying === 0 ? <>: none of them resized.</> : <>: {copying} of them resized.</>}{' '}
      {firstOverdraft(steps) ? <>The {COINS_PER_OP}-coin bank went below zero at operation {firstOverdraft(steps)!.n}.</> : <>The {COINS_PER_OP}-coin bank never went below zero (lowest {lowestBalance(steps)}).</>}
    </>,
    2,
  );
  return rec.frames;
}
