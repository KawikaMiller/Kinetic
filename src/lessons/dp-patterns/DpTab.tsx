import { useMemo, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { cellSpec } from './cellSpec';
import { framesOf, type DpFrame, type DpRun, type GridView } from './runs';

const STEP_MS = 600;
const GRID_MIN_WIDTH = 420;
const GRID_SIZE = { cell: 26, font: 11 };

export interface TabLines {
  state: ReactNode;
  transition: ReactNode;
  base: ReactNode;
  answer: ReactNode;
}

function DpGrid({ view, wrongAnswer, label }: { view: GridView; wrongAnswer: boolean; label: string }) {
  const rows = view.cells.length;
  const cols = view.cells[0]?.length ?? 0;
  const shape = { rows, cols, rowLabels: view.rowLabels, colLabels: view.colLabels, size: GRID_SIZE };
  const width = cellGridFrame(shape).width;
  return (
    <WideRegion minWidth={Math.max(GRID_MIN_WIDTH, width)} label={`${label}: scroll sideways to see all of it`}>
      <CellGrid {...shape} cell={(r, c) => cellSpec(view, wrongAnswer, r, c)} ariaLabel={label} />
    </WideRegion>
  );
}

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'cell being computed', shape: 'square' },
      { color: 'var(--info)', label: 'cells it reads', shape: 'square' },
      { color: 'var(--ok)', label: 'finished cell', shape: 'square' },
      { color: 'var(--violet)', label: 'on the rebuilt solution', shape: 'square' },
      { color: 'var(--dim)', label: 'not computed yet', shape: 'square' },
      { color: 'var(--bad)', label: 'a wrong state\'s answer', shape: 'square' },
    ]}
  />
);

/** The shared body of the four tabs: the four-line header, the state choice, the grid with its player, and the honesty chips. */
export function DpTab({
  picker, run, truth, lines, choice, controls, extraStats, below, chips, intro,
}: {
  picker: ReactNode;
  run: DpRun;
  /** The correct answer, from a reference that does not use the state under test. */
  truth: string;
  lines: TabLines;
  /** The state-choice control and its verdict. */
  choice: ReactNode;
  controls: ReactNode;
  extraStats?: ReactNode;
  below?: ReactNode | ((frame: DpFrame) => ReactNode);
  chips?: ReactNode;
  intro?: ReactNode;
}) {
  const frames = useMemo(() => framesOf(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const view = run.view(f.done, f.trace);
  const finished = f.done === run.stepCount;
  const disagrees = run.answer !== truth;
  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="This state says" value={finished ? run.answer : '…'} color={finished && disagrees ? 'var(--bad)' : 'var(--ok)'} sub={finished ? (disagrees ? 'wrong for this instance' : 'matches the reference') : 'fill the table first'} />
          <Stat label="Correct answer" value={truth} color="var(--ok)" sub="checked against brute force" />
          {extraStats}
        </Stats>
      }
      legend={LEGEND}
      controls={[picker, choice, controls]}
    >
      <div className="dp-stage stage-pad">
        {intro}
        <dl className="dp-lines">
          <dt>State</dt>
          <dd className="is-state">{lines.state}</dd>
          <dt>Transition</dt>
          <dd>{lines.transition}</dd>
          <dt>Base</dt>
          <dd>{lines.base}</dd>
          <dt>Answer</dt>
          <dd>{lines.answer}</dd>
        </dl>
        <DpGrid view={view} wrongAnswer={disagrees} label="DP table" />
        {typeof below === 'function' ? below(f) : below}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every table is computed live by the lesson's own code and compared with a brute force</Provenance>
        <Provenance kind="toy">tiny instances: n is at most 8 so a brute force can check every table</Provenance>
        {chips}
      </ProvenanceRow>
    </StageFrame>
  );
}
