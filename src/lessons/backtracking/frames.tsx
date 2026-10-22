import type { ReactNode } from 'react';
import { joinList, superscript } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  MAX_DRAWN_N, pathTo, runQueens, runSubsets, SUBSET_ITEMS, unprunedVisits, unprunedVisitsAt,
  type Outcome, type SearchNode, type SubsetEvent,
} from './model';

/** Most search-tree nodes drawn: whole sibling groups only, so every drawn node gets tried. */
export const TREE_CAP = 61;
/** Most step frames per run; after that the run fast-forwards to its final counts. */
export const STEP_CAP = 320;

/** hidden = its parent hasn't been expanded yet; untried = created but not tried yet. */
export type NodeStatus = 'hidden' | 'untried' | 'path' | 'done' | 'dead' | 'solution';

export interface Square {
  r: number;
  c: number;
}

export interface BtFrame extends Frame {
  /** Queens placed, a column per row from row 0. */
  board: number[];
  /** The square being tried now. */
  tried: Square | null;
  /** The square a backtrack just lifted a queen from. */
  lifted: Square | null;
  /** Attacking row pairs on the board right now. */
  conflicts: [number, number][];
  outcome: Outcome | 'back' | null;
  /** Subsets: items included so far; the item index being decided. */
  chosen: string[];
  deciding: number | null;
  /** Current search-tree node, or null when it isn't one (the intro, the summary, a counters-only run). */
  cur: number | null;
  /** Status of each drawn tree node (index = node id). */
  status: NodeStatus[];
  visited: number;
  solutions: number;
  /** Subsets output so far. */
  found: string[][];
  /** The search has returned: the call stack is empty. */
  returned: boolean;
}

export interface Run {
  frames: BtFrame[];
  nodes: SearchNode[];
  /** Tree nodes drawn (0 when no tree is drawn). */
  drawn: number;
  /** Placements the whole run tries. */
  total: number;
  /** Step frames were cut at STEP_CAP. */
  capped: boolean;
}

export const rowName = (r: number) => `row ${r + 1}`;
export const colName = (c: number) => `column ${c + 1}`;
const fmt = (v: number) => v.toLocaleString('en-US');

/** Largest whole number of sibling groups of `size`, plus the root, that fits under TREE_CAP. */
export const drawnCount = (nodes: readonly SearchNode[], size: number) => Math.min(nodes.length, 1 + size * Math.floor((TREE_CAP - 1) / size));

const blank = (status: NodeStatus[]): Omit<BtFrame, 'say' | 'hold'> => ({
  board: [], tried: null, lifted: null, conflicts: [], outcome: null, chosen: [], deciding: null, cur: null, status, visited: 0, solutions: 0, found: [], returned: false,
});

/** Mark `node` current: nodes on its path become `path`, earlier path nodes that left it become `done`. */
function settle(status: NodeStatus[], nodes: readonly SearchNode[], node: number, own: NodeStatus): NodeStatus[] {
  const onPath = new Set(pathTo(nodes, node));
  return status.map((s, id) => {
    if (id === node) return own;
    if (onPath.has(id)) return 'path';
    return s === 'path' ? 'done' : s;
  });
}

function reveal(status: NodeStatus[], children: readonly number[]): NodeStatus[] {
  if (!children.some((id) => id < status.length)) return status;
  const next = status.slice();
  for (const id of children) if (id < next.length) next[id] = 'untried';
  return next;
}

/** "rows 1 and 3 share a diagonal" for one attacking pair. */
function pairText(board: readonly number[], [a, b]: [number, number]): string {
  const how = board[a] === board[b] ? 'share a column' : 'share a diagonal';
  return `Rows ${a + 1} and ${b + 1} ${how}`;
}

function tryCaption(prune: boolean, n: number, board: readonly number[], outcome: Outcome, conflicts: [number, number][], solutions: number): ReactNode {
  const r = board.length - 1;
  const c = board[r];
  const where = <>Row {r + 1}: try {colName(c)}.</>;
  if (prune) {
    if (outcome === 'open') return <>{where} No queen attacks it, so keep it and go down to {rowName(r + 1)}.</>;
    if (outcome === 'dead') {
      const by = conflicts.map(([a]) => a);
      const how = by.every((a) => board[a] === c) ? 'same column' : by.every((a) => board[a] !== c) ? 'diagonal' : 'column and diagonal';
      const who = by.length === 1 ? `The queen in row ${by[0] + 1} attacks` : `The queens in rows ${joinList(by.map((a) => String(a + 1)))} attack`;
      return <>{where} {who} it ({how}): dead branch. Lift it and never look below it.</>;
    }
    return <>{where} It's safe, and that's all {n} queens: solution {solutions}.</>;
  }
  if (outcome === 'open') return <>Row {r + 1}: put a queen in {colName(c)} without checking anything, and go down to {rowName(r + 1)}.</>;
  if (outcome === 'dead') {
    const more = conflicts.length - 1;
    return <>Row {r + 1}: {colName(c)} fills the board, so now check it. {pairText(board, conflicts[0])}{more > 0 ? ` (and ${more} more attacking pair${more === 1 ? '' : 's'})` : ''}: not a solution. Lift it.</>;
  }
  return <>Row {r + 1}: {colName(c)} fills the board, so now check it. No two queens attack: solution {solutions}.</>;
}

