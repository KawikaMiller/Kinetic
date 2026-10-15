import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, SortTh } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { tradeoffCaption } from './captions';
import { TRADEOFF_COLUMNS, TRADEOFFS, type SortKey, type TradeoffRow } from './tradeoffs';

const TABLE_MIN_W = 640;
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'format', label: 'Format' },
  { key: 'size', label: 'Size' },
  { key: 'sortable', label: 'Sorts by time' },
  { key: 'leaks', label: 'Reveals creation time' },
  { key: 'coordination', label: 'Coordination' },
  { key: 'locality', label: 'New keys in an index' },
];
const HONEST = 'A summary of the designs as described in this lesson (UUIDv4 and v7 from RFC 9562, ULID and snowflake-style IDs as commonly built); real systems vary in the details.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'cheap side', shape: 'square' },
      { color: 'var(--bad)', label: 'costly side', shape: 'square' },
    ]}
  />
);

export function TradeoffScene({ picker }: { picker: ReactNode }) {
  const { sorted: rows, sort, headerProps } = useSortedRows<TradeoffRow, SortKey>(TRADEOFFS, TRADEOFF_COLUMNS, { key: 'coordination' });
  useIntroCaption(tradeoffCaption(sort.key, rows), [sort.key, sort.ascending]);

  return (
    <StageFrame height={420} legend={LEGEND} controls={[picker]}>
      <div className="stage-pad idg">
        <p className="idg-note">Press a column heading to sort by it, and again to reverse. Green is the cheap side of a trade, red the costly one.</p>
        <WideRegion minWidth={TABLE_MIN_W} label="Trade-offs table: scroll sideways to see all of it">
          <table className="data-table idg-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <SortTh key={c.key} {...headerProps(c.key)}>
                    {c.label}
                  </SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.format}</th>
                  <td style={{ color: r.size > 64 ? 'var(--bad)' : 'var(--ok)' }}>{r.size} bits</td>
                  <td style={{ color: r.sortable ? 'var(--ok)' : 'var(--bad)' }}>{r.sortable ? 'yes' : 'no'}</td>
                  <td style={{ color: r.leaks ? 'var(--bad)' : 'var(--ok)' }}>{r.leaks ? 'yes' : 'no'}</td>
                  <td style={{ color: r.coordinationRank === 0 ? 'var(--ok)' : 'var(--bad)' }}>{r.coordination}</td>
                  <td style={{ color: r.locality === 'appends' ? 'var(--ok)' : 'var(--bad)' }}>{r.locality === 'appends' ? 'append at the end' : 'scatter everywhere'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
