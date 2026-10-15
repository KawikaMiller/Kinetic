import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { formatProbability, type Config } from './config';
import { DEFAULT_CASES, RANGES, repeatProbability, repeatWithin, type GenConfig } from './generator';
import { show } from './frames';
import type { Cell } from './matrix';
import { survivors } from './matrix';
import type { RunResult } from './runner';
import { BUGS, bugOf, propOf, type PropId } from './sorts';

const names = (ids: readonly PropId[]) => ids.map((id) => propOf(id).label).join(' and ');

/** Scene 1: before a run, after a failing case, or after 100 passes. Every value is read off the run. */
export function fireCaption(config: Config, run: RunResult | null): ReactNode {
  const fn = bugOf(config.fn).label;
  if (config.props.length === 0) return <>Tick at least one property: with none ticked there is nothing a case could fail.</>;
  if (run === null) {
    return (
      <>
        Ready: {DEFAULT_CASES} seeded cases of <b>{fn}</b> against {plural(config.props.length, 'property', 'properties')}, seed {config.seed}. Press Run to fire them.
      </>
    );
  }
  if (run.failure) {
    const f = run.failure;
    return (
      <>
        Case {f.k} <b>failed</b> {names(f.failed)}: input {show(f.input)} gave {show(f.output)}. The run stops at the first failure.
      </>
    );
  }
  return (
    <>
      All {run.cases.length} cases <b>passed</b>. That shows only that these {run.cases.length} inputs passed; it does not show that {fn} is correct.
    </>
  );
}

/** Scene 3: what a suite of properties catches, from the matrix that was really run. */
export function matrixCaption(matrix: readonly Cell[], suite: readonly PropId[]): ReactNode {
  if (suite.length === 0) return <>Tick properties to build a suite, then see which buggy versions survive it.</>;
  const bugs = BUGS.filter((b) => b.id !== 'correct');
  const alive = survivors(matrix, suite);
  const caught = bugs.length - alive.length;
  if (alive.length === 0) {
    return (
      <>
        Your suite of {suite.length} catches all {bugs.length} buggy versions within the cases run. Even so, no failure found would not prove the correct sort right.
      </>
    );
  }
  return (
    <>
      Your suite of {suite.length} catches <b>{caught} of {bugs.length}</b> buggy versions. <b>Survivors:</b> {alive.map((id) => bugOf(id).label).join('; ')}.
    </>
  );
}

/** Scene 4: the chance of a repeat from the formula, beside what the seeded run found. */
export function generatorCaption(config: GenConfig, firstFailure: number | null): ReactNode {
  const range = RANGES.find((r) => r.id === config.range)!.label;
  const length = config.fixedLength ?? config.maxLength;
  const per = formatProbability(repeatProbability(config));
  const within = formatProbability(repeatWithin(config, DEFAULT_CASES));
  return (
    <>
      Arrays of {plural(length, 'value')} from {range} repeat a value in <b>{per}</b> of cases, so {DEFAULT_CASES} cases have a <b>{within}</b> chance of containing one.{' '}
      {firstFailure === null ? <>The seeded run found no failure in {DEFAULT_CASES} cases.</> : <>The seeded run first failed at case {firstFailure}.</>}
    </>
  );
}
