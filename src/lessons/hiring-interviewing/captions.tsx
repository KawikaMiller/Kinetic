import type { ReactNode } from 'react';
import { decimal, joinList, plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { INTERVIEWERS, STAGE_NAMES, FUNNEL_POOL, type InterviewerRow, type PanelResult, type StageResult, type StageSpec } from './model';
import { METER } from './scenario';

export const twoDp = (x: number): string => decimal(x, 2);
export const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** Scene 1: the panel, the formula and what this pool measured. */
export function panelCaption(k: number, sigma: number, hirePercent: number, res: PanelResult): ReactNode {
  return (
    <>
      {plural(k, 'interviewer')} at an error of {sigma} each, hiring the top {hirePercent}%: the correlation of score with true skill is {twoDp(res.rFormula)} by the formula and {twoDp(res.rPool)} in this pool.
      The panel finds {percent(res.recallFormula)} of the true top {hirePercent}% by the formula ({percent(res.recallPool)} in this pool) and makes {plural(res.falseHires, 'false hire')} out of {res.hired}.
      It is worth {decimal(res.effective, 2)} independent interviewers.
    </>
  );
}

/** Scene 2: where the loop loses the people it was built to find. */
export function loopCaption(stages: readonly StageSpec[], results: readonly StageResult[]): ReactNode {
  const last = results[results.length - 1];
  const worst = results.reduce((w, r, i) => {
    const before = i === 0 ? 1 : results[i - 1].recall;
    return before - r.recall > w.drop ? { drop: before - r.recall, stage: i } : w;
  }, { drop: -1, stage: 0 });
  return (
    <>
      On a seeded pool of {FUNNEL_POOL.toLocaleString('en-US')}, {percent(last.share)} are hired and {percent(last.recall)} of the true top 10% are among them, at a mean true skill of {twoDp(last.meanSkill)}.
      The biggest loss of the true top group is at the {STAGE_NAMES[worst.stage].toLowerCase()}, where {percent(worst.drop)} of it goes.
      {stages.some((s) => s.noSignal) ? <> A stage with no signal ranks by noise alone.</> : null}
    </>
  );
}

/** Scene 3: the spread between interviewers, and one candidate's three draws. */
export function calibrateCaption(rows: readonly InterviewerRow[], spread: number, anchored: boolean): ReactNode {
  const lenient = rows.reduce((a, r) => (r.mean > a.mean ? r : a));
  const strict = rows.reduce((a, r) => (r.mean < a.mean ? r : a));
  return (
    <>
      {anchored ? 'With an anchored rubric (an input, a smaller leniency spread) ' : 'Without a rubric '}the {INTERVIEWERS} interviewers&apos; mean scores have a spread of {twoDp(spread)}: interviewer {lenient.index} averages {twoDp(lenient.mean)} and passes {percent(lenient.passed)}, interviewer {strict.index} averages {twoDp(strict.mean)} and passes {percent(strict.passed)}.
    </>
  );
}

/** Scene 4: where the story stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase().replace(/ \(.*\)$/, '').replace(/:.*$/, ''));
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Regret {w.meters[METER.regret]}, {plural(w.meters[METER.days], 'day')} to a decision, panel goodwill {w.meters[METER.goodwill]} (invented units).
      {red.length ? <> In the red: {joinList(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
