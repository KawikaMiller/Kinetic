import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { SMELLS, type DiffRow, type RefactorId, type TestOutcome } from './model';

const verdict = (tests: readonly TestOutcome[]): ReactNode => {
  const red = tests.filter((t) => !t.passed);
  return red.length
    ? <><span className="hl bad">{red.length} of {tests.length} tests red</span> ({red.map((t) => `${t.name}: expected ${t.expected}, got ${t.actual}`).join('; ')})</>
    : <><span className="hl ok">all {tests.length} tests green</span></>;
};

/** After a refactoring: what the diff changed and what the tests said, both computed. */
export function appliedCaption(r: RefactorId, rows: readonly DiffRow[], tests: readonly TestOutcome[], unsafe: boolean): ReactNode {
  const added = rows.filter((x) => x.kind === 'added').length;
  const removed = rows.filter((x) => x.kind === 'removed').length;
  const red = tests.some((t) => !t.passed);
  return <>{SMELLS[r].refactoring}: {plural(added, 'line')} in, {plural(removed, 'line')} out, and {verdict(tests)}.
    {red ? (unsafe ? ' The unsafe edit is still in, so the red is that edit, not this refactoring.' : '') : ' Every test still agrees, so behaviour looks unchanged (twelve tests are evidence, not proof): that is a refactoring.'}</>;
}

export function unsafeCaption(on: boolean, tests: readonly TestOutcome[]): ReactNode {
  if (!on) return <>Unsafe edit taken out: {verdict(tests)}.</>;
  return tests.some((t) => !t.passed)
    ? <>&quot;Fixing&quot; the tax rounding while tidying up: {verdict(tests)}. It may even be a good fix, but it changes behaviour, so it belongs in its own commit, with a test that says so.</>
    : <>The unsafe edit is in and {verdict(tests)}: these tests don&apos;t cover it.</>;
}

export function smellCaption(r: RefactorId): ReactNode {
  const s = SMELLS[r];
  return <><span className="hl orange">{s.smell}</span>{s.note ? ` (${s.note})` : ''}: the fix is <b>{s.refactoring}</b>. Press Apply.</>;
}