/** The closing line of a queens run, from its own counts and the other setting's. */
export function queensClosing(n: number, prune: boolean, solutions: number, visited: number): ReactNode {
  const unpruned = unprunedVisits(n);
  if (prune) {
    const skipped = unpruned - visited;
    return (
      <>
        Done: {solutions} solutions after <b>{fmt(visited)} placements tried</b>. Without pruning the same search tries {fmt(unpruned)}, so checking as you place
        skipped {fmt(skipped)} of them ({((skipped / unpruned) * 100).toFixed(1)}%).
      </>
    );
  }
  const pruned = runQueens(n, true, false).visited;
  return (
    <>
      Done: {solutions} solutions after <b>{fmt(visited)} placements tried</b>, every one-per-row prefix there is. Checking as you place finds the same{' '}
      {solutions} with {fmt(pruned)}, about {fmt(Math.round(visited / pruned))}× fewer.
    </>
  );
}

function backCaption(n: number, r: number, c: number): ReactNode {
  const next = c + 1 < n ? `next, ${colName(c + 1)} there` : `that was the last column in ${rowName(r)} too`;
  return <>Row {r + 2} has no columns left to try. Backtrack: lift the queen from {rowName(r)}, {colName(c)} ({next}).</>;
}

function queensIntro(n: number, prune: boolean): ReactNode {
  return (
    <>
      Put {n} queens on {n === 8 ? 'an' : 'a'} {n}×{n} board so no two attack. One queen per row: try each column in turn,{' '}
      {prune ? 'check each queen as you place it, and go back up as soon as one is attacked.' : 'and check only once the board is full.'}
    </>
  );
}

/** A step-by-step run with the tree, for n ≤ MAX_DRAWN_N. */
function drawnQueens(n: number, prune: boolean): Run {
  const run = runQueens(n, prune);
  const drawn = drawnCount(run.nodes, n);
  const initial: NodeStatus[] = new Array(drawn).fill('hidden');
  initial[0] = 'path';
  const rec = createRecorder<BtFrame>(blank(initial), { transient: { tried: null, lifted: null, outcome: null } });
  rec.snap(queensIntro(n, prune));
  let steps = 0;
  let capped = false;
  for (const e of run.events) {
    const s = rec.get();
    if (e.kind === 'expand') {
      rec.set({ status: reveal(s.status, e.children) });
      continue;
    }
    const inTree = e.node < drawn;
    if (e.kind === 'try') {
      const r = e.board.length - 1;
      const own: NodeStatus = e.outcome === 'open' ? 'path' : e.outcome;
      const patch = {
        board: e.outcome === 'open' ? e.board : e.board.slice(0, -1),
        conflicts: e.conflicts,
        visited: e.visited,
        solutions: e.solutions,
        cur: inTree ? e.node : null,
        status: inTree ? settle(s.status, run.nodes, e.node, own) : s.status,
      };
      if (steps < STEP_CAP) {
        // The tried queen shows on the board for this frame; dead and solved ones lift on the next.
        rec.snap(tryCaption(prune, n, e.board, e.outcome, e.conflicts, e.solutions), e.outcome === 'solution' ? 2 : undefined, {
          ...patch, board: e.board, tried: { r, c: e.board[r] }, outcome: e.outcome,
        });
        rec.set({ board: patch.board, conflicts: [] as [number, number][] });
        steps++;
      } else {
        capped = true;
        rec.set({ ...patch, conflicts: [] as [number, number][] });
      }
    } else {
      const r = e.board.length - 1;
      const parent = run.nodes[e.node].parent!;
      const patch = {
        board: e.board.slice(0, -1),
        conflicts: [] as [number, number][],
        cur: inTree ? parent : null,
        // The node just left was on the path, so settle() marks it done.
        status: inTree ? settle(s.status, run.nodes, parent, 'path') : s.status,
      };
      if (steps < STEP_CAP) {
        rec.snap(backCaption(n, r, e.board[r]), undefined,
          { ...patch, lifted: { r, c: e.board[r] }, outcome: 'back' },
        );
        steps++;
      } else {
        capped = true;
        rec.set(patch);
      }
    }
  }
  rec.set({ board: [], cur: null, returned: true, status: rec.get().status.map((x) => (x === 'path' ? 'done' : x)) });
  if (capped) {
    rec.snap(
      <>
        Fast-forward: this lesson shows the first {STEP_CAP} steps of a run, and the other {fmt(run.visited - stepVisited(rec.frames))} placements ran
        without frames. The counters and the drawn part of the tree are the real end state.
      </>,
    );
  }
  rec.close(queensClosing(n, prune, run.solutions.length, run.visited), 2);
  return { frames: rec.frames, nodes: run.nodes, drawn, total: run.visited, capped };
}

