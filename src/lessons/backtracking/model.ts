// Pure backtracking models: N-Queens (one queen per row) and all subsets by include/skip.
//
// Counting rule, used on screen: a "node visited" is one placement tried. Every queen put on the
// board counts 1, whether it survives or not; the empty board at the root isn't counted.

/** A queen's column in each row placed so far, row 0 first. */
export type Board = readonly number[];

export const MIN_N = 4;
export const MAX_N = 8;
/** The search tree is drawn only up to this n; above it only the counters run. */
export const MAX_DRAWN_N = 6;

/** Two queens attack each other when they share a column or a diagonal (rows always differ here). */
export const attacks = (r1: number, c1: number, r2: number, c2: number) => c1 === c2 || Math.abs(c1 - c2) === Math.abs(r1 - r2);

/** Rows of earlier queens that attack the newest queen (the last row of `board`). */
export function attackersOfLast(board: Board): number[] {
  const r = board.length - 1;
  const out: number[] = [];
  for (let i = 0; i < r; i++) if (attacks(i, board[i], r, board[r])) out.push(i);
  return out;
}

/** Every attacking pair of rows on a board. */
export function conflictPairs(board: Board): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < board.length; i++) for (let j = i + 1; j < board.length; j++) if (attacks(i, board[i], j, board[j])) out.push([i, j]);
  return out;
}

/** Squares (row, col) attacked by the queens on `board`, as "r,c" keys. */
export function attackedSquares(board: Board, n: number): Set<string> {
  const out = new Set<string>();
  board.forEach((qc, qr) => {
    for (let r = 0; r < n; r++) {
      if (r === qr) continue;
      for (const c of [qc, qc + (r - qr), qc - (r - qr)]) if (c >= 0 && c < n) out.add(`${r},${c}`);
    }
  });
  return out;
}

/** What a placement turned out to be. `open` = still possible, so the search goes a row deeper. */
export type Outcome = 'open' | 'dead' | 'solution';

/** One search-tree node. Ids are given out when a node's parent is expanded, all siblings at once. */
export interface SearchNode {
  id: number;
  parent: number | null;
  /** Row placed (queens) or element decided (subsets); -1 for the root. */
  depth: number;
  /** Column (queens), or 1 = include / 0 = skip (subsets). */
  choice: number;
}

export type SearchEvent =
  | { kind: 'expand'; node: number; children: number[] }
    /** `conflicts`: attacking row pairs that killed this node (empty unless dead). */
  | { kind: 'try'; node: number; board: number[]; outcome: Outcome; conflicts: [number, number][]; visited: number; solutions: number }
  | { kind: 'back'; node: number; board: number[]; visited: number; solutions: number };

export interface QueensRun {
  n: number;
  prune: boolean;
  nodes: SearchNode[];
  events: SearchEvent[];
  solutions: number[][];
  visited: number;
}

/**
 * Depth-first N-Queens, columns tried left to right.
 * - prune on ("check as you place"): a queen attacked by an earlier one is a dead node and is never expanded.
 * - prune off: queens go down without checks; only a full board is checked.
 * `record` keeps the event log (the frames need it; big counter-only runs don't).
 */
export function runQueens(n: number, prune: boolean, record = true): QueensRun {
  const nodes: SearchNode[] = [{ id: 0, parent: null, depth: -1, choice: -1 }];
  const events: SearchEvent[] = [];
  const solutions: number[][] = [];
  const board: number[] = [];
  let visited = 0;

  const expand = (parent: number) => {
    const children: number[] = [];
    if (record) {
      for (let c = 0; c < n; c++) {
        const id = nodes.length;
        nodes.push({ id, parent, depth: board.length, choice: c });
        children.push(id);
      }
      events.push({ kind: 'expand', node: parent, children });
    }
    for (let c = 0; c < n; c++) {
      const id = record ? children[c] : -1;
      board.push(c);
      visited++;
      const full = board.length === n;
      const conflicts: [number, number][] = prune
        ? attackersOfLast(board).map((r): [number, number] => [r, board.length - 1])
        : full ? conflictPairs(board) : [];
      const outcome: Outcome = conflicts.length ? 'dead' : full ? 'solution' : 'open';
      if (outcome === 'solution') solutions.push(board.slice());
      if (record) events.push({ kind: 'try', node: id, board: board.slice(), outcome, conflicts, visited, solutions: solutions.length });
      if (outcome === 'open') {
        expand(id);
        if (record) events.push({ kind: 'back', node: id, board: board.slice(), visited, solutions: solutions.length });
      }
      board.pop();
    }
  };
  expand(0);
  return { n, prune, nodes, events, solutions, visited };
}

