import { useMemo, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { MATCH_CODE, matchFrames } from './frames';
import { lps } from './kmp';
import { MATCH_PRESETS, OPENING } from './presets';
import { PairControls } from './PairControls';
import { StripPair } from './Strips';
import { usePair } from './usePair';

const STEP_MS = 650;

/** Scene 3: the matcher. The text pointer only moves forward; a mismatch sends j back through the table. */
export function MatchScene({ picker }: { picker: ReactNode }) {
  const state = usePair(OPENING.match);
  const { text, pattern } = state.pair;
  const run = useMemo(() => matchFrames(text, pattern), [text, pattern]);
  const table = useMemo(() => lps(pattern), [pattern]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const m = pattern.length;
  const live = f.i !== null;
  const shift = live ? f.i! - f.j : null;
  const skippedFrom = live ? f.i! - f.skipped : 0;
  const foundWindow = (i: number) => f.found.some((s) => i >= s && i < s + m);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Comparisons" value={f.comparisons} color="var(--hi)" sub={`of ${run.comparisons} for this text and pattern`} />
          <Stat label="Text pointer i" value={f.i ?? '–'} color="var(--info)" sub="only ever moves forward" />
          <Stat label="Found at" value={f.found.length ? f.found.join(', ') : 'nothing yet'} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparison in progress', shape: 'square' },
            { color: 'var(--ok)', label: 'matched / re-reads skipped / found', shape: 'square' },
            { color: 'var(--bad)', label: 'mismatch', shape: 'square' },
            { color: 'var(--info)', label: 'text pointer i', shape: 'dot' },
            { color: 'var(--violet)', label: 'pattern pointer j and the lps fall-back', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PairControls state={state} presets={MATCH_PRESETS} />
        </>,
      ]}
    >
      <div className="km-stage stage-pad">
        <div className="km-lps" aria-label="The failure table">
          <span className="km-rowlabel">lps</span>
          {table.map((v, k) => (
            <span key={k} className={`km-lpscell${live && f.j === k ? ' is-j' : ''}`}><i>{pattern[k]}</i>{v}</span>
          ))}
        </div>
        <StripPair
          text={text}
          pattern={pattern}
          shift={shift}
          revealAt={f.i ?? 0}
          textState={(i) => (i === f.i ? (f.verdict === 'differ' ? 'bad' : 'active') : live && shift !== null && i >= shift && i < f.i! ? 'done' : 'idle')}
          textTone={(i) => (live && f.skipped > 0 && i >= skippedFrom && i < f.i! ? 'ok' : foundWindow(i) ? { tone: 'ok', fill: 'outline' } : null)}
          patternState={(k) => (!live ? 'idle' : k < f.j ? 'done' : k === f.j ? (f.verdict === 'differ' ? 'bad' : 'active') : 'idle')}
          textPointers={live ? [{ i: f.i!, label: 'i', tone: 'info' }] : []}
          patternPointers={
            live && shift !== null
              ? [
                  { i: shift + f.j, label: 'j', tone: 'violet', id: 'j' },
                  ...(f.to !== null ? [{ i: shift + f.to, label: `lps[${f.j - 1}] = ${f.to}`, tone: 'violet' as const, id: 'to' }] : []),
                ]
              : []
          }
        />
        <CodePanel title="The loop" lines={MATCH_CODE} active={live ? f.line : null} />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every comparison is counted from the run you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
