import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  dijkstraVisited, dijkstraWrong, bellmanFord, settledAfter, type BfRun, type Cell, type FwRun, type Graph,
} from './model';
import { cycleText, distText, edgeText, marketLoopText, nodeList, sumText } from './text';

// ---- Bellman-Ford ------------------------------------------------------------------------

export interface BfFrame extends Frame {
  dist: number[];
  /** The round being run (0 before the first, n for the check round). */
  round: number;
  /** The edge being tested. */
  edge: number | null;
  /** Distances changed by the round the caption speaks of: the running count while it runs, its total once it is done (0 in a quiet check round), the edges that still lower in a failing check. */
  changes: number;
  /** Edges that lowered a distance this round so far. */
  lowered: number[];
  /** Changes per finished round. */
  roundChanges: number[];
  /** Edge tests made so far. */
  tests: number;
  /** The check round is showing: these edges still lower a distance. */
  checkEdges: number[];
  /** The negative cycle, once found (edge indices). */
  cycle: number[];
  /** Nodes with no shortest path, once known. */
  noPath: number[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The round-by-round walk. One frame per edge test, one per finished round, then the check round when it runs. */
export function bfFrames(g: Graph, run: BfRun): BfFrame[] {
  const n = g.names.length;
  const m = g.edges.length;
  const d0 = Array<number>(n).fill(Infinity);
  d0[run.source] = 0;
  const rec = createRecorder<BfFrame>(
    { dist: d0, round: 0, edge: null, changes: 0, lowered: [], roundChanges: [], tests: 0, checkEdges: [], cycle: [], noPath: [] },
    { transient: { edge: null } },
  );
  const name = (v: number) => g.names[v];
  rec.snap(
    <>
      Bellman-Ford from {name(run.source)}. A round tests every one of the {m} edges once, in the order listed, and lowers a distance whenever going through that edge is shorter. Only {name(run.source)} is
      reached so far, at 0.
    </>,
  );
  const perRound = new Map<number, typeof run.tests>();
  for (const t of run.tests) perRound.set(t.round, [...(perRound.get(t.round) ?? []), t]);
  const dist = [...d0];
  let tests = 0;
  for (const [round, list] of perRound) {
    let lowered: number[] = [];
    for (const t of list) {
      const e = g.edges[t.edge];
      tests++;
      if (t.lowered) {
        dist[e.to] = t.after;
        lowered = [...lowered, t.edge];
      }
      const from = dist[e.from];
      const reached = t.lowered ? true : from !== Infinity;
      rec.snap(
        t.lowered ? (
          <>
            Round {round}, {edgeText(g, t.edge)}: {name(e.from)} is at {distText(g, from)}, so {name(e.to)} is reachable at {sumText(g, from + e.w)}, below {distText(g, t.before)}. <span className="hl ok">{name(e.to)} drops to{' '}
            {distText(g, t.after)}.</span>
          </>
        ) : reached ? (
          <>
            Round {round}, {edgeText(g, t.edge)}: {name(e.from)} is at {distText(g, from)}, so {name(e.to)} would be {sumText(g, from + e.w)}, which is not below {distText(g, t.before)}. No change.
          </>
        ) : (
          <>
            Round {round}, {edgeText(g, t.edge)}: {name(e.from)} has not been reached yet, so this edge has nothing to offer.
          </>
        ),
        undefined,
        { dist: [...dist], round, edge: t.edge, changes: lowered.length, lowered, tests },
      );
    }
    const changes = list.filter((t) => t.lowered).length;
    const finished = [...rec.get().roundChanges, changes];
    const settled = settledAfter(run, round);
    const reachable = run.dist.filter((x) => x !== Infinity).length;
    rec.snap(
      <>
        Round {round} done: {plural(changes, 'distance')} changed.{' '}
        {changes === 0
          ? 'A round that changes nothing means no further round can, so the run stops here.'
          : run.cycle
            ? `${plural(settled.length, 'node')} of ${n} already hold the value they will end with, but with a negative cycle nothing is final yet.`
            : `After ${plural(round, 'round')} every node whose shortest path has at most ${round} ${round === 1 ? 'edge' : 'edges'} is final: ${settled.length} of the ${reachable} reachable ${reachable === 1 ? 'node holds its' : 'nodes hold their'} final distance.`}
      </>,
      0.8,
      { lowered: [], roundChanges: finished, edge: null, changes },
    );
  }
  const rounds = run.roundChanges.length;
  if (run.stoppedEarly) {
    rec.close(
      <>
        Done after {plural(rounds, 'round')} ({plural(run.tests.length, 'edge test')}),{' '}
        {rounds < n - 1
          ? `not the ${n - 1} rounds the worst case allows.`
          : `the most the worst case allows (n - 1 = ${n - 1}), and the last one changed nothing.`}{' '}
        A negative cycle that was reachable would have kept lowering something, so there is none. Distances: {g.names.map((v, i) => `${v} ${distText(g, run.dist[i])}`).join(', ')}.
      </>,
      2,
    );
    return rec.frames;
  }
  if (!run.cycle) {
    rec.snap(
      <>
        {plural(n - 1, 'round')} done, which is enough for any shortest path (it has at most {n - 1} edges). Round {n} is the check: no edge lowers anything, so there is no reachable negative cycle.
      </>,
      undefined,
      { round: n, changes: 0 },
    );
    rec.close(<>Done: distances {g.names.map((v, i) => `${v} ${distText(g, run.dist[i])}`).join(', ')}.</>, 2);
    return rec.frames;
  }
  rec.snap(
    <>
      Round {n} is the check. {plural(n - 1, 'round')} are enough for any shortest path, yet {plural(run.checkEdges.length, 'edge')} still lower a distance:{' '}
      <span className="hl bad">{run.checkEdges.map((i) => edgeText(g, i)).join(', ')}</span>. Something is going round a loop.
    </>,
    undefined,
    { round: n, changes: run.checkEdges.length, checkEdges: run.checkEdges },
  );
  rec.snap(
    <>
      Negative cycle <span className="hl bad">{cycleText(g, run.cycle)}</span>, summing to {sumText(g, run.cycle.sum)}: each trip round it makes every distance on it, and on anything it can reach, smaller.{marketLoopText(g, run.cycle)}
    </>,
    undefined,
    { cycle: run.cycle.edges },
  );
  rec.set({ noPath: run.noPath, dist: [...run.dist] });
  rec.close(
    <>
      No shortest path exists for <span className="hl bad">{nodeList(g, run.noPath)}</span>: they are reachable from the cycle, so a shorter walk keeps existing. They read
      &quot;no shortest path&quot;, not a big negative number.
    </>,
    2,
  );
  return rec.frames;
}

// ---- Dijkstra beside Bellman-Ford --------------------------------------------------------

export interface DijkstraFrame extends Frame {
  dist: number[];
  finalised: number[];
  current: number | null;
  /** Edges looked at from the current node that lowered a distance. */
  lowered: number[];
  /** Edges skipped because their target was already finalised. */
  skipped: number[];
  /** Set on the last frame: where Dijkstra disagrees with the truth. */
  wrong: number[];
}

export function dijkstraFrames(g: Graph, source: number): DijkstraFrame[] {
  const n = g.names.length;
  const dij = dijkstraVisited(g, source);
  const truth = bellmanFord(g, source);
  const d0 = Array<number>(n).fill(Infinity);
  d0[source] = 0;
  const rec = createRecorder<DijkstraFrame>(
    { dist: d0, finalised: [], current: null, lowered: [], skipped: [], wrong: [] },
    { transient: { current: null, lowered: [], skipped: [] } },
  );
  const name = (v: number) => g.names[v];
  rec.snap(
    <>
      Dijkstra from {name(source)}: finalise the closest open node, lower its neighbours, and never look at a finalised node again. That is exactly the step a negative edge can invalidate.
    </>,
  );
  const dist = [...d0];
  const finalised: number[] = [];
  for (const step of dij.steps) {
    finalised.push(step.node);
    for (const i of step.lowered) dist[g.edges[i].to] = dist[step.node] + g.edges[i].w;
    const remarks: ReactNode[] = [];
    if (step.lowered.length) remarks.push(<>It lowers {step.lowered.map((i) => `${name(g.edges[i].to)} to ${distText(g, dist[g.edges[i].to])}`).join(' and ')}.</>);
    for (const i of step.skipped) {
      const e = g.edges[i];
      const via = step.dist + e.w;
      remarks.push(
        via < dist[e.to] - 1e-9 ? (
          <span key={i} className="hl bad">
            {edgeText(g, i)} would give {name(e.to)} {sumText(g, via)}, below its {distText(g, dist[e.to])}, but {name(e.to)} is already finalised, so Dijkstra does not look.
          </span>
        ) : (
          <span key={i}>{edgeText(g, i)} points back at the finalised {name(e.to)} and could not improve it.</span>
        ),
      );
    }
    rec.snap(
      <>
        Dijkstra finalises {name(step.node)} at {distText(g, step.dist)}: it is the closest open node.{' '}
        {remarks.length ? remarks.map((r, k) => <span key={k}>{r} </span>) : 'Nothing to lower from here.'}
      </>,
      undefined,
      { dist: [...dist], finalised: [...finalised], current: step.node, lowered: step.lowered, skipped: step.skipped },
    );
  }
  const wrong = dijkstraWrong(dij, truth);
  rec.close(
    wrong.length === 0 ? (
      <>
        Dijkstra agrees with Bellman-Ford at every node reached here. That is a fact about this graph, not a guarantee: one negative edge into a finalised node is enough to break it.
      </>
    ) : (
      <>
        <span className="hl bad">Dijkstra is wrong at {nodeList(g, wrong)}:</span>{' '}
        {wrong.map((v) => `${name(v)} ${distText(g, dij.dist[v])} against the true ${distText(g, truth.dist[v])}`).join('; ')}. A finalised distance is only final when no later edge can be negative.
      </>
    ),
    2,
  );
  rec.frames[rec.frames.length - 1].wrong = wrong;
  return rec.frames;
}

// ---- Floyd-Warshall ----------------------------------------------------------------------

export interface FwFrame extends Frame {
  /** Index into the run's steps. */
  step: number;
  k: number;
  changed: Cell[];
}

export function fwFrames(g: Graph, run: FwRun): FwFrame[] {
  const n = g.names.length;
  const name = (v: number) => g.names[v];
  return run.steps.map((s, step): FwFrame => {
    if (step === 0) {
      return {
        step,
        k: -1,
        changed: [],
        say: (
          <>
            Floyd-Warshall starts from the direct edges: d[i][j] is the edge weight, 0 on the diagonal, ∞ where there is no edge. Step k lets node k be a stop on the way; after k has run, d[i][j] is the best path from i to j that stops only at nodes up to k.
          </>
        ),
      };
    }
    const prev = run.steps[step - 1];
    const cells = s.changed.map((c) => `${name(c.i)}→${name(c.j)} ${distText(g, prev.d[c.i][c.j])} to ${distText(g, s.d[c.i][c.j])}`);
    const lead = (
      <>
        k = {name(s.k)}: each cell becomes the smaller of d[i][j] and d[i][{name(s.k)}] + d[{name(s.k)}][j]. The violet rings are the row and column it reads.{' '}
      </>
    );
    const last = step === run.steps.length - 1;
    const say =
      s.negativeDiagonal.length > 0 ? (
        <>
          {lead}
          <span className="hl bad">
            {s.negativeDiagonal.map((v) => `${name(v)}→${name(v)} is now ${sumText(g, s.d[v][v])}`).join(', ')}
          </span>
          : a path from a node back to itself costs less than nothing, so there is a negative cycle. The run stops at the first sign, at k = {name(s.k)}.
        </>
      ) : (
        <>
          {lead}
          {s.changed.length === 0 ? 'No cell improved.' : `${plural(s.changed.length, 'cell')} improved: ${cells.join('; ')}.`}
          {last ? ` That is all ${n} nodes allowed as stops, and no diagonal went below zero.` : ''}
        </>
      );
    return { step, k: s.k, changed: s.changed, say, hold: last ? 2 : undefined };
  });
}
