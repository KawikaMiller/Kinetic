import type { ReactNode } from 'react';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import { holderOf, jobName, workerName, type Bipartite, type Matching, type PathStep } from './model';
import type { Flipped } from './useMatchEditor';

const W = 560;
const W_FLOW = 680;
const H = 310;
const LABEL_PX = 13;
const GRAPH_MIN_WIDTH = minWidthForText(W, LABEL_PX);
const FLOW_MIN_WIDTH = minWidthForText(W_FLOW, LABEL_PX);
const ROW_GAP = 46;
const PAD_Y = 34;

// Node ids: workers 0..5, jobs JOB_BASE + j, the unit network's source and sink after those.
const JOB_BASE = 100;
const SOURCE = 200;
const SINK = 201;
const workerId = (w: number) => w;
const jobId = (j: number) => JOB_BASE + j;

/** The y of row i of n, centred in the drawing. */
const rowY = (i: number, n: number) => H / 2 + (i - (n - 1) / 2) * Math.min(ROW_GAP, (H - 2 * PAD_Y) / Math.max(1, n - 1));

export interface MatchMarks {
  /** Path being shown (highlighted --hi), with its start worker. */
  path?: readonly PathStep[];
  /** Edges the last flip changed (--info). */
  flipped?: readonly Flipped[];
  /** Nodes outlined --bad (a Hall violator's workers). */
  violatorWorkers?: readonly number[];
  /** Nodes tinted --orange (the violator's neighbours). */
  violatorJobs?: readonly number[];
  /** Nodes tinted --violet (the vertex cover). */
  coverWorkers?: readonly number[];
  coverJobs?: readonly number[];
  selectedWorker?: number | null;
}

/**
 * Workers on the left, jobs on the right; drawn as two columns, or as the unit-capacity network with s and t added. The scene
 * decides what a click on a worker or a job means.
 */
export function MatchGraph({
  g, matching, asFlow = false, marks = {}, onWorkerClick, onJobClick, ariaLabel, note,
}: {
  g: Bipartite;
  matching: Matching;
  asFlow?: boolean;
  marks?: MatchMarks;
  onWorkerClick?: (w: number) => void;
  onJobClick?: (j: number) => void;
  ariaLabel: string;
  note?: ReactNode;
}) {
  const width = asFlow ? W_FLOW : W;
  const wx = asFlow ? 190 : 130;
  const jx = asFlow ? 460 : 430;
  const nodes = [
    ...Array.from({ length: g.workers }, (_, w) => ({ id: workerId(w), label: workerName(w), at: { x: wx, y: rowY(w, g.workers) } })),
    ...Array.from({ length: g.jobs }, (_, j) => ({ id: jobId(j), label: jobName(j), at: { x: jx, y: rowY(j, g.jobs) } })),
    ...(asFlow ? [{ id: SOURCE, label: 's', at: { x: 40, y: H / 2 } }, { id: SINK, label: 't', at: { x: width - 40, y: H / 2 } }] : []),
  ];
  type E = { from: number; to: number; label?: string; labelAt?: number; kind: 'pair' | 'source' | 'sink'; w: number; j: number };
  const edges: E[] = [
    ...g.edges.map(([w, j]): E => ({ from: workerId(w), to: jobId(j), kind: 'pair', w, j, ...(asFlow ? { label: matching[w] === j ? '1/1' : '0/1' } : {}) })),
    ...(asFlow
      ? [
          ...Array.from({ length: g.workers }, (_, w): E => ({ from: SOURCE, to: workerId(w), kind: 'source', w, j: -1, labelAt: 0.7, label: matching[w] >= 0 ? '1/1' : '0/1' })),
          ...Array.from({ length: g.jobs }, (_, j): E => ({ from: jobId(j), to: SINK, kind: 'sink', w: -1, j, labelAt: 0.3, label: holderOf(matching, j) >= 0 ? '1/1' : '0/1' })),
        ]
      : []),
  ];

  const path = marks.path ?? [];
  /** Edges the path uses: each step's pair, and the matched pair it passes back through to reach the next worker. */
  const onPath = (e: E): boolean => {
    if (e.kind === 'source') return path.length > 0 && path[0].worker === e.w;
    if (e.kind === 'sink') return path.length > 0 && path[path.length - 1].job === e.j;
    return path.some((s, i) => (s.worker === e.w && s.job === e.j) || (i + 1 < path.length && path[i + 1].worker === e.w && s.job === e.j));
  };
  const edgeMark = (_: unknown, i: number): GraphEdgeMark | null => {
    const e = edges[i];
    if (onPath(e)) return { tone: 'hi', width: 5 };
    if (e.kind === 'pair') {
      if (marks.flipped?.some((f) => f.worker === e.w && f.job === e.j) && matching[e.w] === e.j) return { tone: 'info', width: 5 };
      if (matching[e.w] === e.j) return { tone: 'ok', width: 4.5 };
      return null;
    }
    const used = e.kind === 'source' ? matching[e.w] >= 0 : holderOf(matching, e.j) >= 0;
    return used ? { tone: 'ok', width: 3 } : null;
  };
  const nodeMark = (id: number): GraphNodeMark | null => {
    if (id >= SOURCE) return null;
    if (id < JOB_BASE) {
      if (id === marks.selectedWorker) return { tone: 'hi', fill: 'solid' };
      if (marks.violatorWorkers?.includes(id)) return { tone: 'bad', fill: 'tint' };
      if (marks.coverWorkers?.includes(id)) return { tone: 'violet', fill: 'tint' };
      return matching[id] < 0 ? { tone: 'dim', fill: 'tint', tint: 12 } : null;
    }
    const j = id - JOB_BASE;
    if (marks.violatorJobs?.includes(j)) return { tone: 'orange', fill: 'tint' };
    if (marks.coverJobs?.includes(j)) return { tone: 'violet', fill: 'tint' };
    return null;
  };

  return (
    <>
      {note !== undefined && (
        <p className="bm-note" role="status">
          {note}
        </p>
      )}
      <WideRegion minWidth={asFlow ? FLOW_MIN_WIDTH : GRAPH_MIN_WIDTH} label="Workers and jobs: scroll sideways to see all of it">
        <GraphView
          nodes={nodes}
          edges={edges.map(({ from, to, label, labelAt }) => ({ from, to, label, labelAt }))}
          directed={asFlow}
          width={width}
          height={H}
          labelHalo
          className="bm-graph"
          ariaLabel={ariaLabel}
          edgeMark={edgeMark}
          nodeMark={nodeMark}
          nodeAriaLabel={(id) => (id === SOURCE ? 'Source s' : id === SINK ? 'Sink t' : id < JOB_BASE ? `Worker ${workerName(id)}${matching[id] >= 0 ? `, holds ${jobName(matching[id])}` : ', free'}` : `Job ${jobName(id - JOB_BASE)}`)}
          edgeAriaLabel={(_, i) => {
            const e = edges[i];
            return e.kind === 'pair' ? `Edge ${workerName(e.w)} to ${jobName(e.j)}${matching[e.w] === e.j ? ', matched' : ''}` : e.kind === 'source' ? `s to ${workerName(e.w)}` : `${jobName(e.j)} to t`;
          }}
          onNodeClick={(id) => {
            if (id >= SOURCE) return;
            if (id < JOB_BASE) onWorkerClick?.(id);
            else onJobClick?.(id - JOB_BASE);
          }}
        />
      </WideRegion>
    </>
  );
}
