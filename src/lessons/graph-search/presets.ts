import { COLS, N, ROWS, idx, runSearch, type Cell } from './search';

export interface World {
  grid: Cell[];
  start: number;
  goal: number;
}

const blank = (): Cell[] => new Array<Cell>(N).fill(0);
const rand = (n: number) => Math.floor(Math.random() * n);

function empty(): World {
  return { grid: blank(), start: idx(3, 7), goal: idx(20, 6) };
}

function randomWalls(): World {
  // Re-roll a few times so the default board usually has a route through.
  for (let attempt = 0; ; attempt++) {
    const w = empty();
    w.grid = w.grid.map(() => (Math.random() < 0.26 ? 1 : 0));
    w.grid[w.start] = 0;
    w.grid[w.goal] = 0;
    if (attempt >= 8 || runSearch(w.grid, w.start, w.goal, 'bfs').path) return w;
  }
}

/** Randomised depth-first maze on odd coordinates, then a few walls knocked out so there are loops. */
function maze(): World {
  const grid: Cell[] = new Array<Cell>(N).fill(1);
  const inside = (x: number, y: number) => x >= 1 && x <= COLS - 1 && y >= 1 && y <= ROWS - 1;
  const stack: [number, number][] = [[1, 1]];
  grid[idx(1, 1)] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const)
      .map(([dx, dy]) => [x + dx, y + dy, x + dx / 2, y + dy / 2] as const)
      .filter(([nx, ny]) => inside(nx, ny) && grid[idx(nx, ny)] === 1);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, wx, wy] = options[rand(options.length)];
    grid[idx(wx, wy)] = 0;
    grid[idx(nx, ny)] = 0;
    stack.push([nx, ny]);
  }
  // Loops make BFS and DFS disagree, which is the whole point.
  for (let k = 0; k < 40; k++) {
    const x = 1 + rand(COLS - 2);
    const y = 1 + rand(ROWS - 2);
    const i = idx(x, y);
    if (grid[i] !== 1) continue;
    const horiz = grid[idx(x - 1, y)] === 0 && grid[idx(x + 1, y)] === 0;
    const vert = grid[idx(x, y - 1)] === 0 && grid[idx(x, y + 1)] === 0;
    if (horiz !== vert) grid[i] = 0;
  }
  return { grid, start: idx(1, 1), goal: idx(21, 11) };
}

/** A mud swamp sits right between start and goal, with a dry detour along the bottom. */
function mudField(): World {
  const grid = blank();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const inBand = x >= 9 && x <= 14 && y <= 10;
      if (inBand || Math.random() < 0.07) grid[idx(x, y)] = 2;
    }
  }
  const w = { grid, start: idx(3, 6), goal: idx(20, 6) };
  grid[w.start] = 0;
  grid[w.goal] = 0;
  return w;
}

export type PresetId = 'empty' | 'walls' | 'maze' | 'mud';
export const PRESETS: Record<PresetId, { label: string; make: () => World }> = {
  empty: { label: 'Empty', make: empty },
  walls: { label: 'Random walls', make: randomWalls },
  maze: { label: 'Maze', make: maze },
  mud: { label: 'Mud field', make: mudField },
};
