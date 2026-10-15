import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { sizeCaption } from './captions';
import { DOUBLING_FROM, doublingRatio, growthWord, PLOT_LENGTHS, REFERENCE_MACHINES, stepsBySize, type SizePoint, type TaskId } from './model';
import type { TaskState } from './useTaskState';

type Source = 'reference' | 'yours';
const TASK_IDS: readonly TaskId[] = ['increment', 'palindrome'];
const CURVE_TONE = { increment: 'sky', palindrome: 'amber' } as const;
const TASK_LABEL = { increment: 'increment on 1…1', palindrome: 'palindrome on a…a' } as const;
const PLOT_PAD_STEPS = 1.08;

const toPoints = (points: readonly SizePoint[]) => points.filter((p) => p.steps !== null).map((p) => ({ x: p.n, y: p.steps as number }));

/** Scene 3: how many moves each machine takes as the input grows, measured by running the table. */
export function StepsScene({ states, picker }: { states: Record<TaskId, TaskState>; picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [source, setSource] = useState<Source>('reference');
  const incrementMachine = source === 'reference' ? REFERENCE_MACHINES.increment : states.increment.machine;
  const palindromeMachine = source === 'reference' ? REFERENCE_MACHINES.palindrome : states.palindrome.machine;
  const series = useMemo<Record<TaskId, SizePoint[]>>(
    () => ({ increment: stepsBySize('increment', incrementMachine), palindrome: stepsBySize('palindrome', palindromeMachine) }),
    [incrementMachine, palindromeMachine],
  );

  useEffect(() => {
    setCaption(
      <>
        {sizeCaption('increment', series.increment)} {sizeCaption('palindrome', series.palindrome)}
      </>,
      { quiet: true },
    );
  }, [setCaption, series]);

  const top = Math.max(10, ...TASK_IDS.flatMap((t) => series[t].map((p) => p.steps ?? 0)));
  const yMax = Math.ceil(top * PLOT_PAD_STEPS);
  const stat = (task: TaskId) => {
    const last = series[task][series[task].length - 1];
    const ratio = doublingRatio(series[task], DOUBLING_FROM);
    return { value: last.steps ?? 'no halt', sub: ratio === null ? 'no ratio: a run did not halt' : `doubling the length multiplies steps by ${ratio.toFixed(2)}: ${growthWord(ratio)}` };
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          {TASK_IDS.map((t) => (
            <Stat key={t} label={`${TASK_LABEL[t]} at length ${PLOT_LENGTHS.to}`} value={stat(t).value} color={`var(--${CURVE_TONE[t]})`} sub={stat(t).sub} />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={TASK_IDS.map((t) => ({ color: `var(--${CURVE_TONE[t]})`, label: TASK_LABEL[t], shape: 'line' as const }))}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Tables"
            value={source}
            onChange={setSource}
            options={[{ value: 'reference', label: 'The author’s tables' }, { value: 'yours', label: 'Yours, from the first two scenes' }]}
          />
          <Hint tone="muted">Your tables start as the unfinished starters, which stop early, so they leave the plot empty until you finish them.</Hint>
        </>,
      ]}
    >
      <div className="tm stage-pad">
        <Plot2D
          x={{ domain: [PLOT_LENGTHS.from, PLOT_LENGTHS.to], label: 'input length (cells)', ticks: 5 }}
          y={{ domain: [0, yMax], label: 'steps taken', ticks: 5 }}
          ariaLabel="Steps taken against input length for the increment and palindrome machines"
        >
          {TASK_IDS.map((t) => (
            <Curve key={t} points={toPoints(series[t]).map((p): [number, number] => [p.x, p.y])} tone={CURVE_TONE[t]} />
          ))}
          {TASK_IDS.map((t) => (
            <Points key={t} data={toPoints(series[t]).map((p) => ({ ...p, tone: CURVE_TONE[t] }))} r={3} />
          ))}
        </Plot2D>
        <p className="tm-note">
          The head has to walk across the tape to compare the two ends, and one tape is all this machine has. That is why this machine is slow here; it says nothing about how fast a computer can solve either problem.
        </p>
        <ProvenanceRow>
          <Provenance kind="toy">one-tape machine; the steps are counted by running each table on the inputs 1…1 and a…a, not read off a formula</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
