import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, decimal } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { layoutCaption } from './captions';
import { initialLayoutScene } from './init';
import { answerFrom, compare, neededFields, queryOf } from './layout';
import { PageGrids, PageLegend } from './PageGrids';
import { PAGE_OPTIONS, QUERY_OPTIONS } from './pageModel';
import { CELL_MAX, DEFAULT_TABLE, ROW_COUNT, withCell } from './table';

type EditColumn = 'qty' | 'price';
const EDIT_COLUMNS: { value: EditColumn; label: string }[] = [
  { value: 'qty', label: 'qty' },
  { value: 'price', label: 'price' },
];

const tone = (cheaper: string, side: 'row' | 'column') => (cheaper === 'tie' ? undefined : cheaper === side ? 'var(--ok)' : 'var(--bad)');

export function LayoutScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialLayoutScene);
  const [editCol, setEditCol] = useState<EditColumn>('price');
  const [editRow, setEditRow] = useState('7');
  const [editValue, setEditValue] = useState('50');
  const [note, setNote] = useState('');
  const { query, pageBytes, table } = state;

  const comparison = useMemo(() => compare(query, table, pageBytes), [query, table, pageBytes]);
  const need = useMemo(() => neededFields(query, table), [query, table]);
  const fromRows = answerFrom(comparison.row.layout, comparison.row.pages, query, table);
  const fromColumns = answerFrom(comparison.column.layout, comparison.column.pages, query, table);
  const same = JSON.stringify(fromRows) === JSON.stringify(fromColumns);

  useIntroCaption(layoutCaption(query, comparison), [query, table, pageBytes]);

  const apply = () => {
    const row = parseBoundedInt(editRow, { min: 1, max: ROW_COUNT, messages: { empty: 'Type a row number.', invalid: () => 'A row number is a whole number.', tooSmall: () => `Rows start at 1.`, tooBig: () => `The table has ${ROW_COUNT} rows.` } });
    const value = parseBoundedInt(editValue, { min: 0, max: CELL_MAX, messages: { empty: 'Type a value.', invalid: () => 'A value is a whole number.', tooSmall: () => 'Values start at 0.', tooBig: () => `Values go up to ${CELL_MAX}.` } });
    if (!row.ok) return setNote(row.error);
    if (!value.ok) return setNote(value.error);
    setState((s) => ({ ...s, table: withCell(s.table, row.value - 1, editCol, value.value) }));
    setNote(`Row ${row.value}: ${editCol} is now ${value.value}.`);
  };
  const reset = () => {
    setState((s) => ({ ...s, table: DEFAULT_TABLE }));
    setNote('Back to the original table.');
  };
  const answerText =
    fromRows === null ? 'a write returns no rows' : Array.isArray(fromRows) ? `row ${fromRows.join(', ')}` : query === 'avg-qty-nl' ? decimal(fromRows as number, 2) : String(fromRows);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Row store" value={bytes(comparison.row.bytes)} color={tone(comparison.cheaper, 'row')} sub={`${comparison.row.pages.length} of ${comparison.row.layout.pages.length} pages`} />
          <Stat label="Column store" value={bytes(comparison.column.bytes)} color={tone(comparison.cheaper, 'column')} sub={`${comparison.column.pages.length} of ${comparison.column.layout.pages.length} pages`} />
          <Stat label="Bytes touched" value={comparison.cheaper === 'tie' ? 'a tie' : `${decimal(comparison.ratio, 2)}×`} sub={comparison.cheaper === 'tie' ? 'same on both layouts' : `less in the ${comparison.cheaper} store`} />
        </Stats>
      }
      legend={<PageLegend />}
      controls={[
        <>
          {picker}
          <Segmented label="Query" value={query} onChange={(q) => setState((s) => ({ ...s, query: q }))} options={QUERY_OPTIONS} />
          <Segmented label="Page" value={pageBytes} onChange={(b) => setState((s) => ({ ...s, pageBytes: b }))} options={PAGE_OPTIONS} />
        </>,
        <>
          <Segmented label="Change a" value={editCol} onChange={setEditCol} options={EDIT_COLUMNS} />
          <TextField label="Row" value={editRow} onChange={setEditRow} onEnter={apply} width={56} spellCheck={false} />
          <TextField label="Value" value={editValue} onChange={setEditValue} onEnter={apply} width={84} spellCheck={false} />
          <Button onClick={apply}>Change</Button>
          <Button onClick={reset} softDisabled={table === DEFAULT_TABLE}>Reset the table</Button>
        </>,
      ]}
    >
      <div className="cs-stage stage-pad">
        <p className="cs-sql" aria-label="The query"><code>{queryOf(query).sql}</code></p>
        <PageGrids comparison={comparison} need={need} />
        <Box>
          <SectionTitle hint="read only from the pages each layout touched">What the query returns</SectionTitle>
          <p className="cs-answer">
            {answerText}{' '}
            {fromRows !== null && (
              <span className={same ? 'cs-same' : 'cs-wrong'}>{same ? 'the row store and the column store agree' : 'the two layouts disagree'}</span>
            )}
          </p>
        </Box>
        {note && <p className="cs-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="toy">fixed 4-byte fields, {pageBytes}-byte pages, and whole rows only: a row never straddles two pages</Provenance>
          <Provenance kind="illustrative">the point lookup and the UPDATE find row id 7 by position, as an index would, instead of scanning for it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
