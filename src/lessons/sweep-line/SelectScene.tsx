import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { selectFrames } from './frames';
import { IntervalControls } from './IntervalControls';
import { OPENING, SELECT_PRESETS } from './presets';
import { Timeline } from './Timeline';
import { useIntervals } from './useIntervals';

const STEP_MS = 800;

/** Scene 4: activity selection as a sweep sorted by end, and where the general segment sweeps go next. */
export function SelectScene({ picker }: { picker: ReactNode }) {
  const state = useIntervals(OPENING.select);
  const run = useMemo(() => selectFrames(state.intervals), [state.intervals]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const chosen = new Set(f.chosen);
  const skipped = new Set(f.skipped);

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Chosen so far" value={f.chosen.length} color="var(--ok)" sub={`${run.chosen.length} when finished, out of ${state.intervals.length}`} />
          <Stat label="Skipped so far" value={f.skipped.length} color="var(--dim)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'being considered', shape: 'square' },
            { color: 'var(--ok)', label: 'chosen', shape: 'square' },
            { color: 'var(--dim)', label: 'skipped / not reached', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <IntervalControls state={state} presets={SELECT_PRESETS} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Timeline
          intervals={state.intervals}
          tone={(i) => (f.current === i ? 'hi' : chosen.has(i) ? 'ok' : 'dim')}
          now={f.current === null ? null : state.intervals[f.current].end}
          onDrag={state.drag}
          ariaLabel="Activities as bars, swept by their end"
        />
        <p className="sw-note">
          The sweep key is the end, not the start: sorting by end finishes the earliest and leaves the most room. {skipped.size ? `${skipped.size} skipped so far.` : ''} The general version for segments with any slope, which keeps the active segments ordered along the sweep line, is the Shamos-Hoey test (is there any crossing) and Bentley-Ottmann (report them all). This lesson names them and does not implement them.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every count is computed from the intervals as drawn</Provenance>
        <Provenance kind="from-memory">Shamos-Hoey and Bentley-Ottmann: named only, not implemented; verify</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
