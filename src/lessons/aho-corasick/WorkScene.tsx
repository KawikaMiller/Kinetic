import { useMemo, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { naiveScan, runMachine } from './model';
import { PatternEditor } from './PatternEditor';
import { usePatterns } from './usePatterns';
import { useTextField } from './useTextField';

const TEXT_PRESETS = ['ushers', 'hishers'] as const;

/** Scene 4: the work of one pass, counted, beside the naive cost of one scan per pattern. */
export function WorkScene({ picker }: { picker: ReactNode }) {
  const state = usePatterns();
  const field = useTextField();
  const { machine, patterns } = state;
  const { text } = field;
  const run = useMemo(() => runMachine(machine, text), [machine, text]);
  const naive = useMemo(() => naiveScan(patterns, text), [patterns, text]);
  const lookups = run.reads + run.follows;
  const top = Math.max(1, lookups, naive.compared);

  return (
    <StageFrame
      height={420}
      intro={
        <>
          One pass over {run.reads} letters costs {run.reads} reads and {run.follows} failure {run.follows === 1 ? 'follow' : 'follows'}, {lookups} table steps in all.
          Scanning once per pattern compares {naive.compared} characters. The two counts use different units, so compare their growth, not just the numbers.
        </>
      }
      introKey={`work|${patterns.join()}|${text}`}
      stats={
        <Stats>
          <Stat label="Letters read" value={run.reads} color="var(--hi)" sub="each letter once" />
          <Stat label="Failure follows" value={run.follows} color="var(--info)" sub={`at most the letters read: ${run.reads}`} />
          <Stat label="Matches" value={run.matches.length} color="var(--ok)" sub={`the naive scan finds ${naive.matches.length}`} />
          <Stat label="Naive: characters compared" value={naive.compared} color="var(--bad)" sub={`${patterns.length} scans of the text`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'Aho-Corasick: letters read plus failure follows', shape: 'square' },
            { color: 'var(--bad)', label: 'naive: characters compared, one scan per pattern', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PatternEditor state={state} />
        </>,
        <>
          <TextField label="Text (1 to 24 letters)" value={field.draft} onChange={field.set} maxLength={24} width={220} spellCheck={false} />
          {TEXT_PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={text === p} onClick={() => field.set(p)}>{p}</ChipButton>
          ))}
          <Hint tone={field.error ? 'bad' : 'faint'}><span role="status">{field.error ?? 'Change the text or the patterns and the counts follow.'}</span></Hint>
        </>,
      ]}
    >
      <div className="ac-stage stage-pad">
        <div className="ac-bars">
          <Bar value={lookups} max={top} tone="ok" label="Aho-Corasick" trailing={lookups} />
          <Bar value={naive.compared} max={top} tone="bad" label="Naive" trailing={naive.compared} />
        </div>
        <p className="ac-note">
          Why the follows cannot outrun the reads: a follow happens while the token is below the root and moves it to a shorter string, so it lowers the depth by at least 1.
          Reading a letter raises the depth by at most 1. Starting from depth 0, the follows can therefore not exceed the letters read: {run.follows} is at most {run.reads} here.
          The passes use the same automaton whatever the number of patterns; only the building of it grows with them.
        </p>
        <p className="ac-note">
          Naive here means one scan per pattern at every alignment, stopping at the first mismatch; it counts this lesson&apos;s matcher, not a real library.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: both counts come from running the two matchers on the text above</Provenance>
        <ClaimLabel kind="standard">Aho and Corasick, 1975, named from memory</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
