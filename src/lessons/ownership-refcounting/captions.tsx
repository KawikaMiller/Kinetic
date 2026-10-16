import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Fate, Mode, Op, Replay } from './heap';
import { describeOp, leaked, updateCost } from './heap';
import { freedAt, RULES, type Verdict, type Line, formatLine } from './ownership';

/** How one object's fate reads in the comparison table. */
export function fateText(f: Fate): string {
  switch (f.kind) {
    case 'unused': return 'not allocated';
    case 'live': return 'live';
    case 'freed': return `freed at op ${f.at}`;
    case 'leaked': return 'never freed: leaked';
    case 'pending': return 'at the next collect';
  }
}

export interface CountView {
  log: readonly Op[];
  counting: Replay;
  tracing: Replay;
  atomic: boolean;
  note: string | null;
}

/** The sentence under the counting stage: the last operation, what it freed, who is leaked, and what the counts cost. Built from the runs. */
export function countCaption(v: CountView): ReactNode {
  const end = v.counting.heaps[v.counting.heaps.length - 1];
  const strays = leaked(end);
  const freed = v.counting.fates.filter((f) => f.kind === 'freed').length;
  const traced = v.tracing.fates.filter((f) => f.kind === 'freed').length;
  const cost = updateCost(end.updates, v.atomic);
  const last = v.log.length ? `After ${describeOp(v.log[v.log.length - 1])}` : 'With nothing done yet';
  return (
    <>
      {v.note ? <>Refused: {v.note}. </> : null}
      {last}: counting has freed {plural(freed, 'object')} and {strays.length === 0 ? 'leaked none' : `leaked ${plural(strays.length, 'object')}, which nothing can reach and no count will free`}; tracing has freed {plural(traced, 'object')}. {plural(end.updates, 'count update')} cost {cost} in the toy model ({v.atomic ? 'atomic' : 'plain'} updates).
    </>
  );
}

/** The sentence under the ownership stage: the verdict, the first problem, and where memory goes back. */
export function ownCaption(program: readonly Line[], verdict: Verdict): ReactNode {
  if (program.length === 0) return <>The program is empty. Add lines from the palette; click a line to remove it.</>;
  if (!verdict.accepted) {
    const p = verdict.problems[0];
    return <>Rejected, line {p.line + 1} ({formatLine(program[p.line])}): {RULES[p.rule].name}. Some correct programs are rejected too, and <code>Rc</code> with <code>RefCell</code>, or <code>unsafe</code>, is the way out.</>;
  }
  const f = freedAt(program);
  return <>Accepted. Memory goes back {f.why}: there is no count and no collector, and the free is at a known place.</>;
}

export const MODE_LABEL: Record<Mode, string> = { counting: 'Reference counting', tracing: 'Tracing collection' };
