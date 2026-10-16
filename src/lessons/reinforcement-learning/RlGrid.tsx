import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { ARROW } from './mdp';
import type { StepRecord } from './qlearn';
import { BONUS_CELL, COLS, ROWS, START, START_STATE, cellAt, colOf, isLive, rowOf, stateOf, type World } from './world';

const SIZE = { cell: 40, gap: 3, font: 12 } as const;
/** Where an arrow moves to in a cell that already carries a label (S, +0.2), so the two do not overdraw each other. */
const CORNER = { dx: 12, dy: -12 } as const;

const isLabelled = (w: World, s: number): boolean => s === START_STATE || (w.bonus > 0 && s === stateOf(BONUS_CELL[0], BONUS_CELL[1]));

export interface GridView {
  world: World;
  /** One number per state: live cells are washed in green by how high theirs is among the live cells. */
  values?: readonly number[];
  /** One action per state, drawn as an arrow in live cells. */
  policy?: readonly number[];
  /** Per state: has the policy anything to go on? An arrow in a cell with no evidence yet is drawn grey, not violet. */
  decided?: readonly boolean[];
  /** The scale the green wash is drawn on (default: the live cells of `values`), so two grids can share one. */
  range?: { lo: number; hi: number };
  /** A latest episode, drawn as a path (random moves in orange). */
  path?: readonly StepRecord[];
}

function spec(view: GridView, r: number, c: number, range: { lo: number; hi: number }): GridCellSpec {
  const w = view.world;
  const s = stateOf(r, c);
  const cell = cellAt(w, s);
  if (cell === '#') return { tone: 'dim', fill: 'solid' };
  if (cell === 'G') return { tone: 'ok', fill: 'solid', text: '+1' };
  if (cell === 'P') return { tone: 'bad', fill: 'solid', text: '−1' };
  if (cell === 'C') return { tone: 'hi', fill: 'solid', text: '+0.3' };
  if (w.bonus > 0 && r === BONUS_CELL[0] && c === BONUS_CELL[1]) return { tone: 'amber', fill: 'outline', text: `+${w.bonus}` };
  if (view.values) {
    const rel = range.hi === range.lo ? 0.2 : (view.values[s] - range.lo) / (range.hi - range.lo);
    return { tone: 'ok', fill: 'tint', intensity: 0.05 + 0.5 * Math.min(1, Math.max(0, rel)), text: r === START[0] && c === START[1] ? 'S' : undefined };
  }
  return r === START[0] && c === START[1] ? { tone: 'info', fill: 'outline', text: 'S' } : { fill: 'none' };
}

export function RlGrid({ view, onCellClick, ariaLabel }: { view: GridView; onCellClick?: (r: number, c: number) => void; ariaLabel: string }) {
  const liveValues = view.values ? Array.from({ length: ROWS * COLS }, (_, s) => s).filter((s) => isLive(view.world, s)).map((s) => view.values![s]) : [];
  const range = view.range ?? { lo: Math.min(...liveValues), hi: Math.max(...liveValues) };
  return (
    <CellGrid
      rows={ROWS}
      cols={COLS}
      size={SIZE}
      rowLabels={Array.from({ length: ROWS }, (_, r) => r + 1)}
      colLabels={Array.from({ length: COLS }, (_, c) => c + 1)}
      cell={(r, c) => spec(view, r, c, range)}
      onCellClick={onCellClick}
      cellAriaLabel={(r, c) => {
        const cell = cellAt(view.world, stateOf(r, c));
        const name = { '.': 'empty', '#': 'wall', G: 'goal', P: 'pit', C: 'cookie' }[cell];
        return `Row ${r + 1}, column ${c + 1}: ${name}${r === START[0] && c === START[1] ? ', the start' : ''}`;
      }}
      overlay={({ center }) => (
        <>
          {view.path?.map((step, i) => {
            const a = center(rowOf(step.from), colOf(step.from));
            const b = center(rowOf(step.to), colOf(step.to));
            return step.from === step.to ? null : <line key={i} className={`rl-path ${step.explore ? 'is-explore' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {view.policy &&
            Array.from({ length: ROWS * COLS }, (_, s) => s)
              .filter((s) => isLive(view.world, s))
              .map((s) => {
                const p = center(rowOf(s), colOf(s));
                const corner = isLabelled(view.world, s);
                const undecided = view.decided !== undefined && !view.decided[s];
                return <text key={s} className={`rl-arrow ${corner ? 'is-corner' : ''} ${undecided ? 'is-undecided' : ''}`} x={p.x + (corner ? CORNER.dx : 0)} y={p.y + (corner ? CORNER.dy : 0)} textAnchor="middle" dominantBaseline="central">{ARROW[view.policy![s]]}</text>;
              })}
        </>
      )}
      ariaLabel={ariaLabel}
    />
  );
}
