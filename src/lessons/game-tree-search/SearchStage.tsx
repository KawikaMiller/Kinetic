import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { searchFrames } from './frames';
import { BOARD_WIDTH, TreeBoard, type BoardMarks } from './TreeBoard';
import { nodeCount, type SearchResult, type Spec } from './tree';
import { viewAt, pathName } from './view';

const STEP_MS = 450;
const STAGE_MIN_WIDTH = BOARD_WIDTH;

/** Content that may depend on whether the run has finished (a prediction is only checked at the end). */
type Slot = ReactNode | ((state: { done: boolean }) => ReactNode);
const resolve = (slot: Slot, done: boolean): ReactNode => (typeof slot === 'function' ? slot({ done }) : slot);

/** The tree, its player and the counters, shared by the minimax and alpha-beta scenes. */
export function SearchStage({
  spec, leaves, result, windows, marks, onNodeClick, controls, extraStats, below, ariaLabel,
}: {
  spec: Spec;
  leaves: readonly number[];
  result: SearchResult;
  windows: boolean;
  marks?: BoardMarks;
  onNodeClick?: (id: number) => void;
  controls: ReactNode[];
  extraStats?: Slot;
  below?: Slot;
  ariaLabel: string;
}) {
  const frames = useMemo(() => searchFrames(spec, result, windows), [spec, result, windows]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const k = player.frame.k;
  const view = viewAt(spec, result, k);
  const done = player.atEnd;
  const total = nodeCount(spec);
  const entered = view.visited.size;
  return (
    <StageFrame
      player={player}
      height={520}
      minWidth={STAGE_MIN_WIDTH}
      stats={
        <Stats>
          <Stat label="Root value" value={done ? result.value : '?'} color={done ? 'var(--ok)' : 'var(--dim)'} sub={done ? `best first move ${pathName(result.bestChild, spec.b)}` : 'filled in at the end'} />
          <Stat label="Nodes looked at" value={entered} color="var(--hi)" sub={`of ${total} in the tree; this run ends at ${result.nodes}`} />
          {resolve(extraStats, done)}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'max node (the maximiser moves)', shape: 'dot' },
            { color: 'var(--violet)', label: 'min node (the minimiser moves)', shape: 'dot' },
            { color: 'var(--hi)', label: 'node being worked on', shape: 'dot' },
            { color: 'var(--ok)', label: 'chosen child (the best move)', shape: 'line' },
            { color: 'var(--dim)', label: 'skipped subtree, struck through', shape: 'line' },
          ]}
        />
      }
      controls={controls}
    >
      <div className="gt-stage stage-pad">
        <TreeBoard spec={spec} leaves={leaves} view={view} showWindows={windows} marks={marks} onNodeClick={onNodeClick} ariaLabel={ariaLabel} />
        {resolve(below, done)}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a depth-3 teaching tree with 27 leaves; real engines add move ordering heuristics, transposition tables and large evaluation functions</Provenance>
        <Provenance kind="real">the values, windows and cuts come from running the search on the leaves you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
