import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { exhaustiveText, truncatedText } from '../../core/checkPhrases';
import { integer, power } from '../../core/format';
import { explorePathSteps } from '../../core/traceFrames';
import { StackView } from './StackView';
import {
  MAX_OPS, MAX_THREADS, NODES, OPS, PRESETS, addOp, hazardWhy, initialState, replay, removeLastOp, search, stepThread,
  type Mode, type Op, type StackState,
} from './stack';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'plain', label: 'plain CAS' },
  { value: 'tagged', label: 'tagged head' },
  { value: 'hazard', label: 'hazard pointers' },
];
const MODE_NOTE: Record<Mode, string> = {
  plain: 'plain CAS: the head is a node, and a CAS succeeds when the head is the node it saw.',
  tagged: 'tagged head: the head is a pair (node, counter), every successful CAS adds 1, and a CAS must match both.',
  hazard: 'hazard pointers: a thread publishes the node it is about to read, re-checks the head, and a free of a published node is deferred (epoch-based reclamation is named, not modelled).',
};
const THREAD_COUNTS = [2, 3].map((n) => ({ value: n, label: `${n} threads` }));
const TRACE_MIN_WIDTH = 420;
const TAG_WRAP_8 = 2 ** 8;

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the operation a thread is on' },
      { color: 'var(--info)', label: 'a node a thread holds or a pointer it remembers' },
      { color: 'var(--violet)', label: 'the free list and retired nodes, the tag' },
      { color: 'var(--bad)', label: 'a corrupted node' },
    ]}
  />
);

const bounds = (threads: number) => `${threads} threads, at most ${MAX_OPS} operations each, ${NODES.length} nodes`;

