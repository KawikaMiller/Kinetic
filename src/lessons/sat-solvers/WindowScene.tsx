import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { DEFAULT_WINDOW_START, WINDOW_SIZE, runWindow, summariseWindow, type SolverMode } from './model';
import { Chips } from './parts';
import { windowCaption } from './text';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 560;
const PLOT_HEIGHT = 240;

/** Scene 3: both branching rules on a window of 200 seeded random formulas, and the never-flips solver's wrong verdicts. */
export function WindowScene({ picker }: { picker: ReactNode }) {
  const [start, setStart] = useState(DEFAULT_WINDOW_START);
  const [mode, setMode] = useState<SolverMode>('correct');
  const phone = useMediaQuery(PHONE_QUERY);
  const runs = useMemo(() => runWindow(start), [start]);
  const summary = useMemo(() => summariseWindow(runs), [runs]);
  const tallest = Math.max(...runs.map((r) => r.first.branches), 1);
  const caption = windowCaption(summary, mode, start);
  const firstBars = useMemo(() => runs.map((r, i) => ({ x0: i, x1: i + 1, y: r.first.branches })), [runs]);
  const mostBars = useMemo(() => runs.map((r, i) => ({ x0: i, x1: i + 1, y: r.most.branches })), [runs]);
  const wrongBars = useMemo(() => runs.flatMap((r, i) => (!r.brokenSat && r.satisfiable ? [{ x0: i, x1: i + 1, y: tallest }] : [])), [runs, tallest]);

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Verdicts right" value={`${summary.verdictsAgree} of ${summary.size}`} color={summary.verdictsAgree === summary.size ? 'var(--ok)' : 'var(--bad)'} sub={`${summary.satisfiable} satisfiable, by brute force`} />
          <Stat label="Mean branches, first" value={summary.meanFirst.toFixed(2)} sub="first unassigned" />
          <Stat label="Mean branches, most" value={summary.meanMost.toFixed(2)} sub="most occurring" />
          {mode === 'broken' && <Stat label="Wrong UNSAT" value={`${summary.brokenWrong} of ${summary.size}`} color="var(--bad)" sub={summary.lowestBrokenSeed === null ? 'none in this window' : `first at seed ${summary.lowestBrokenSeed}`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'branches, first unassigned', shape: 'square' },
            { color: 'var(--violet)', label: 'branches, most occurring (in front)', shape: 'square' },
            ...(mode === 'broken' ? [{ color: 'var(--bad)', label: 'wrong UNSAT from the broken solver', shape: 'square' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField label="First seed" seed={start} onSeed={setStart} />
          <Toggle label="Solver" value={mode === 'broken'} off="correct" on="never flips (broken)" onChange={(b) => setMode(b ? 'broken' : 'correct')} />
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <Plot2D
          x={{ domain: [0, WINDOW_SIZE], label: `formula (seeds ${start} to ${start + WINDOW_SIZE - 1})`, ticks: 5 }}
          y={{ domain: [0, Math.ceil(tallest * 1.1)], label: 'branches' }}
          width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
          height={PLOT_HEIGHT}
          ariaLabel={`Branches per formula for seeds ${start} to ${start + WINDOW_SIZE - 1}`}
        >
          {mode === 'broken' && <Bars bars={wrongBars} tone="bad" />}
          <Bars bars={firstBars} tone="info" />
          <Bars bars={mostBars} tone="violet" />
        </Plot2D>
        <Hint block>Random 3-SAT, 8 variables and 30 clauses; each bar is one seed. The two rules are compared by how big the search tree gets, and their verdicts are checked against brute force. The tallest tree in this window has {tallest} branches.</Hint>
      </div>
      <Chips seed={start} />
    </StageFrame>
  );
}
