import type { Snapshot } from '../../core/distSim';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { CONSUMERS, MAX_KEY, totalOf, type CdcState } from './cdc';
import { consOf, consumerCell, consumerName, dbOf, inSync, sourceCell } from './view';

const KEYS = Array.from({ length: MAX_KEY }, (_, i) => i + 1);
const COLS = ['st', 'amt'];
const CELL = { cell: 26 };

/** The source table and one grid per consumer, each with a sync badge: green in sync, yellow behind. */
export function TableGrids({ snap }: { snap: Snapshot<CdcState> }) {
  const src = dbOf(snap).rows;
  return (
    <div className="cdc-grids">
      <Box className="cdc-grid">
        <SectionTitle hint={`total ${totalOf(src)}`}>Source table</SectionTitle>
        <CellGrid rows={MAX_KEY} cols={2} size={CELL} rowLabels={KEYS} colLabels={COLS} cell={(r, c) => sourceCell(src, r + 1, c)} ariaLabel="The orders table: status and amount for each row id" />
      </Box>
      {CONSUMERS.map((id) => {
        const ok = inSync(snap, id);
        const c = consOf(snap, id);
        return (
          <Box key={id} className="cdc-grid">
            <SectionTitle hint={<span className={ok ? 'cdc-ok' : 'cdc-behind'}>{ok ? 'in sync' : 'behind'}</span>}>{consumerName(id)}</SectionTitle>
            <CellGrid rows={MAX_KEY} cols={2} size={CELL} rowLabels={KEYS} colLabels={COLS} cell={(r, col) => consumerCell(snap, id, r + 1, col)} ariaLabel={`${consumerName(id)}: status and amount for each row id`} />
            <span className="cdc-total">total {c.counter}{c.schema > 0 ? `, schema from LSN ${c.schema}` : ''}</span>
          </Box>
        );
      })}
    </div>
  );
}
