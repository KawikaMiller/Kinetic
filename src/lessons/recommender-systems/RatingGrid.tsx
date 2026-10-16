import { CellGrid } from '../../components/CellGrid';
import { WideRegion } from '../../components/WideRegion';
import { cellSpec, type Mode } from './cells';
import { FILM_TITLES, ITEMS } from './data';
import { NEW_USER, TOTAL_USERS, type Problem } from './problem';

const GRID_MIN_WIDTH = 480;
const CELL = { cell: 24, gap: 2, font: 10 } as const;

export function RatingGrid({ problem, mode, showTruth, onCellClick, ariaLabel }: {
  problem: Problem;
  mode: Mode;
  showTruth: boolean;
  onCellClick?: (user: number, item: number) => void;
  ariaLabel: string;
}) {
  return (
    <WideRegion minWidth={GRID_MIN_WIDTH} label="Ratings matrix: scroll sideways to see all of it">
      <CellGrid
        rows={TOTAL_USERS}
        cols={ITEMS}
        size={CELL}
        rowLabels={Array.from({ length: TOTAL_USERS }, (_, u) => (u === NEW_USER ? 'new' : `U${u + 1}`))}
        colLabels={Array.from({ length: ITEMS }, (_, i) => `F${i + 1}`)}
        cell={(u, i) => cellSpec(problem, mode, showTruth, u, i)}
        onCellClick={onCellClick}
        cellAriaLabel={(u, i) => {
          const who = u === NEW_USER ? 'The new user' : `User ${u + 1}`;
          const seen = problem.seen(u, i);
          const state = seen !== null ? `rated ${seen}` : mode.kind === 'predictions' ? `predicted ${mode.run.predict(u, i).toFixed(1)}` : 'not rated';
          return `${who}, ${FILM_TITLES[i]}, ${state}`;
        }}
        cellTitle={(u, i) => `${u === NEW_USER ? 'New user' : `User ${u + 1}`}: ${FILM_TITLES[i]}`}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