/** Placements counted by the last step frame before a fast-forward. */
const stepVisited = (frames: readonly BtFrame[]) => frames[frames.length - 1]?.visited ?? 0;

/**
 * n = 7 and 8: no tree, one frame per solution. Pruned counts come from the real run; the
 * unpruned search (19 million placements at n = 8) is counted by unprunedVisitsAt, which
 * the tests check against real unpruned runs.
 */
function counterQueens(n: number, prune: boolean): Run {
  const run = runQueens(n, true);
  const rec = createRecorder<BtFrame>(blank([]));
  rec.snap(
    <>
      {queensIntro(n, prune)} The tree isn't drawn at this size, only the counters
      {prune ? '' : <>; the unpruned counts come from a formula (each full board's place in the search order), not from running every step</>}. One frame per solution.
    </>,
  );
  let k = 0;
  for (const e of run.events) {
    if (e.kind !== 'try' || e.outcome !== 'solution') continue;
    k++;
    const visited = prune ? e.visited : unprunedVisitsAt(e.board, n);
    rec.snap(<>Solution {k} of {run.solutions.length}: columns {e.board.map((c) => c + 1).join(', ')} from row 1 down, found after {fmt(visited)} placements tried.</>, undefined, {
      board: e.board, visited, solutions: k, outcome: 'solution',
    });
  }
  const total = prune ? run.visited : unprunedVisits(n);
  rec.snap(queensClosing(n, prune, k, total), 2, { board: [], visited: total, outcome: null, returned: true });
  return { frames: rec.frames, nodes: [], drawn: 0, total, capped: false };
}

export function queensFrames(n: number, prune: boolean): Run {
  return n <= MAX_DRAWN_N ? drawnQueens(n, prune) : counterQueens(n, prune);
}

// ---------------------------------------------------------------- subsets

const setText = (xs: readonly string[]) => `{${xs.join(', ')}}`;

function subsetCaption(e: SubsetEvent, nodes: readonly SearchNode[], items: readonly string[], total: number): ReactNode {
  if (e.kind === 'output') {
    return <>All {items.length} items decided: output {setText(e.chosen)}. That's subset {e.found} of {total}.</>;
  }
  if (e.kind === 'undo') return <>Undo: take {e.removed} back out, so the skip branch starts from {setText(e.chosen)} again.</>;
  if (e.kind !== 'enter') return null;
  const node = nodes[e.node];
  const item = items[node.depth];
  const next = node.depth + 1 < items.length ? `Recurse to decide ${items[node.depth + 1]}.` : 'Recurse: nothing left to decide.';
  return node.choice === 1
    ? <>Try: include {item}, so the set is {setText(e.chosen)}. {next}</>
    : <>Skip {item}: the set stays {setText(e.chosen)}. {next}</>;
}

export function subsetFrames(items: readonly string[] = SUBSET_ITEMS): Run {
  const run = runSubsets(items);
  const total = 2 ** items.length;
  const initial: NodeStatus[] = new Array(run.nodes.length).fill('hidden');
  initial[0] = 'path';
  const rec = createRecorder<BtFrame>({ ...blank(initial), deciding: 0 });
  rec.snap(
    <>
      All subsets of {setText(items)}: for each item, try including it, recurse, undo, then skip it and recurse. Nothing is ever ruled out, so there's nothing to prune: all{' '}
      {total} answers are wanted.
    </>,
  );
  for (const e of run.events) {
    const s = rec.get();
    if (e.kind === 'expand') {
      rec.set({ status: reveal(s.status, e.children) });
      continue;
    }
    const node = run.nodes[e.node];
    const say = subsetCaption(e, run.nodes, items, total);
    if (e.kind === 'enter') {
      rec.snap(say, undefined, {
        chosen: e.chosen, visited: e.visited, cur: e.node, status: settle(s.status, run.nodes, e.node, 'path'), deciding: node.depth + 1 < items.length ? node.depth + 1 : null,
      });
    } else if (e.kind === 'output') {
      const found = [...s.found, e.chosen];
      rec.snap(say, undefined, { found, solutions: found.length, cur: e.node, status: settle(s.status, run.nodes, e.node, 'solution'), deciding: null });
    } else {
      rec.snap(say, undefined, { chosen: e.chosen, cur: node.parent, status: settle(s.status, run.nodes, node.parent!, 'path'), deciding: node.depth });
    }
  }
  rec.set({ cur: null, deciding: null, returned: true, status: rec.get().status.map((x) => (x === 'path' ? 'done' : x)) });
  rec.close(
    <>
      Done: {rec.get().found.length} subsets from {run.visited} include/skip decisions. 2 choices for each of {items.length} items is 2{superscript(items.length)} = {total}: when every leaf is an
      answer, backtracking can't skip anything.
    </>,
    2,
  );
  return { frames: rec.frames, nodes: run.nodes, drawn: run.nodes.length, total: run.visited, capped: false };
}

