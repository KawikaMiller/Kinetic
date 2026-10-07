import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { GANTT_MIN_W } from './common';
import { COST_MAX_US, COST_MIN_US, overhead, OVERHEAD_BAD, SLICES_US, switchesPerSecond } from './model';
import { costBars } from './view';

const CYCLES = 4;
const DEFAULT_SLICE = SLICES_US.indexOf(4000);
const DEFAULT_COST = 5;

const usLabel = (us: number) => (us >= 1000 ? `${us / 1000} ms` : `${us} µs`);

export function CostScene({ picker }: { picker: ReactNode }) {
  const [sliceIdx, setSliceIdx] = useState(DEFAULT_SLICE);
  const [cost, setCost] = useState(DEFAULT_COST);
  const slice = SLICES_US[sliceIdx];
  const lost = overhead(slice, cost);
  const perSec = switchesPerSecond(slice, cost);
  const bad = lost > OVERHEAD_BAD;
  const period = slice + cost;
  useIntroCaption(
    <>
      Every slice ends in a switch. With a {usLabel(slice)} slice and a {cost} µs switch, the core switches {Math.round(perSec).toLocaleString('en-US')} times a second and loses{' '}
      <span className={`hl ${bad ? 'bad' : 'violet'}`}>{pct(lost, 1)}</span> of its time to switching
      {bad ? ': the slices are too small for the switch cost.' : '.'}
    </>,
    [slice, cost],
  );

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Switches per second" value={Math.round(perSec).toLocaleString('en-US')} sub="1 / (slice + cost)" />
          <Stat label="Overhead" value={pct(lost, 1)} color={bad ? 'var(--bad)' : 'var(--violet)'} sub={`cost / (slice + cost); red above ${pct(OVERHEAD_BAD)}`}>
            <Bar value={lost} max={1} tone={bad ? 'bad' : 'violet'} marker={OVERHEAD_BAD} height={6} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a thread running', shape: 'square' },
            { color: 'var(--violet)', label: 'context switch', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Time slice" value={sliceIdx} min={0} max={SLICES_US.length - 1} onChange={setSliceIdx} format={(i) => usLabel(SLICES_US[i])} />
          <Slider label="Switch cost" value={cost} min={COST_MIN_US} max={COST_MAX_US} onChange={setCost} format={(v) => `${v} µs (illustrative)`} />
        </>,
      ]}
    >
      <div className="ics stage-pad">
        <WideRegion minWidth={GANTT_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'cpu', label: 'one core' }]}
            bars={costBars(slice, cost, CYCLES)}
            domain={[0, CYCLES * period]}
            axis
            unit=" µs"
            size="md"
            labelWidth={84}
            ariaLabel={`${CYCLES} slices of ${usLabel(slice)}, each followed by a ${cost} µs switch`}
          />
        </WideRegion>
        <Hint block>
          Drawn to scale: at a 4 ms slice a few-µs switch is a hairline. Switch costs are illustrative; real ones vary with the CPU, mitigations and how much cache the next thread has to refill.
        </Hint>
      </div>
    </StageFrame>
  );
}
