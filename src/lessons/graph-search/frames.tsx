import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import type { World } from './presets';
import { ALGO_NAMES, MUD_COST, type Algo, type Cell, type DsEntry, type Trace } from './search';

export interface GFrame extends Frame {
  step: number;
  current: number | null;
  frontier: number[];
  ds: DsEntry[];
  dsSize: number;
  showPath: boolean;
}

/** The milestone caption lands a third of the way in, but no later than this visit. */
const MILESTONE_BY = 14;
const SUMMARY_HOLD = 4;

const INTRO: Record<Algo, ReactNode> = {
  bfs: (
    <>
      <b>BFS</b> explores in rings: everything 1 step away, then 2, then 3… Next up always comes from the front of a{' '}
      <span className="hl info">queue</span>.
    </>
  ),
  dfs: (
    <>
      <b>DFS</b> picks a corridor and dives as deep as it can, backtracking only at dead ends. It runs on a{' '}
      <span className="hl info">stack</span>.
    </>
  ),
  dijkstra: (
    <>
      <b>Dijkstra</b> always expands the <i>cheapest</i> cell found so far, using a{' '}
      <span className="hl info">priority queue</span>. Mud costs {MUD_COST}.
    </>
  ),
  astar: (
    <>
      <b>A*</b> is Dijkstra plus a hunch: priority = <span className="hl">cost so far</span> +{' '}
      <span className="hl violet">distance left to the goal</span>.
    </>
  ),
};

const MILESTONE: Record<Algo, ReactNode> = {
  bfs: <>See the diamond? Every cell on the edge of the ripple is the <b>same number of steps</b> from the start.</>,
  dfs: <>See it snake? It commits to one direction and only backtracks when it hits a wall.</>,
  dijkstra: <>The wave spreads by <b>cost</b>, not steps. It slows to a crawl in mud and races around it.</>,
  astar: <>The search leans toward the goal. Cells that point the right way get explored first.</>,
};

const hasMud = (grid: Cell[], path: number[]) => path.some((c) => grid[c] === 2);

function summary(all: Record<Algo, Trace>, algo: Algo, grid: Cell[]): ReactNode {
  const t = all[algo];
  if (!t.path) {
    return (
      <>
        No path: the goal is walled off. {ALGO_NAMES[algo]} had to check all <b>{t.visits.length}</b> reachable cells to
        prove it.
      </>
    );
  }
  const steps = t.path.length - 1;
  const bfsSteps = all.bfs.path!.length - 1;
  switch (algo) {
    case 'bfs':
      return hasMud(grid, t.path) && t.cost > all.dijkstra.cost ? (
        <>
          Fewest steps: <span className="hl ok">{steps}</span>. But BFS can't see weights, so it plowed straight through mud:
          cost <span className="hl bad">{t.cost}</span> (cheapest is {all.dijkstra.cost}).
        </>
      ) : (
        <>
          Found in <b>{t.visits.length}</b> visits. On an unweighted grid BFS's path is <b>guaranteed</b> shortest:{' '}
          <span className="hl ok">{steps} steps</span>.
        </>
      );
    case 'dfs':
      return steps > bfsSteps ? (
        <>
          DFS found <i>a</i> path: <span className="hl bad">{steps} steps</span> when the shortest is {bfsSteps}. Cheap to
          write, zero shortest-path guarantee.
        </>
      ) : (
        <>
          DFS happened to find a shortest path ({steps} steps). That's luck, not a guarantee. Try the maze.
        </>
      );
    case 'dijkstra':
      return (
        <>
          Cheapest path: cost <span className="hl ok">{t.cost}</span>. Dijkstra never settles a cell until it knows its
          cheapest cost{all.bfs.cost > t.cost ? <>. BFS's path would cost {all.bfs.cost}</> : null}.
        </>
      );
    case 'astar':
      return (
        <>
          Same optimal cost (<span className="hl ok">{t.cost}</span>) but only <b>{t.visits.length}</b> cells visited vs.
          Dijkstra's {all.dijkstra.visits.length}. The heuristic points the way.
        </>
      );
  }
}

/** Intro frame, one frame per visited cell, then the path and a summary. */
export function buildFrames(all: Record<Algo, Trace>, algo: Algo, world: World): GFrame[] {
  const t = all[algo];
  const frames: GFrame[] = [
    {
      step: 0, current: null, frontier: [world.start], ds: [{ cell: world.start, pri: 0 }], dsSize: 1, showPath: false,
      say: INTRO[algo],
    },
  ];
  const milestoneAt = Math.min(MILESTONE_BY, Math.floor(t.visits.length / 3));
  t.visits.forEach((cell, k) => {
    frames.push({
      step: k + 1, current: cell, ...t.snaps[k], showPath: false,
      say: k === milestoneAt ? MILESTONE[algo] : undefined,
    });
  });
  const last = frames[frames.length - 1];
  frames.push({ ...last, current: null, showPath: true, say: summary(all, algo, world.grid), hold: SUMMARY_HOLD });
  return frames;
}
