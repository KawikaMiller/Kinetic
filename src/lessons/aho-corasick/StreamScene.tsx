import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle, Hint } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { scanFrames } from './frames';
import { linksFor } from './links';
import { BROKEN_CASES, brokenReport } from './model';
import { PatternEditor } from './PatternEditor';
import { TrieGraph } from './TrieGraph';
import { usePatterns } from './usePatterns';
import { useTextField } from './useTextField';

const STEP_MS = 800;
const TEXT_CELL_PX = 28;
const TEXT_PRESETS = ['ushers', 'hishers'] as const;

/** Scene 3: the token streams through the text, following failure links on a missing edge and reporting matches through output links. */
export function StreamScene({ picker }: { picker: ReactNode }) {
  const state = usePatterns();
  const field = useTextField();
  const { machine } = state;
  const { text } = field;
  const [outputLinksOn, setOutputLinksOn] = useState(true);
  const run = useMemo(() => scanFrames(machine, text, outputLinksOn), [machine, text, outputLinksOn]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const broken = useMemo(() => (outputLinksOn ? null : brokenReport()), [outputLinksOn]);
  const step = f.step;
  const inMatch = (i: number) => f.found.some((m) => i >= m.start && i <= m.end);
  const links = linksFor(machine, f);
  const width = Math.max(320, text.length * TEXT_CELL_PX);

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Letters read" value={f.reads} color="var(--hi)" sub={`of ${text.length}`} />
          <Stat label="Failure follows" value={f.follows} color="var(--info)" sub="a miss sends the token to a shorter string" />
          <Stat label="Matches" value={f.found.length} color="var(--ok)" sub={f.found.length ? f.found.map((m) => `${m.pattern} ${m.start}-${m.end}`).join(', ') : 'none yet'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the token: the state the scan is in', shape: 'square' },
            { color: 'var(--info)', label: 'a failure link being followed', shape: 'line' },
            { color: 'var(--violet)', label: 'other failure links (links to the root are not drawn)', shape: 'line' },
            { color: 'var(--ok)', label: 'an output link, and a green outline round the letters of a match', shape: 'line' },
            { color: 'var(--info)', label: 'a letter already read (tinted blue)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PatternEditor state={state} />
        </>,
        <>
          <TextField label={`Text (1 to 24 letters)`} value={field.draft} onChange={field.set} maxLength={24} width={220} spellCheck={false} />
          {TEXT_PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={text === p} onClick={() => field.set(p)}>{p}</ChipButton>
          ))}
          <Toggle label="Output links" value={!outputLinksOn} onChange={(off) => setOutputLinksOn(!off)} off="On" on="Off (broken)" />
          <Hint tone={field.error ? 'bad' : 'faint'}><span role="status">{field.error ?? 'Play or step through the text; the caption says what each step does.'}</span></Hint>
        </>,
      ]}
    >
      <div className="ac-stage stage-pad">
        <TrieGraph
          machine={machine}
          links={links}
          nodeMark={(id) => (id === f.state ? { tone: 'hi', fill: 'solid' } : step && step.kind === 'follow' && id === step.from ? { tone: 'info', fill: 'tint' } : null)}
          edgeMark={(from, to) => (step?.kind === 'move' && step.from === from && step.to === to ? { tone: 'hi' } : null)}
          reveal={step?.kind === 'follow' ? [f.state, step.from] : [f.state]}
          ariaLabel="The trie with the token and the link being followed"
        />
        <WideRegion minWidth={width} label="The text: scroll sideways to see all of it" gutter={{ top: 8, bottom: 30, x: 4 }} reveal={{ from: Math.max(0, f.i) / text.length, to: (Math.max(0, f.i) + 1) / text.length }}>
          <ArrayStrip
            values={text.split('')}
            showIndex
            fontSize={13}
            cellMax={TEXT_CELL_PX + 6}
            cellState={(i) => (i === f.i ? 'active' : 'idle')}
            cellTone={(i) => (inMatch(i) ? { tone: 'ok', fill: 'outline' } : f.i >= 0 && i < f.i ? 'info' : null)}
            pointers={f.i >= 0 ? [{ i: f.i, label: 'i', tone: 'info' }] : []}
          />
        </WideRegion>
        {broken && (
          <div className="ac-witness" role="note">
            <b>Output links are off.</b> Seed-free witness: {broken.witness.text} reports {broken.witness.reported.map((m) => `${m.pattern} at ${m.start} to ${m.end}`).join(' and ')} and
            misses {broken.witness.missed.map((m) => `${m.pattern} at ${m.start} to ${m.end}`).join(', ')}: a pattern that ends here as a suffix of the state&apos;s string is missing.
            Over the {BROKEN_CASES} seeded pattern sets it fails on {broken.failing} of {broken.cases} ({((broken.failing / broken.cases) * 100).toFixed(1)}%), lowest failing seed {broken.lowestFailingSeed}.
          </div>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every step and count comes from the scan you are watching</Provenance>
        {broken && <Provenance kind="simulated" seed={`0 to ${BROKEN_CASES - 1}`}>seeded pattern sets for the broken-mode rate</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
