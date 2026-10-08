import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { rowCaption } from './frames';
import { COLUMNS, OWNER_LABEL, ROWS, type Row } from './spectrum';

const TABLE_MIN_W = 560;

export function SpectrumScene({ picker }: { picker: ReactNode }) {
  const [picked, setPicked] = useState<string | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>Four ways to run the same code. Click a row to see which columns put that job on you and which on the provider.</>);

  const pick = (row: Row) => {
    setPicked(row.id);
    setCaption(rowCaption(row));
  };

  return (
    <StageFrame
      height={360}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'you manage it' },
            { color: 'var(--violet)', label: 'split between you and the provider' },
            { color: 'var(--dim)', label: 'the provider manages it' },
            { color: 'var(--hi)', label: 'the row you picked' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="sc stage-pad">
        <WideRegion minWidth={TABLE_MIN_W} label="Compute spectrum table: scroll sideways to see all of it">
          <table className="data-table sc-table">
            <thead>
              <tr>
                <th>Who looks after…</th>
                {COLUMNS.map((c) => (
                  <th key={c.id} className="keep-case">
                    {c.title}
                    <span className="sc-example">{c.example}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.id} className={picked === row.id ? 'is-picked' : ''}>
                  <th scope="row" className="keep-case">
                    <button type="button" className="sc-row-btn" aria-pressed={picked === row.id} onClick={() => pick(row)}>
                      {row.title}
                    </button>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={COLUMNS[i].id} className={`sc-cell is-${cell.owner}`}>
                      <b>{OWNER_LABEL[cell.owner]}</b>
                      <span>{cell.note}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          A generalisation, not a rule: real services differ (some container platforms scale to zero, some function platforms run several requests per instance). "No servers" means
          you don't run them; you still choose memory, timeouts, limits and dependencies, and you still pay for what you provision.
        </Hint>
      </div>
    </StageFrame>
  );
}
