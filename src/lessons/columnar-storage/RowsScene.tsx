import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, decimal, plural } from '../../core/format';
import { rowsCaption, winTally } from './captions';
import { initialRowsScene } from './init';
import { QUERIES, compare, neededFields, queryOf, type Comparison } from './layout';
import { PageGrids, PageLegend } from './PageGrids';
import { PAGE_OPTIONS, QUERY_OPTIONS } from './pageModel';
import { DEFAULT_TABLE } from './table';

const cellClass = (c: Comparison, side: 'row' | 'column') => (c.cheaper === 'tie' ? '' : c.cheaper === side ? 'cs-cheap' : 'cs-dear');

export function RowsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRowsScene);
  const { query, pageBytes } = state;

  const comparison = useMemo(() => compare(query, DEFAULT_TABLE, pageBytes), [query, pageBytes]);
  const need = useMemo(() => neededFields(query, DEFAULT_TABLE), [query]);
  const all = useMemo(() => QUERIES.map((q) => ({ q, c: compare(q.id, DEFAULT_TABLE, pageBytes) })), [pageBytes]);
  const tally = useMemo(() => winTally(DEFAULT_TABLE, pageBytes), [pageBytes]);

  useIntroCaption(rowsCaption(query, comparison, tally), [query, pageBytes]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Row store" value={bytes(comparison.row.bytes)} sub={plural(comparison.row.pages.length, 'page')} />
          <Stat label="Column store" value={bytes(comparison.column.bytes)} sub={plural(comparison.column.pages.length, 'page')} />
          <Stat label="Queries won" value={`${tally.row} : ${tally.column}`} sub={[`row store : column store`, plural(tally.tie, 'tie')]} />
        </Stats>
      }
      legend={<PageLegend />}
      controls={
        <>
          {picker}
          <Segmented label="Query" value={query} onChange={(q) => setState((s) => ({ ...s, query: q }))} options={QUERY_OPTIONS} />
          <Segmented label="Page" value={pageBytes} onChange={(b) => setState((s) => ({ ...s, pageBytes: b }))} options={PAGE_OPTIONS} />
        </>
      }
    >
      <div className="cs-stage stage-pad">
        <p className="cs-sql" aria-label="The query"><code>{queryOf(query).sql}</code></p>
        <PageGrids comparison={comparison} need={need} />
        <Box>
          <SectionTitle hint="every query on both layouts, one unit: bytes touched">Where each layout wins</SectionTitle>
          <div className="cs-scroll" role="region" aria-label="All five queries on both layouts" tabIndex={0}>
            <table className="data-table cs-table">
              <thead>
                <tr><th scope="col">Query</th><th scope="col">Row store</th><th scope="col">Column store</th><th scope="col">Cheaper</th></tr>
              </thead>
              <tbody>
                {all.map(({ q, c }) => (
                  <tr key={q.id} className={q.id === query ? 'cs-current' : ''}>
                    <th scope="row">{q.label}</th>
                    <td className={cellClass(c, 'row')}>{plural(c.row.pages.length, 'page')}, {bytes(c.row.bytes)}</td>
                    <td className={cellClass(c, 'column')}>{plural(c.column.pages.length, 'page')}, {bytes(c.column.bytes)}</td>
                    <td>{c.cheaper === 'tie' ? 'tie' : `${c.cheaper}, ${decimal(c.ratio, 2)}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cs-note">Row stores suit OLTP: many small reads and writes of whole rows. Column stores suit OLAP: scans of a few columns over many rows. The next lesson takes the system view.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">the table above is computed from the same two functions as the pages drawn: one layout builder per side, one unit (bytes touched)</Provenance>
          <Provenance kind="illustrative">an INSERT here appends one row; many column stores buffer writes before laying them out, so this is the plain cost, not a product's</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
