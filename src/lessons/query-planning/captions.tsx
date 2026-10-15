import type { ReactNode } from 'react';
import { crossoverRows, indexScanCost, misestimate, planNodes, scanOf, seqScanCost, type Costs, type PlanResult } from './model';
import type { PlanSceneId } from './scenes';
import type { TableShape } from './table';
import { pctText, plural, ratioText, sig } from '../../core/format';

const cost = (x: number): string => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rows = (x: number): string => Math.round(x).toLocaleString('en-US');

/** The ratio sentence for one scan node: "estimated 25,000, actual 500: off by 50× (too high)". */
export function misestimateText(est: number, actual: number): ReactNode {
  const m = misestimate(est, actual);
  if (m.direction === 'exact') return <>estimated {rows(est)}, actual {rows(actual)}: <span className="hl ok">exact</span></>;
  return (
    <>
      estimated {rows(est)}, actual {rows(actual)}: off by <span className={`hl ${m.flagged ? 'bad' : ''}`}>{sig(m.ratio, 2)}×</span> ({m.direction === 'over' ? 'too high' : 'too low'})
    </>
  );
}

/** The caption of a plan scene: what the planner costed, what it chose, and what that cost. */
export function planCaption(scene: PlanSceneId, r: PlanResult, analyze: boolean, truth?: PlanResult): ReactNode {
  const chosen = r.candidates[r.chosen];
  const better = truth && truth.candidates[truth.chosen].id !== chosen.id ? truth.candidates[truth.chosen] : null;
  const chosenWithTruth = truth?.candidates[r.chosen];
  const dearest = r.candidates.reduce((a, b) => (b.total > a.total ? b : a));
  const scan = scanOf(chosen.root);
  const sort = planNodes(chosen.root).find((n) => n.kind === 'Sort');
  return (
    <>
      The planner costed {plural(r.candidates.length, 'candidate plan')} and chose <span className="hl ok">{chosen.label}</span> at cost {cost(chosen.total)}
      {r.candidates.length > 1 ? <>; the dearest costs {cost(dearest.total)}, {ratioText(dearest.total / chosen.total)}× as much</> : null}.{' '}
      {scene === 'sort' ? (sort ? <>The chosen plan still has a <span className="hl orange">Sort</span> node, costing {cost(sort.total - sort.child!.total)} itself.</> : <>The chosen plan has <span className="hl ok">no Sort</span>: the index returns the rows already in order.</>) : null}
      {scene === 'misestimate' || (analyze && scene === 'tree') ? <> The scan: {misestimateText(scan.estRows, scan.actualRows)}.</> : null}
      {better && chosenWithTruth ? <> Costed with the true row counts, <span className="hl bad">{better.label}</span> would cost {cost(better.total)} against {cost(chosenWithTruth.total)} for the plan it picked.</> : null}
      {truth && !better ? <> Costed with the true row counts the same plan wins.</> : null}
    </>
  );
}

/** The crossover scene: the two lines at the chosen row count, and where they cross. */
export function crossoverCaption(t: TableShape, costs: Costs, m: number): ReactNode {
  const seq = seqScanCost(t, costs);
  const index = indexScanCost(t, m, costs);
  const cross = crossoverRows(t, costs);
  return (
    <>
      Returning {rows(m)} rows ({pctText(m / t.rows, 2)} of the table): the seq scan costs {cost(seq)}, the index scan {cost(index)}, so the planner picks the{' '}
      <span className={`hl ${index <= seq ? 'ok' : 'bad'}`}>{index <= seq ? 'index' : 'seq scan'}</span>.{' '}
      {cross === null ? <>With random_page_cost {costs.randomPage} the index never costs more than the seq scan.</> : <>The lines cross at <span className="hl violet">{rows(cross)} rows</span> ({pctText(cross / t.rows, 2)} of the table) at random_page_cost {sig(costs.randomPage, 2)}.</>}
    </>
  );
}
