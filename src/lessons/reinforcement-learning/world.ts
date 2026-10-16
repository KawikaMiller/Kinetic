/**
 * The grid world: 6 columns x 5 rows. A cell is empty, a wall, the goal (+1, ends the episode), a pit (-1, ends
 * it) or a cookie (+0.3, ends it). The start is the bottom-left cell and cannot be painted over. Every step costs
 * a little, and a slip sends the move sideways.
 */
export const COLS = 6;
export const ROWS = 5;
export const STATES = COLS * ROWS;
export const START: readonly [number, number] = [ROWS - 1, 0];
export const START_STATE = START[0] * COLS + START[1];

export type Cell = '.' | '#' | 'G' | 'P' | 'C';
export type Brush = 'wall' | 'goal' | 'pit' | 'cookie' | 'erase';
export const BRUSH_CELL: Record<Brush, Cell> = { wall: '#', goal: 'G', pit: 'P', cookie: 'C', erase: '.' };
export const BRUSHES: readonly Brush[] = ['wall', 'goal', 'pit', 'cookie', 'erase'];

/** Terminal rewards. The cookie's is small and near; the goal's is large and far. */
export const CELL_REWARD: Record<Cell, number> = { '.': 0, '#': 0, G: 1, P: -1, C: 0.3 };

export const SLIP_MAX = 0.3;
export const STEP_COST_MAX = 0.1;
/** The reward-edit preset pays this much each time the agent steps onto the bonus tile. */
export const BONUS_REWARD = 0.2;
export const BONUS_CELL: readonly [number, number] = [3, 0];
export const MAX_STEPS = 100;

export interface World {
  /** ROWS strings of COLS cells. */
  rows: readonly string[];
  /** Probability that a move slips: half to each perpendicular direction. */
  slip: number;
  /** Cost of every step, as a positive number. */
  stepCost: number;
  /** Reward for stepping onto BONUS_CELL (0 means none). */
  bonus: number;
}

/** Goal G top right behind a wall maze and a pit; cookie C two steps from the start (bottom-left). */
export const DEFAULT_ROWS: readonly string[] = ['.....G', '.##.#P', '......', '.#.##.', '..C...'];
export const DEFAULT_WORLD: World = { rows: DEFAULT_ROWS, slip: 0.1, stepCost: 0.04, bonus: 0 };

export const cellAt = (w: World, s: number): Cell => w.rows[Math.floor(s / COLS)][s % COLS] as Cell;
export const isWall = (w: World, s: number) => cellAt(w, s) === '#';
export const isTerminal = (w: World, s: number) => ['G', 'P', 'C'].includes(cellAt(w, s));
export const isLive = (w: World, s: number) => !isWall(w, s) && !isTerminal(w, s);
export const stateOf = (r: number, c: number) => r * COLS + c;
export const rowOf = (s: number) => Math.floor(s / COLS);
export const colOf = (s: number) => s % COLS;

export type PaintResult = { ok: true; world: World } | { ok: false; error: string };

/** Paint one cell. The start cell is refused (the old world stays). */
export function paint(w: World, r: number, c: number, brush: Brush): PaintResult {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return { ok: false, error: 'That cell is outside the grid.' };
  if (r === START[0] && c === START[1]) return { ok: false, error: 'The start cell is fixed: paint any other cell.' };
  const rows = w.rows.map((row, i) => (i === r ? row.slice(0, c) + BRUSH_CELL[brush] + row.slice(c + 1) : row));
  return { ok: true, world: { ...w, rows } };
}

/** Can the agent walk from the start to a goal, through non-wall cells, without stopping on a pit or cookie first? */
export function goalReachable(w: World): boolean {
  const seen = new Set<number>([START_STATE]);
  const queue = [START_STATE];
  while (queue.length) {
    const s = queue.shift()!;
    if (cellAt(w, s) === 'G') return true;
    if (isTerminal(w, s)) continue;
    for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      const r = rowOf(s) + dr;
      const c = colOf(s) + dc;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      const n = stateOf(r, c);
      if (!seen.has(n) && !isWall(w, n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return false;
}

export const hasGoal = (w: World): boolean => w.rows.some((row) => row.includes('G'));

/** The refusal for gamma 1 in a world with no step cost, or null: an endless loop is never worse, so the values do not converge. */
export const gammaRefusal = (gamma: number, stepCost: number): string | null =>
  gamma >= 1 && stepCost === 0 ? 'gamma 1 with no step cost is not allowed: an endless loop is never worse, so the values do not converge.' : null;

/** What is wrong with a world, in plain words, or null. */
export function worldWarning(w: World): string | null {
  if (!hasGoal(w)) return 'No goal: there is nothing to learn towards.';
  if (!goalReachable(w)) return 'Unreachable goal: the agent cannot learn it.';
  return null;
}
