import { useMemo } from 'react';
import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { WideRegion } from '../../components/WideRegion';
import { bestReplies, colsOf, pureEquilibria, rowsOf, strictlyDominated, type Cell, type Finder, type Game } from './model';

const CELL_PX = 84;
const FONT_PX = 15;
const MARK_R = 4;
const MARK_INSET = 9;
const MATRIX_MIN_WIDTH = 340;
const CROSS = ' ×';

/**
 * The payoff matrix: each cell reads "Row's payoff, Column's payoff". A blue dot in a cell's lower left is Row's best reply in that column,
 * a violet dot in its lower right is Column's best reply in that row; a cell with both is an equilibrium. A strictly dominated strategy is crossed out.
 */
export function PayoffMatrix({
  game, finder = 'correct', onCellClick, claimed,
}: {
  game: Game;
  finder?: Finder;
  onCellClick?: (r: number, c: number) => void;
  /** A cell the learner has claimed: ringed. */
  claimed?: Cell | null;
}) {
  const rows = rowsOf(game);
  const cols = colsOf(game);
  const equilibria = useMemo(() => pureEquilibria(game, finder), [game, finder]);
  const replies = useMemo(() => bestReplies(game), [game]);
  const dominated = useMemo(() => strictlyDominated(game), [game]);
  const isEq = (r: number, c: number) => equilibria.some(([er, ec]) => er === r && ec === c);
  const deadRow = (r: number) => dominated.some((d) => d.player === 'Row' && d.dominated === r);
  const deadCol = (c: number) => dominated.some((d) => d.player === 'Column' && d.dominated === c);
  const highlight: GridHighlight[] = claimed ? [{ r: claimed[0], c: claimed[1], tone: 'hi' }] : [];

  return (
    <WideRegion minWidth={MATRIX_MIN_WIDTH} label="The payoff matrix: scroll sideways to see all of it">
      <CellGrid
        rows={rows}
        cols={cols}
        size={{ cell: CELL_PX, font: FONT_PX }}
        rowLabels={game.rowNames.map((n, r) => (deadRow(r) ? `${n}${CROSS}` : n))}
        colLabels={game.colNames.map((n, c) => (deadCol(c) ? `${n}${CROSS}` : n))}
        cell={(r, c) => ({
          text: `${game.A[r][c]}, ${game.B[r][c]}`,
          tone: isEq(r, c) ? 'ok' : 'muted',
          fill: isEq(r, c) ? 'tint' : deadRow(r) || deadCol(c) ? 'none' : 'tint',
          intensity: isEq(r, c) ? 0.32 : 0.1,
        })}
        highlight={highlight}
        onCellClick={onCellClick}
        cellAriaLabel={(r, c) => `Row ${game.rowNames[r]}, Column ${game.colNames[c]}: Row gets ${game.A[r][c]}, Column gets ${game.B[r][c]}${isEq(r, c) ? ', an equilibrium' : ''}`}
        ariaLabel="Payoff matrix: Row picks a line, Column picks a column; each cell shows Row's payoff then Column's"
        overlay={({ at }) => (
          <g aria-hidden="true">
            {Array.from({ length: rows }, (_, r) =>
              Array.from({ length: cols }, (_, c) => {
                const p = at(r, c);
                return (
                  <g key={`${r}-${c}`}>
                    {replies.row[c].includes(r) && <circle cx={p.x + MARK_INSET} cy={p.y + CELL_PX - MARK_INSET} r={MARK_R} fill="var(--info)" />}
                    {replies.column[r].includes(c) && <circle cx={p.x + CELL_PX - MARK_INSET} cy={p.y + CELL_PX - MARK_INSET} r={MARK_R} fill="var(--violet)" />}
                  </g>
                );
              }),
            )}
          </g>
        )}
      />
    </WideRegion>
  );
}
