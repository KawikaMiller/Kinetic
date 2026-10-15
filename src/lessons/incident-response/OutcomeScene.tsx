import { useEffect, useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, SortTh } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { useSetCaption } from '../../core/caption';
import type { Walk } from '../../core/scenario';
import { outcomeCaption } from './captions';
import { ACTIONS, ACTION_SHORT, CAUSE_LABEL, CAUSES, DEGRADED_RATE, TRAFFIC, choiceIdsOf, outcomeRows, type Action, type Cause, type OutcomeRow } from './model';

/** The row for the first action the learner took in their own walk, if they have taken one. */
const firstActionOf = (walk: Walk): Action | null => (choiceIdsOf(walk).find((id) => (ACTIONS as readonly string[]).includes(id)) as Action | undefined) ?? null;

const fmt = (n: number) => n.toLocaleString('en-US');

export function OutcomeScene({ picker, cause, walk }: { picker: ReactNode; cause: Cause; walk: Walk }) {
  const setCaption = useSetCaption();
  const rows = useMemo(() => outcomeRows(), []);
  const mine = firstActionOf(walk);
  const { sorted, headerProps } = useSortedRows<OutcomeRow, 'cause' | 'first' | 'mitigated' | 'failed'>(
    rows,
    {
      cause: (r) => CAUSES.indexOf(r.cause),
      first: (r) => ACTIONS.indexOf(r.first),
      mitigated: (r) => r.mitigatedAt,
      failed: (r) => r.failed,
    },
    { key: 'failed' },
  );

  useEffect(() => {
    setCaption(outcomeCaption(rows, cause, mine), { quiet: true });
  }, [setCaption, rows, cause, mine]);

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'your own first move, on the cause you set', shape: 'square' },
            { color: 'var(--ok)', label: 'the fewest failed requests for that cause', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>]}
    >
      <div className="ir stage-pad">
        <Hint block>
          Every first action against every cause: the best way to carry on after it, over every path the story allows, with SEV2 and all four roles so that only the actions differ. Press a heading to sort. A row marked contained stops counting at the hand-off: its errors go on at {DEGRADED_RATE} per {TRAFFIC.toLocaleString('en-US')} until the dependency’s owner fixes it, so it does not compare minute for minute with a fixed row.
        </Hint>
        <div className="ir-table-wrap">
          <table className="data-table ir-table">
            <thead>
              <tr>
                <SortTh {...headerProps('cause')}>Hidden cause</SortTh>
                <SortTh {...headerProps('first')}>First action</SortTh>
                <SortTh {...headerProps('mitigated')}>Mitigated (min)</SortTh>
                <SortTh {...headerProps('failed')}>Failed requests</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const best = Math.min(...rows.filter((x) => x.cause === r.cause).map((x) => x.failed));
                const isMine = r.cause === cause && r.first === mine;
                return (
                  <tr key={`${r.cause}-${r.first}`} className={isMine ? 'is-mine' : ''}>
                    <th scope="row">{CAUSE_LABEL[r.cause]}</th>
                    <td>{ACTION_SHORT[r.first]}{isMine && <span className="ir-you"> (yours)</span>}</td>
                    <td>{r.mitigatedAt}</td>
                    <td className={r.failed === best ? 'ir-best' : ''}>{fmt(r.failed)}{r.ending === 'degraded' && <span className="ir-unit"> contained</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative">invented incident, computed from the same model as the story</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
