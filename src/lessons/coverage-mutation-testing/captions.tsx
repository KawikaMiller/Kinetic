import type { ReactNode } from 'react';
import { pct, plural } from '../../core/format';
import type { Coverage } from './coverage';
import type { Counts } from './cost';
import { CLASS_LABEL } from './mutants';
import { WEIGHT_MAX, WEIGHT_MIN } from './program';
import { disagreeingWithIntent, killingTest, type Analysis, type Report, type Suite, type Verdict } from './suite';

const ratio = (n: number, d: number) => (d === 0 ? 'n/a' : pct(n / d));
export const scorePct = (r: Report) => (r.score === null ? 'n/a' : pct(r.score));

/** Scene 1: the three numbers for one suite, said the way the mode earns. Every number is read off the coverage and the report. */
export function coverageCaption(suite: Suite, cov: Coverage, r: Report): ReactNode {
  const headline = (
    <>
      Line coverage <b>{ratio(cov.linesCovered, cov.lineCount)}</b>, branch coverage <b>{ratio(cov.branchesCovered, cov.branchCount)}</b>, mutation score <b>{scorePct(r)}</b>.
    </>
  );
  if (suite.cases.length === 0) return <>An empty suite runs nothing: no line is covered and nothing can be checked. Pick a preset or add a case.</>;
  if (!r.baselinePasses) {
    return (
      <>
        {headline} This suite already <b>fails on the unmutated code</b>, so mutation testing has nothing to compare against: fix the case first.
      </>
    );
  }
  if (suite.mode !== 'exact') {
    return (
      <>
        {headline} With this assertion no case can fail, so <b>{r.killed} of {r.total - r.equivalent}</b> mutants die: covered is not the same as checked.
      </>
    );
  }
  return (
    <>
      {headline} The suite kills <b>{r.killed} of {r.total - r.equivalent}</b> mutants that could be told apart from the code.
    </>
  );
}

/** What a suite built from approved output says about intent: how many of its expected values differ from what `cost` should return. */
export function intentNote(suite: Suite): string | null {
  const off = disagreeingWithIntent(suite);
  return off.length === 0 ? null : `${plural(off.length, 'expected value')} differ from what cost is meant to return`;
}

/** Scene 2: one mutant and what happened to it. */
export function mutantCaption(a: Analysis, index: number, v: Verdict, suite: Suite): ReactNode {
  const m = a.mutants[index];
  const change = (
    <>
      {m.id}, {CLASS_LABEL[m.cls]}: <code>{m.before}</code> becomes <code>{m.after}</code>.
    </>
  );
  if (v.status === 'equivalent') {
    return (
      <>
        {change} It is <b>equivalent over this domain</b>: weights {WEIGHT_MIN} to {WEIGHT_MAX} with both values of express never tell it from the original, so it is left out of the score.
      </>
    );
  }
  if (v.status === 'not-run') return <>{change} It is not run yet: the suite fails on the unmutated code.</>;
  if (v.status === 'killed') {
    const c = suite.cases[v.killedBy!];
    return (
      <>
        {change} <b>Killed</b> by case {v.killedBy! + 1}: weight {c.weight}, express {String(c.express)}.
      </>
    );
  }
  const t = killingTest(a, index);
  return (
    <>
      {change} <b>Survived</b>: no case failed on it. {t ? <>A test at weight {t.weight}, express {String(t.express)} expecting {t.expected} would kill it.</> : <>No input in the domain kills it.</>}
    </>
  );
}

/** Scene 3: the run counts. */
export function costCaption(all: Counts, picked: Counts, label: string): ReactNode {
  return (
    <>
      {all.mutants} mutants against {plural(all.tests, 'test')} is {all.naive} runs. Stopping each mutant at its first failing test takes <b>{all.stopAtKill}</b>, and running only tests that reach the mutated code takes <b>{all.coveringOnly}</b>.{' '}
      {label}: {picked.mutants} mutants, <b>{picked.coveringOnly}</b> runs with both savings.
    </>
  );
}
