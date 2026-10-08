import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { regressions, type ChangeKind, type Move, type TestResult, type VersionId } from './model';

const tally = (r: readonly TestResult[]) => {
  const pass = r.filter((x) => x.passed).length;
  return r.length ? `${pass} of ${plural(r.length, 'test')} pass` : 'no tests yet';
};

/** After a move: its verdict (good or bad, from the script), the reason, and the live test tally. */
export function moveCaption(m: Move, results: readonly TestResult[], untested: readonly string[]): ReactNode {
  const red = results.filter((r) => !r.passed).map((r) => r.id);
  const status = <> Now {tally(results)}{red.length ? `; red: ${red.join(', ')}` : ''}{untested.length ? `; untested: ${untested.join(', ')}` : ''}.</>;
  return m.good
    ? <><span className="hl ok">Good move.</span> {m.why}{status}</>
    : <><span className="hl bad">Costly move.</span> {m.why}{status} Undo it to carry on.</>;
}

export const doneCaption = (results: readonly TestResult[]): ReactNode => (
  <>Kata done: {tally(results)}, and every behaviour has a test that once failed (or, for 21, one that pins it). Try the change request scene next.</>
);

/** The change-request verdict for one side, from the test results and the regression check. */
export function changeVerdict(side: string, v: VersionId, results: readonly TestResult[], change: ChangeKind): ReactNode {
  const red = results.filter((r) => !r.passed);
  const broken = regressions(v);
  if (change === 'none') return <>{side}: {tally(results)} before the change.</>;
  if (red.length) return <>{side}: <span className="hl ok">caught</span>: {red.map((r) => r.id).join(', ')} went red ({red.map((r) => r.actual).join(', ')}).</>;
  if (broken.length) {
    return <>{side}: every test green, but the regression <span className="hl bad">slipped by</span>: {broken.slice(0, 3).join(', ')}{broken.length > 3 ? ` and ${broken.length - 3} more` : ''} now print the wrong thing.</>;
  }
  return <>{side}: every test green, and no old answer changed.</>;
}
