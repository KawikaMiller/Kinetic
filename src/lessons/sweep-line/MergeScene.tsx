import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { mergeFrames } from './frames';
import { IntervalControls } from './IntervalControls';
import { INTERVAL_PRESETS, OPENING } from './presets';
import { Timeline } from './Timeline';
import { useIntervals } from './useIntervals';

const STEP_MS = 900;

/** Scene 1: sort by start, sweep a line, and grow the union. */
export function MergeScene({ picker }: { picker: ReactNode }) {
  const state = useIntervals(OPENING.merge);
  const run = useMemo(() => mergeFrames(state.intervals), [state.intervals]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const done = new Set(f.done);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Intervals" value={state.intervals.length} />
          <Stat label="Merged so far" value={f.merged.length} color="var(--ok)" sub={`${run.merged.length} when finished`} />
          <Stat label="Sweep line" value={f.now ?? '–'} color="var(--hi)" sub="start of the interval being processed" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being processed / sweep line', shape: 'square' },
            { color: 'var(--info)', label: 'already swept', shape: 'square' },
            { color: 'var(--dim)', label: 'not reached', shape: 'square' },
            { color: 'var(--ok)', label: 'merged output', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <IntervalControls state={state} presets={INTERVAL_PRESETS} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Timeline
          intervals={state.intervals}
          tone={(i) => (f.current === i ? 'hi' : done.has(i) ? 'info' : 'dim')}
          now={f.now}
          onDrag={state.drag}
          extra={f.merged}
          ariaLabel={`${state.intervals.length} intervals and their merged union`}
        />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every count is computed from the intervals as drawn</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
