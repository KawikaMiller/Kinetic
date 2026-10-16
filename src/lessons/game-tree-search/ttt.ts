// Tic-tac-toe as a search problem: a board is nine characters, X, O or '.', cell 0 at the top left. Values are from the
// side to move: +100 a win already forced on the board, -100 a loss, 0 a draw, anything between is the heuristic.

export type Mark = 'X' | 'O';

export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
];

export const EMPTY_BOARD = '.........';
export const WIN = 100;

export const other = (m: Mark): Mark => (m === 'X' ? 'O' : 'X');

export function winnerOf(board: string): Mark | null {
  for (const [a, b, c] of LINES) if (board[a] !== '.' && board[a] === board[b] && board[b] === board[c]) return board[a] as Mark;
  return null;
}

export const movesOf = (board: string): number[] => [...board].flatMap((c, i) => (c === '.' ? [i] : []));
export const isFull = (board: string): boolean => !board.includes('.');
export const play = (board: string, cell: number, mark: Mark): string => board.slice(0, cell) + mark + board.slice(cell + 1);
export const isOver = (board: string): boolean => winnerOf(board) !== null || isFull(board);

/** Whose turn it is when X always moves first: X when the marks are level, O when X is one ahead. */
export const sideToMove = (board: string): Mark => ([...board].filter((c) => c === 'X').length <= [...board].filter((c) => c === 'O').length ? 'X' : 'O');

/** Lines that the other side has not blocked: those that `mark` could still complete. */
export const openLines = (board: string, mark: Mark): number => LINES.filter((line) => line.every((i) => board[i] !== other(mark))).length;

/** The cut-off heuristic: open lines for the side to move minus open lines for the other side. */
export const evaluate = (board: string, mark: Mark): number => openLines(board, mark) - openLines(board, other(mark));

export interface Searched {
  /** The value of the position for the side to move. */
  value: number;
  /** The move chosen: the first cell whose value is the best. */
  move: number | null;
  nodes: number;
}

/** Negamax with an optional alpha-beta cut and an optional depth limit. Counts every position entered, the root included. */
function negamax(board: string, mark: Mark, alphaIn: number, betaIn: number, depth: number, prune: boolean, counter: { nodes: number }): number {
  counter.nodes++;
  if (winnerOf(board) !== null) return -WIN;
  if (isFull(board)) return 0;
  if (depth === 0) return evaluate(board, mark);
  let alpha = alphaIn;
  let best = -Infinity;
  for (const cell of movesOf(board)) {
    const v = -negamax(play(board, cell, mark), other(mark), -betaIn, -alpha, depth - 1, prune, counter);
    if (v > best) best = v;
    alpha = Math.max(alpha, best);
    if (prune && alpha >= betaIn) break;
  }
  return best;
}

export const FULL_DEPTH = 9;

/** Search the position for `mark`: plain minimax or alpha-beta, to `depth` plies. The best move is the first with the best value. */
export function searchBoard(board: string, mark: Mark, o: { prune: boolean; depth?: number }): Searched {
  const depth = o.depth ?? FULL_DEPTH;
  const counter = { nodes: 1 };
  if (isOver(board)) return { value: winnerOf(board) ? -WIN : 0, move: null, nodes: 1 };
  let alpha = -Infinity;
  let best = -Infinity;
  let move: number | null = null;
  let winsNow = false;
  for (const cell of movesOf(board)) {
    const next = play(board, cell, mark);
    const v = -negamax(next, other(mark), -Infinity, -alpha, depth - 1, o.prune, counter);
    const immediate = winnerOf(next) === mark;
    // A win on this move beats a win that is only forced later: the machine takes the point now.
    if (v > best || (immediate && !winsNow && v === best)) {
      best = v;
      move = cell;
      winsNow = immediate;
    }
    alpha = Math.max(alpha, best);
  }
  return { value: best + 0, move, nodes: counter.nodes };
}

/** The exact value of every legal move (each searched with a full window), from the mover's side: for showing candidate scores. */
export function moveScores(board: string, mark: Mark, depth: number = FULL_DEPTH): { cell: number; value: number }[] {
  return movesOf(board).map((cell) => {
    const counter = { nodes: 0 };
    return { cell, value: -negamax(play(board, cell, mark), other(mark), -Infinity, Infinity, depth - 1, true, counter) + 0 };
  });
}

/** The machine's move for `mark` in this position: a perfect (full-depth) alpha-beta choice, first best cell. */
export const machineMove = (board: string, mark: Mark): number | null => searchBoard(board, mark, { prune: true }).move;

/** The result of a finished board: the winner, or 'draw'. */
export const resultOf = (board: string): Mark | 'draw' | null => winnerOf(board) ?? (isFull(board) ? 'draw' : null);
