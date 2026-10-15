import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, SortTh, Stat, Stats, Toggle } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { useIntroCaption } from '../../core/caption';
import { ratioText } from '../../core/format';
import { JoinGrids } from './JoinGrids';
import { SHORT_LABEL, UNIT_SENTENCE, cheapestAndDearest, costTable, withVerdicts, type Cond, type VerdictRow } from './join';
import { TableControls } from './TableControls';
import type { TableState } from './useTableState';
import { costCaption } from './captions';

type Key = 'label' | 'cost' | 'times';

const CONDITIONS = [{ value: 'eq' as Cond, label: 'a.key = b.key' }, { value: 'lt' as Cond, label: 'a.key < b.key' }];
const NO_MARKS: never[] = [];

export function CostScene({ state, picker }: { state: TableState; picker: ReactNode }) {
  const [cond, setCond] = useState<Cond>('eq');
  const rows = withVerdicts(costTable(state.tables, cond));
  const { sorted, headerProps } = useSortedRows<VerdictRow, Key>(rows, { label: (r) => r.label, cost: (r) => r.cost ?? Infinity, times: (r) => r.times ?? Infinity }, { key: 'cost' });
  const { cheapest } = cheapestAndDearest(rows);
  const best = rows.find((r) => r.id === cheapest[0])!;

  useIntroCaption(costCaption(rows, state.tables, cond), [state.tables, cond]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Cheapest" value={SHORT_LABEL[best.id]} color="var(--ok)" sub={`${best.cost} units`} />
          <Stat label="Customers × orders" value={`${state.tables.a.length} × ${state.tables.b.length}`} sub={cond === 'eq' ? 'equality join' : 'non-equality join'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'cheapest' }, { color: 'var(--bad)', label: 'dearest' }, { color: 'var(--dim)', label: 'cannot run this join' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Join condition" value={cond === 'lt'} onChange={(lt) => setCond(lt ? 'lt' : 'eq')} off={CONDITIONS[0].label} on={CONDITIONS[1].label} />
        </>,
        <><TableControls state={state} /></>,
      ]}
    >
      <div className="ja-stage stage-pad">
        <div className="ja-table-wrap" tabIndex={0} role="region" aria-label="Cost of each join algorithm, sortable by column">
          <table className="data-table ja-cost">
            <thead>
              <tr>
                <SortTh {...headerProps('label')}>Algorithm</SortTh>
                <SortTh {...headerProps('cost')}>Cost (units)</SortTh>
                <SortTh {...headerProps('times')}>vs cheapest</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className={`is-${r.verdict}`}>
                  <td>{r.label}</td>
                  <td>{r.cost ?? 'cannot run'}</td>
                  <td>{r.refused ?? `${ratioText(r.times!)}×`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ja-note">One unit, applied to every row: {UNIT_SENTENCE}. A node visit is counted as one unit, a toy simplification. Spilling is not in it, so the memory limit does not feed this table. SQLite, which this lesson&apos;s tests check the join&apos;s rows against, joins by nested loops and builds an automatic index when that helps (its EXPLAIN QUERY PLAN shows it); it has no hash or merge join.</p>
        <JoinGrids tables={state.tables} aMark={NO_MARKS} bMark={NO_MARKS} selected={state.selected} onSelect={state.select} />
        <ProvenanceRow>
          <Provenance kind="toy">counts in one unit (comparisons, hash operations, sort comparisons and index node visits, each one) on small teaching tables, not seconds</Provenance>
          <Provenance kind="not-run">which algorithm PostgreSQL&apos;s planner would pick for these tables is shown by no run here: it weighs more than this unit</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
