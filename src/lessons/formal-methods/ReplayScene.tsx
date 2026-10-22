import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { explorePathSteps } from '../../core/traceFrames';
import { ProcessView } from './ProcessView';
import { NAIVE, check, initialState, runNaiveCode, scheduleOf, type State } from './spec';

type Replay = 'counterexample' | 'polite';
const REPLAYS: { value: Replay; label: string }[] = [
  { value: 'counterexample', label: 'the counterexample' },
  { value: 'polite', label: 'one process at a time' },
];
const POLITE_SCHEDULE = [0, 0, 1, 1];
const TRACE_MIN_WIDTH = 420;
const CODE = ['if (lock === 0) {   // step 0: check', '  lock = 1;         // step 1: take', '  /* critical section */', '}                   // step 2: release'];

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the step a process is about to run' },
      { color: 'var(--info)', label: 'a state on the path' },
      { color: 'var(--bad)', label: 'both processes critical' },
      { color: 'var(--ok)', label: 'a process that got the lock alone' },
    ]}
  />
);

const found = check(NAIVE);
const PATH = found.kind === 'violation' ? found.path : [];
const COUNTEREXAMPLE = scheduleOf(PATH);

/** Scene 3: the counterexample is a test case. Replay its schedule step by step, then run the same schedule against the lock written as code. */
export function ReplayScene({ picker }: { picker: ReactNode }) {
  const [replay, setReplay] = useState<Replay>('counterexample');
  const steps = useMemo(() => explorePathSteps(PATH), []);
  const initial = useMemo(() => initialState(NAIVE.n), []);
  const schedule = replay === 'counterexample' ? COUNTEREXAMPLE : POLITE_SCHEDULE;
  const code = runNaiveCode(schedule);
  const both = code.inside.every(Boolean);
  const outcome = both
    ? `Both processes are inside the critical section and lock = ${code.lock}: the code fails on this schedule, as the model said.`
    : `Only ${code.inside[0] ? 'P0' : code.inside[1] ? 'P1' : 'neither process'} is inside; the other found the lock taken. Lock = ${code.lock}: this schedule does not break the code.`;

  return (
    <StageFrame
      height={620}
      intro={`The shortest counterexample of the naive lock has ${PATH.length} steps. Replayed against the lock written as code, the schedule ${schedule.map((p) => `P${p}`).join(', ')}: ${outcome}`}
      introKey={`replay|${replay}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Counterexample" value={`${PATH.length} steps`} color="var(--bad)" sub="found by the explorer" />
          <Stat label="Schedule replayed" value={schedule.map((p) => `P${p}`).join(' ')} color="var(--info)" />
          <Stat label="Both inside" value={both ? 'yes' : 'no'} color={both ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      controls={[<>{picker}<Segmented label="Replay against the code" value={replay} onChange={setReplay} options={REPLAYS} /></>]}
    >
      <div className="fm-stage stage-pad">
        <Box>
          <SectionTitle hint="the shortest path to two processes in the critical section">The counterexample</SectionTitle>
          <WideRegion minWidth={TRACE_MIN_WIDTH}>
            <TracePlayer<State> initial={initial} steps={steps} label="Steps of the naive lock's counterexample" renderState={(s) => <ProcessView spec={NAIVE} state={s} />} />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="a lesson-authored pure function, not a real thread: it runs a scripted interleaving">The same schedule, against the code</SectionTitle>
          <pre className="fm-code mono" aria-label="The lock as code">{CODE.join('\n')}</pre>
          <p className="fm-note" role="status">{outcome}</p>
          <p className="fm-note">The counterexample is a test case: a concrete schedule that can be replayed against the real code to show the same final state.</p>
        </Box>
        <Box>
          <SectionTitle hint="named, not run">TLA+</SectionTitle>
          <p className="fm-note">
            TLA+ specs describe an initial state, a next-state relation and properties, and engineers check them with a model checker called TLC. Industrial use is reported in published experience reports. None of it runs here: this lesson uses its own small language.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="not-run">TLA+ and TLC are described, not run</Provenance>
          <Provenance kind="from-memory">TLC is TLA+&apos;s model checker, and the experience-report claim follows published accounts such as Newcombe et al., &quot;How Amazon Web Services Uses Formal Methods&quot; (CACM, 2015); verify against the source before relying on it</Provenance>
          <Provenance kind="scripted">the replay against the code follows a fixed schedule, not a real thread</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
