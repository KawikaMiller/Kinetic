import { CellGrid } from '../components/CellGrid';
import type { RowDecor, RowDecorFn } from '../components/cellGridLayout';
import { SectionTitle } from '../components/Panel';
import type { GridCellSpec } from '../components/cellGridPaint';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 2 to 3, agent F (#/dev/kit). */

const VERSIONS = [
  ['k1', 'a', 1, 4],
  ['k1', 'b', 4, '-'],
  ['k2', 'x', 2, '-'],
  ['k3', 'y', 6, 7],
] as const;
const VERSION_COLS = 4;
const versionCell = (r: number, c: number): GridCellSpec => ({ text: VERSIONS[r][c], fill: 'outline' });
const VERSION_ROWS: readonly RowDecor[] = [
  { tone: 'dim', label: 'after snapshot' },
  { tone: 'ok', label: 'visible' },
  { tone: 'ok', label: 'visible' },
  { tone: 'bad', label: 'dead' },
];
const VERSION_DECOR: RowDecorFn = (r) => VERSION_ROWS[r];
const BAND_DECOR: RowDecorFn = (r) => (r % 2 === 0 ? { tone: 'info', style: 'band' } : null);

const BIG_ROWS = 24;
const BIG_COLS = 20;
const bigDecor: RowDecorFn = (r) => (r % 6 === 0 ? { tone: 'violet', style: 'rail', label: `row ${r}` } : null);

export function DevKitTier3f() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 2 to 3 round, agent F</SectionTitle>
      <Section title="CellGrid rowDecor · a rail and a label per row (rail left of the cells, label after): visible, not yet visible, dead">
        <CellGrid rows={VERSIONS.length} cols={VERSION_COLS} cell={versionCell} colLabels={['key', 'value', 'xmin', 'xmax']} rowLabels={['v1', 'v2', 'v3', 'v4']} size="md" rowDecor={VERSION_DECOR} ariaLabel="Version table with row rails" />
      </Section>
      <Section title="CellGrid rowDecor · bands behind every other row, no label; the cells keep their own tones">
        <CellGrid rows={6} cols={8} cell={(r, c) => ({ tone: c === r ? 'hi' : undefined, fill: 'outline' })} size="md" rowDecor={BAND_DECOR} ariaLabel="Banded rows" />
      </Section>
      <Section title="CellGrid rowDecor in canvas mode (480 cells): rails and labels are the same SVG, the cells are painted">
        <CellGrid rows={BIG_ROWS} cols={BIG_COLS} cell={(r, c) => ({ tone: (r + c) % 5 === 0 ? 'info' : undefined })} size="xs" rowDecor={bigDecor} ariaLabel="Large grid with row rails" />
      </Section>
    </>
  );
}