/** Scene 2: a Treiber stack. Build programs, interleave by hand, or ask the explorer for the shortest corruption. */
export function StackScene({ picker }: { picker: ReactNode }) {
  const [programs, setPrograms] = useState<readonly (readonly Op[])[]>(PRESETS[0].programs);
  const [mode, setMode] = useState<Mode>('plain');
  const [picks, setPicks] = useState<number[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [found, setFound] = useState<{ ctx: string; result: ReturnType<typeof search> } | null>(null);
  const ctx = `${JSON.stringify(programs)}|${mode}`;
  const cfg = useMemo(() => ({ mode }), [mode]);
  const run = useMemo(() => replay(programs, cfg, picks), [programs, cfg, picks]);
  const result = found?.ctx === ctx ? found.result : null;
  const steps = useMemo(() => (result?.violation ? explorePathSteps(result.violation.path) : []), [result]);
  const initial = useMemo(() => initialState(programs), [programs]);
  const why = result ? hazardWhy(programs, cfg, result) : null;
  const state: StackState = run.state;

  const edit = (next: readonly (readonly Op[])[]) => { setPrograms(next); setPicks([]); setRefusal(null); };
  const add = (t: number, op: Op) => {
    const r = addOp(programs[t], op);
    if (!r.ok) { setRefusal(`T${t + 1}: ${r.message}`); return; }
    setRefusal(null);
    edit(programs.map((p, i) => (i === t ? r.ops : p)));
  };
  const resultLine = result
    ? result.violation ? `Violated: the shortest path has ${result.violation.path.length} steps. ${result.violation.message}.`
      : result.truncated ? `${truncatedText(result.states)}.` : `${exhaustiveText(result.states, bounds(programs.length))}: no corruption.`
    : null;
  const intro = run.broken ? `${run.broken.message}. That is the first failing check, after step ${run.broken.atStep}.` : resultLine ?? 'Build the programs, then interleave them by hand, or press Find the corruption.';

  return (
    <StageFrame
      height={680}
      intro={intro}
      introKey={`stack|${ctx}|${picks.join('')}|${result ? result.states : ''}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Steps taken" value={run.steps.length} color="var(--info)" sub={run.broken ? `broke at step ${run.broken.atStep}` : 'invariant holds so far'} />
          <Stat
            label="Search"
            value={result ? (result.violation ? `${result.violation.path.length} steps` : `${integer(result.states)} states`) : 'not run'}
            color={result ? (result.violation ? 'var(--bad)' : result.truncated ? 'var(--dim)' : 'var(--ok)') : 'var(--dim)'}
            sub={result ? (result.violation ? 'shortest corrupting schedule' : result.truncated ? 'truncated: not exhaustive' : 'exhaustive, no violation') : 'press Find the corruption'}
          />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Mode" value={mode} onChange={(m) => { setMode(m); setPicks([]); }} options={MODE_OPTIONS} />
          <Button onClick={() => setPicks([])}>Reset</Button>
        </>,
        <>
          {PRESETS.map((p) => <ChipButton key={p.id} on={JSON.stringify(programs) === JSON.stringify(p.programs)} onClick={() => edit(p.programs)}>{p.label}</ChipButton>)}
          <Segmented label="Threads" value={programs.length} onChange={(n) => edit(n > programs.length ? [...programs, []] : programs.slice(0, n))} options={THREAD_COUNTS} />
        </>,
        <>
          {programs.map((_, t) => <Button key={t} softDisabled={!stepThread(programs, cfg, state, t)} onClick={() => { if (stepThread(programs, cfg, state, t)) setPicks([...picks, t]); }}>run T{t + 1} next</Button>)}
          <Button variant="primary" onClick={() => setFound({ ctx, result: search(programs, cfg) })}>Find the corruption</Button>
        </>,
      ]}
    >
      <div className="lfc-stage stage-pad">
        <Box>
          <SectionTitle hint={`up to ${MAX_THREADS} threads and ${MAX_OPS} operations each`}>The programs</SectionTitle>
          <div className="lfc-threads">
            {programs.map((ops, t) => (
              <div key={t} className="lfc-card">
                <b>T{t + 1}</b>
                <span className="mono">{ops.length ? ops.join('; ') : 'no operations'}</span>
                <div className="lfc-chips">
                  {OPS.map((op) => <ChipButton key={op} size="sm" onClick={() => add(t, op)}>+ {op}</ChipButton>)}
                  <ChipButton size="sm" tone="muted" onClick={() => edit(programs.map((p, i) => (i === t ? removeLastOp(p) : p)))}>remove last</ChipButton>
                </div>
              </div>
            ))}
          </div>
          <Hint block tone={refusal ? 'bad' : 'faint'}><span role="status">{refusal ?? 'Operations: pop takes the top node into a register, push puts a register\'s node back, free returns it to the allocator, new allocates the most recently freed node and pushes it.'}</span></Hint>
          <p className="lfc-note">{MODE_NOTE[mode]}</p>
        </Box>
        <Box>
          <SectionTitle hint="step the threads by hand: the invariant is checked after every step">Interleave it yourself</SectionTitle>
          <StackView state={state} programs={programs} tagged={mode === 'tagged'} />
          {run.steps.length > 0 && <ol className="lfc-log mono" aria-label="Steps so far">{run.steps.map((x, i) => <li key={i}>{x.actor}: {x.text}</li>)}</ol>}
        </Box>
        {result && (
          <Box>
            <SectionTitle hint={resultLine ?? ''}>The search</SectionTitle>
            {why && <div className="lfc-witness" role="status">{why}</div>}
            {result.violation ? (
              <WideRegion minWidth={TRACE_MIN_WIDTH}>
                <TracePlayer<StackState> initial={initial} steps={steps} label="Steps of the shortest corrupting schedule" renderState={(s) => <StackView state={s} programs={programs} tagged={mode === 'tagged'} />} />
              </WideRegion>
            ) : (
              <p className="lfc-note">{result.truncated ? 'The search ran out of budget before it finished.' : 'No state of this bounded model breaks the invariant. Real programs have far larger state spaces.'}</p>
            )}
          </Box>
        )}
        <p className="lfc-note">The allocator hands back the most recently freed node first: that is a modelled choice, common in real allocators (from memory). A tag of 8 bits wraps after {power(8)} = {TAG_WRAP_8} successful CASes, so a narrow tag only narrows the window and a wide one closes it for practical purposes (from memory).</p>
        <ProvenanceRow>
          <Provenance kind="simulated">simulated schedules on a sequentially consistent model; real programs have far larger state spaces</Provenance>
          <Provenance kind="from-memory">the Treiber stack (1986 IBM report), the ABA problem, hazard pointers (Michael, 2004), epoch-based reclamation and the Michael-Scott queue are named from memory; verify against the papers</Provenance>
          <ClaimLabel kind="practice">tagged pointers and double-width CAS in real systems: described, not shown</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
