import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { Button } from '../../components/ui';
import type { Db, Key, Who } from './engine';
import { PAGE_ROWS, classifyAll, pageOf, pinnedVids, versionCell, type RowView } from './view';

const COLUMNS = ['key', 'value', 'xmin', 'xmax'];
const KEY_COLUMN = 0;
const VALUE_COLUMN = 1;
const XMAX_COLUMN = 3;

/**
 * The version table: one row per row VERSION, the rail beside each row showing what `who` can see. Clicking a key picks it
 * for the next UPDATE, DELETE or INSERT. A violet outline marks an xmax kept only because an open snapshot may still need
 * it, a yellow ring the version a write just created and the one it replaced.
 */
export function VersionTable({ db, who, back, onBack, onPick, rowOverride }: {
  db: Db;
  who: Who;
  /** Pages turned back from the newest. */
  back: number;
  onBack: (back: number) => void;
  onPick?: (key: Key) => void;
  /** Replaces the computed rail of a version (the broken-VACUUM replay marks what the broken horizon would delete). */
  rowOverride?: (vid: number) => RowView | null;
}) {
  const { from, to, pages } = pageOf(db.versions.length, back);
  const shown = db.versions.slice(from, to);
  const views = classifyAll(db, who).slice(from, to);
  const pinned = pinnedVids(db);
  const highlight: GridHighlight[] = shown.flatMap((v, r): GridHighlight[] => [
    ...(pinned.has(v.vid) ? [{ r, c: XMAX_COLUMN, tone: 'violet' as const }] : []),
    ...(db.touched.includes(v.vid) ? [{ r, c: v.xmax !== null ? XMAX_COLUMN : VALUE_COLUMN, tone: 'hi' as const }] : []),
  ]);
  return (
    <div className="mv-table">
      <CellGrid
        rows={shown.length}
        cols={COLUMNS.length}
        size="md"
        colLabels={COLUMNS}
        rowLabels={shown.map((v) => `v${v.vid}`)}
        cell={(r, c) => {
          const cellText = versionCell(shown[r]);
          const text = [cellText.key, cellText.value, cellText.xmin, cellText.xmax][c];
          return c === KEY_COLUMN ? { text, tone: 'muted', fill: 'none' } : { text, tone: c === VALUE_COLUMN ? 'sky' : 'muted', fill: c === VALUE_COLUMN ? 'tint' : 'outline' };
        }}
        rowDecor={(r) => {
          const view = rowOverride?.(shown[r].vid) ?? views[r];
          return { tone: view.tone, label: view.label };
        }}
        highlight={highlight}
        onCellClick={onPick ? (r, c) => c === KEY_COLUMN && onPick(shown[r].key) : undefined}
        cellAriaLabel={(r, c) => `Version ${shown[r].vid}, ${COLUMNS[c]} ${[shown[r].key, shown[r].value, `x${shown[r].xmin}`, shown[r].xmax === null ? 'none' : `x${shown[r].xmax}`][c]}${c === KEY_COLUMN ? ': pick this key' : ''}`}
        ariaLabel={`Row versions ${from + 1} to ${to} of ${db.versions.length}`}
      />
      {pages > 1 && (
        <div className="mv-pager">
          <Button onClick={() => onBack(Math.min(pages - 1, back + 1))} disabled={back >= pages - 1}>Older</Button>
          <span>versions {from + 1} to {to} of {db.versions.length} ({PAGE_ROWS} at a time)</span>
          <Button onClick={() => onBack(Math.max(0, back - 1))} disabled={back === 0}>Newer</Button>
        </div>
      )}
    </div>
  );
}
