import type { ReactNode } from 'react';
import { power } from '../../core/format';
import { STRIP_DIGITS, type Reading } from './cancellation';
import { dollars, MODES, type Granularity, type Mode, type TaxView } from './cart';
import { METHODS, type Evaluation, type MethodId, type Precision } from './summation';

const LABEL = Object.fromEntries(METHODS.map((m) => [m.id, m.label])) as Record<MethodId, string>;

/** A number as the table prints it: full JavaScript precision, with -0 and NaN visible. */
export const show = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));

/** An error as the table prints it. */
export const showError = (e: number): string => (e === 0 ? '0 (exact)' : e.toExponential(2));

/** The methods whose error is smallest, or an empty list when they tie at zero. */
export function bestMethods(ev: Evaluation): MethodId[] {
  const min = Math.min(...ev.runs.map((r) => r.error));
  return ev.runs.filter((r) => r.error === min).map((r) => r.id);
}

/** The caption under the summation scene. Every number comes from the evaluation. */
export function sumCaption(ev: Evaluation, precision: Precision, n: number): ReactNode {
  const naive = ev.runs.find((r) => r.id === 'naive')!;
  const kahan = ev.runs.find((r) => r.id === 'kahan')!;
  const best = bestMethods(ev);
  const tie = best.length === METHODS.length;
  return (
    <>
      Summing {n.toLocaleString('en-US')} {precision === 'f32' ? 'float32' : 'float64'} values, the exact sum is {show(ev.exact)}. The naive fold returns {show(naive.result)}, off by {showError(naive.error)}; Kahan returns {show(kahan.result)}, off by {showError(kahan.error)}.{' '}
      {tie ? 'Every method lands on the same error here.' : `The smallest error here is ${best.map((b) => LABEL[b]).join(' and ')}.`}
    </>
  );
}

/** The caption under the cancellation scene. */
export function cancelCaption(naiveLabel: string, k: number, r: Reading): ReactNode {
  return (
    <>
      At {power(k, 10)}, {naiveLabel} gives {show(r.naive.value)}, which has {r.naive.correct} of {STRIP_DIGITS} digits right against the 80-digit oracle. The rewrite gives {show(r.stable.value)} with {r.stable.correct} of {STRIP_DIGITS} right.
    </>
  );
}

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.id, m.label.toLowerCase()])) as Record<Mode, string>;

/** The caption under the cents scene. */
export function cartCaption(view: TaxView, mode: Mode, granularity: Granularity): ReactNode {
  const where = granularity === 'line' ? 'rounding each line' : 'rounding the total';
  const drift = view.drift === 0 ? 'exactly the exact answer' : `${Math.abs(view.drift)} cent${Math.abs(view.drift) === 1 ? '' : 's'} ${view.drift > 0 ? 'over' : 'under'} it`;
  return (
    <>
      Tax with {MODE_LABEL[mode]}, {where}: {view.representation === 'float' ? 'float64 dollars' : 'integer cents'} give ${dollars(view.tax)}, the exact rational answer is ${dollars(view.exact)}, so the result is {drift}.
    </>
  );
}
