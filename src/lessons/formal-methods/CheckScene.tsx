import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { integer } from '../../core/format';
import { explorePathSteps } from '../../core/traceFrames';
import { ProcessView } from './ProcessView';
import { ProgramEditor } from './ProgramEditor';
import { MODEL_NOT_CODE, NOT_CHECKED, checkText, randomText } from './text';
import { MAX_STEPS, PETERSON, PRESETS, SEEDS_FROM, SEEDS_TO, check, defaultInvariant, initialState, randomTest, type Check, type RandomRun, type Spec, type State } from './spec';

const PROCESS_OPTIONS = [2, 3].map((n) => ({ value: n, label: `${n} processes` }));
const TRACE_MIN_WIDTH = 420;
const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the step a process is about to run' },
      { color: 'var(--violet)', label: 'a guard' },
      { color: 'var(--info)', label: 'a state on the counterexample path' },
      { color: 'var(--bad)', label: 'the violating state and its critical processes' },
      { color: 'var(--ok)', label: 'states explored, when the search finished' },
    ]}
  />
);

interface Ran { ctx: string; check: Check; random: RandomRun | { error: string } }

/** Scene 1: edit a small lock, state the property, press Check: every reachable state, and the shortest way to a bad one. */
export function CheckScene({ picker }: { picker: ReactNode }) {
  const [spec, setSpec] = useState<Spec>(PETERSON);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  const ctx = JSON.stringify(spec);
  const shown = ran?.ctx === ctx ? ran : null;
  const c = shown?.check ?? null;
  const steps = useMemo(() => (c && (c.kind === 'violation' || c.kind === 'deadlock') ? explorePathSteps(c.path) : []), [c]);
  const initial = useMemo(() => initialState(spec.n), [spec.n]);
  const loadPreset = (s: Spec) => { setSpec(s); setRefusal(null); };
  const setProcesses = (n: number) => setSpec({ ...spec, n, invariant: spec.invariant === defaultInvariant(spec.n) ? defaultInvariant(n) : spec.invariant });

  const text = c ? checkText(c, spec) : 'Edit the lock if you like, then press Check.';
  const kindColor = !c ? 'var(--dim)' : c.kind === 'holds' ? 'var(--ok)' : c.kind === 'truncated' ? 'var(--dim)' : 'var(--bad)';

  return (
    <StageFrame
      height={760}
      intro={text}
      introKey={`check|${ctx}|${c?.kind ?? ''}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Result" value={!c ? 'not run' : c.kind === 'holds' ? 'holds' : c.kind === 'truncated' ? 'cut off' : c.kind === 'refused' ? 'refused' : c.kind} color={kindColor} sub={c && c.kind !== 'refused' ? (c.kind === 'holds' ? 'exhaustive' : c.kind === 'truncated' ? 'not exhaustive' : 'shortest path') : 'press Check'} />
          <Stat label="States explored" value={c && c.kind !== 'refused' ? integer(c.states) : '–'} color={c?.kind === 'holds' ? 'var(--ok)' : 'var(--dim)'} />
          <Stat label="Path length" value={c && (c.kind === 'violation' || c.kind === 'deadlock') ? `${c.steps} steps` : '–'} color={c && (c.kind === 'violation' || c.kind === 'deadlock') ? 'var(--bad)' : 'var(--dim)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => <ChipButton key={p.id} on={JSON.stringify(p.spec) === ctx} softDisabled={false} onClick={() => loadPreset(p.spec)}>{p.label}</ChipButton>)}
        </>,
        <>
          <Segmented label="Processes" value={spec.n} onChange={setProcesses} options={PROCESS_OPTIONS} />
          <Toggle label="Deadlock check" value={spec.deadlock} onChange={(deadlock) => setSpec({ ...spec, deadlock })} off="not reported" on="report states where no step can run" />
          <Button variant="primary" onClick={() => setRan({ ctx, check: check(spec), random: randomTest(spec) })}>Check</Button>
        </>,
      ]}
    >
      <div className="fm-stage stage-pad">
        <Box>
          <SectionTitle hint={`${spec.n} processes run this program; at most ${MAX_STEPS} steps`}>The lock</SectionTitle>
          <ProgramEditor spec={spec} onChange={setSpec} refusal={refusal} onRefuse={setRefusal} />
          <TextField label="Invariant (must hold in every state)" value={spec.invariant} onChange={(invariant) => setSpec({ ...spec, invariant })} spellCheck={false} width={320} />
          <Hint block tone="faint">Guard names: me, flagMe, turn, lock{spec.n === 2 ? ', other, flagOther' : ' (other and flagOther exist only for two processes)'}. Invariant names: crit, {Array.from({ length: spec.n }, (_, p) => `crit${p}, flag${p}, pc${p}`).join(', ')}, turn, lock. Operators: numbers, true and false, + - * / %, comparisons, &amp;&amp; || !, and parentheses. Anything else is refused and nothing runs.</Hint>
        </Box>
        {c && (
          <Box>
            <SectionTitle hint="every reachable state, breadth first">The check</SectionTitle>
            <p className="fm-note" role="status">{checkText(c, spec)}</p>
            {(c.kind === 'violation' || c.kind === 'deadlock') && (
              <WideRegion minWidth={TRACE_MIN_WIDTH}>
                <TracePlayer<State> initial={initial} steps={steps} label="Steps of the shortest counterexample" renderState={(s) => <ProcessView spec={spec} state={s} />} />
              </WideRegion>
            )}
            {shown && <p className="fm-note">{randomText(shown.random)}</p>}
            <p className="fm-note">{NOT_CHECKED}</p>
          </Box>
        )}
        <Box>
          <SectionTitle hint="a model checker looks at the model, not at your code">How to read a pass</SectionTitle>
          <p className="fm-note">{MODEL_NOT_CODE} A pass means the property holds in every reachable state of this small model, for this many processes; it is not a proof about a real program built from it.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={`${SEEDS_FROM} to ${SEEDS_TO}`}>the random leg runs 200 seeded schedules of the same interpreter; the exhaustive leg visits every reachable state</Provenance>
          <Provenance kind="toy">a guarded-command language written for this lesson; it is not TLA+ syntax</Provenance>
          <Provenance kind="from-memory">Peterson&apos;s algorithm (1981): set my flag, give the other the turn, wait while the other&apos;s flag is up and it is the other&apos;s turn; verify against the original paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
