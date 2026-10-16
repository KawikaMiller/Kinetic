import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { naiveFrames } from './frames';
import { NAIVE_PRESETS, OPENING } from './presets';
import { PairControls } from './PairControls';
import { StripPair } from './Strips';
import { usePair } from './usePair';

const STEP_MS = 450;

/** Scene 1: the naive slide, with the characters it matches a second time tinted as rework. */
export function NaiveScene({ picker }: { picker: ReactNode }) {
  const state = usePair(OPENING.naive);
  const { text, pattern } = state.pair;
  const run = useMemo(() => naiveFrames(text, pattern), [text, pattern]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const reworked = new Set(f.reworked);
  const found = f.found;

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Comparisons" value={f.comparisons} color="var(--hi)" sub={`of ${run.comparisons} for this text and pattern`} />
          <Stat label="Matched again" value={f.rematches} color="var(--bad)" sub="matches against characters that had matched before" />
          <Stat label="Found at" value={found.length ? found.join(', ') : 'nothing yet'} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparison in progress', shape: 'square' },
            { color: 'var(--ok)', label: 'matched', shape: 'square' },
            { color: 'var(--bad)', label: 'mismatch / matched again (rework)', shape: 'square' },
            { color: 'var(--info)', label: 'text pointer', shape: 'dot' },
            { color: 'var(--violet)', label: 'pattern pointer', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PairControls state={state} presets={NAIVE_PRESETS} />
        </>,
      ]}
    >
      <div className="km-stage stage-pad">
        <StripPair
          text={text}
          pattern={pattern}
          shift={f.shift}
          revealAt={f.i ?? f.shift}
          textState={(i) => (i === f.i ? (f.verdict === 'differ' ? 'bad' : 'active') : f.matched.includes(i) ? 'done' : 'idle')}
          textTone={(i) => (reworked.has(i) ? 'bad' : null)}
          patternState={(k) => (f.i === null ? 'idle' : k < f.k ? 'done' : k === f.k ? (f.verdict === 'differ' ? 'bad' : 'active') : 'idle')}
          textPointers={f.i === null ? [] : [{ i: f.i, label: 'i', tone: 'info' }]}
          patternPointers={f.i === null ? [] : [{ i: f.shift + f.k, label: 'k', tone: 'violet' }]}
        />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every comparison is counted from the run you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
