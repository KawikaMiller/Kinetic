import { useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import {
  CELLS, DEFAULT_SCHEDULE, GLOBAL_CELL, LIMITS, LOCAL_CELL, QUENCH_SCHEDULE, SEED_WINDOW, exactHillClimbing, runBatch, wilsonInterval, type Batch, type Schedule,
} from './landscape';
import { batchCaption } from './text';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 560;
const HILL = exactHillClimbing();
const FIRST_SEED = 1;

interface Setup {
  schedule: Schedule;
  seed: number;
  result: Batch | null;
}
const START: Setup = { schedule: DEFAULT_SCHEDULE, seed: FIRST_SEED, result: null };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Scene 2: 1,000 seeded runs from random starts under a schedule of its own, against the exact hill-climbing rate. */
export function BatchScene({ picker }: { picker: ReactNode }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [s, setS] = useState<Setup>(START);
  const r = s.result;
  const caption = r ? batchCaption(r, HILL.successes, HILL.total) : `Press Run 1,000 seeds to try this schedule from 1,000 random starts. For comparison, hill climbing reaches the global minimum from ${HILL.successes} of ${HILL.total} starts exactly (${pct(HILL.successes / HILL.total)}).`;
  const interval = r ? wilsonInterval(r.successes, r.runs) : null;
  const change = (patch: Partial<Schedule>) => setS((q) => ({ ...q, schedule: { ...q.schedule, ...patch }, result: null }));

  return (
    <StageFrame
      height={400}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Reached the minimum" value={r ? `${r.successes} of ${r.runs}` : '?'} color={r ? 'var(--ok)' : undefined} sub={r && interval ? `${pct(r.successes / r.runs)}, 95% interval ${pct(interval.low)} to ${pct(interval.high)}` : 'press Run'} />
          <Stat label="Hill climbing, exact" value={`${HILL.successes} of ${HILL.total}`} sub={pct(HILL.successes / HILL.total)} />
          {r && r.successes < r.runs && r.firstFailure && <Stat label="Lowest failing seed" value={r.firstFailure.seed} color="var(--bad)" sub={`start cell ${r.firstFailure.start}, ends at ${r.firstFailure.end}`} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'runs that ended at the global minimum', shape: 'square' },
            { color: 'var(--orange)', label: 'runs that ended in the local minimum at cell 4', shape: 'square' },
            { color: 'var(--muted)', label: 'runs that ended anywhere else', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Schedule">
            <ChipButton on={s.schedule.t0 === DEFAULT_SCHEDULE.t0} onClick={() => setS((q) => ({ ...q, schedule: DEFAULT_SCHEDULE, result: null }))}>Default (T0 4)</ChipButton>
            <ChipButton on={s.schedule.t0 === QUENCH_SCHEDULE.t0} onClick={() => setS((q) => ({ ...q, schedule: QUENCH_SCHEDULE, result: null }))}>Quench (T0 0.05)</ChipButton>
          </ControlGroup>
        </>,
        <>
          <Slider label="Start temperature T0" value={s.schedule.t0} min={LIMITS.t0.min} max={LIMITS.t0.max} step={LIMITS.t0.step} format={(v) => v.toFixed(2)} onChange={(t0) => change({ t0 })} />
          <Slider label="Cooling factor" value={s.schedule.alpha} min={LIMITS.alpha.min} max={LIMITS.alpha.max} step={LIMITS.alpha.step} format={(v) => v.toFixed(3)} onChange={(alpha) => change({ alpha })} />
          <Slider label="Steps" value={s.schedule.steps} min={LIMITS.steps.min} max={LIMITS.steps.max} step={LIMITS.steps.step} onChange={(steps) => change({ steps })} />
          <SeedField label="First seed" seed={s.seed} onSeed={(seed) => setS((q) => ({ ...q, seed, result: null }))} />
        </>,
        <>
          <Button variant="primary" onClick={() => setS((q) => ({ ...q, result: runBatch(q.seed, SEED_WINDOW, 'anneal', q.schedule) }))}>Run {SEED_WINDOW.toLocaleString('en-US')} seeds</Button>
        </>,
      ]}
    >
      <div className="stage-pad ls-stage">
        {r ? (
          <Plot2D
            x={{ domain: [0, CELLS], label: 'cell where the run ended', ticks: 10 }}
            y={{ domain: [0, Math.max(...r.ends, 1) * 1.1], label: 'runs' }}
            width={phone ? PHONE_WIDTH : DESKTOP_WIDTH}
            height={220}
            ariaLabel={`Histogram of the end cells of ${r.runs} runs`}
          >
            <Bars
              bars={r.ends.map((count, c) => ({ x0: c, x1: c + 1, y: count, tone: (c === GLOBAL_CELL ? 'ok' : c === LOCAL_CELL ? 'orange' : 'muted') as Tone }))}
            />
          </Plot2D>
        ) : (
          <Hint block>The histogram of end cells appears after a run.</Hint>
        )}
        <Hint block>Each run starts on a random cell and uses its own seed, counting up from the first seed. A run counts as a success when it ends on cell {GLOBAL_CELL}.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={s.seed}>{SEED_WINDOW.toLocaleString('en-US')} seeded runs, first seed shown</Provenance>
        <Provenance kind="toy">a 20-cell teaching landscape: real landscapes have millions of states</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