/** Placements tried with no pruning: every row-by-row prefix, Σₖ₌₁ⁿ nᵏ. */
export function unprunedVisits(n: number): number {
  let total = 0;
  for (let k = 1, p = n; k <= n; k++, p *= n) total += p;
  return total;
}

/** Full boards with one queen per row, nⁿ. */
export const fullBoards = (n: number) => n ** n;

/**
 * Placements an unpruned search has tried when it reaches full board `b`, counting b itself.
 * Depth-first, columns in order: at each depth k it has tried every prefix up to b's own,
 * which is b's first k columns read as a base-n number, plus one.
 */
export function unprunedVisitsAt(b: Board, n: number): number {
  let total = 0;
  let value = 0;
  for (let k = 0; k < b.length; k++) {
    value = value * n + b[k];
    total += value + 1;
  }
  return total;
}

/** The solutions alone (pruned search), for the counter-only sizes. */
export const solveQueens = (n: number) => runQueens(n, true, false).solutions;

// ---------------------------------------------------------------- subsets

export const SUBSET_ITEMS = ['a', 'b', 'c', 'd'] as const;

export type SubsetEvent =
  | { kind: 'expand'; node: number; children: number[] }
  | { kind: 'enter'; node: number; chosen: string[]; visited: number; found: number }
  | { kind: 'output'; node: number; chosen: string[]; visited: number; found: number }
  | { kind: 'undo'; node: number; removed: string; chosen: string[]; visited: number; found: number };

export interface SubsetsRun {
  items: readonly string[];
  nodes: SearchNode[];
  events: SubsetEvent[];
  subsets: string[][];
  visited: number;
}

/** All subsets by the try / recurse / undo template: include the next item, recurse, take it back out, skip it, recurse. */
export function runSubsets(items: readonly string[] = SUBSET_ITEMS): SubsetsRun {
  const nodes: SearchNode[] = [{ id: 0, parent: null, depth: -1, choice: -1 }];
  const events: SubsetEvent[] = [];
  const subsets: string[][] = [];
  const chosen: string[] = [];
  let visited = 0;

  const visit = (node: number, i: number) => {
    if (i === items.length) {
      subsets.push(chosen.slice());
      events.push({ kind: 'output', node, chosen: chosen.slice(), visited, found: subsets.length });
      return;
    }
    const include = nodes.length;
    nodes.push({ id: include, parent: node, depth: i, choice: 1 }, { id: include + 1, parent: node, depth: i, choice: 0 });
    events.push({ kind: 'expand', node, children: [include, include + 1] });
    // try: include items[i]
    chosen.push(items[i]);
    visited++;
    events.push({ kind: 'enter', node: include, chosen: chosen.slice(), visited, found: subsets.length });
    visit(include, i + 1);
    // undo
    chosen.pop();
    events.push({ kind: 'undo', node: include, removed: items[i], chosen: chosen.slice(), visited, found: subsets.length });
    // skip items[i]
    visited++;
    events.push({ kind: 'enter', node: include + 1, chosen: chosen.slice(), visited, found: subsets.length });
    visit(include + 1, i + 1);
  };
  visit(0, 0);
  return { items, nodes, events, subsets, visited };
}

/** Root-to-node path of ids, root first. */
export function pathTo(nodes: readonly SearchNode[], id: number): number[] {
  const out: number[] = [];
  for (let x: number | null = id; x !== null; x = nodes[x].parent) out.unshift(x);
  return out;
}
