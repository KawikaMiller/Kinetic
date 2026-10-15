import { CellGrid } from '../../components/CellGrid';
import type { Mark } from './frames';
import type { Row, Side, Tables } from './join';
import { keyText } from './tables';

export interface Selected {
  side: Side;
  id: number;
}

const TITLE: Record<Side, string> = { a: 'customers (outer)', b: 'orders (inner)' };
const NAME: Record<Side, string> = { a: 'customer', b: 'order' };
const COLUMNS = ['id', 'key'];

function Grid({ side, rows, marks, selected, onSelect }: {
  side: Side;
  rows: readonly Row[];
  marks: readonly (Mark | null)[];
  selected: Selected | null;
  onSelect: (s: Selected) => void;
}) {
  const cursor = selected?.side === side ? rows.findIndex((r) => r.id === selected.id) : -1;
  return (
    <div className="ja-table">
      <div className="ja-table-title">{TITLE[side]}</div>
      {rows.length === 0 ? (
        <p className="ja-empty">no rows</p>
      ) : (
        <CellGrid
          rows={rows.length}
          cols={2}
          size="sm"
          colLabels={COLUMNS}
          cell={(r, c) => (c === 0 ? { text: rows[r].id, tone: 'muted', fill: 'none' } : rows[r].key === null ? { text: keyText(null), tone: 'dim', fill: 'outline' } : { text: rows[r].key, tone: 'sky', fill: 'tint' })}
          rowDecor={(r) => {
            const m = marks[r];
            return m ? { tone: m.tone, label: m.label } : null;
          }}
          onCellClick={(r, c) => c === 1 && onSelect({ side, id: rows[r].id })}
          cellAriaLabel={(r, c) => (c === 0 ? `${NAME[side]} ${rows[r].id}` : `${NAME[side]} ${rows[r].id}, key ${keyText(rows[r].key)}: edit this key`)}
          highlight={cursor >= 0 ? [{ r: cursor, c: 1, tone: 'sky' }] : []}
          ariaLabel={`${TITLE[side]}: ${rows.length} rows`}
        />
      )}
    </div>
  );
}

/** The two tables side by side, each row railed by what the running algorithm is doing to it. */
export function JoinGrids({ tables, aMark, bMark, selected, onSelect }: {
  tables: Tables;
  aMark: readonly (Mark | null)[];
  bMark: readonly (Mark | null)[];
  selected: Selected | null;
  onSelect: (s: Selected) => void;
}) {
  return (
    <div className="ja-grids">
      <Grid side="a" rows={tables.a} marks={aMark} selected={selected} onSelect={onSelect} />
      <Grid side="b" rows={tables.b} marks={bMark} selected={selected} onSelect={onSelect} />
    </div>
  );
}
