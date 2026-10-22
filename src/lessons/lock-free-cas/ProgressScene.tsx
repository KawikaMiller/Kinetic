import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { ADVERSARY_ROUNDS, SUSPEND_STEPS, adversaryRun, suspendedRun, type CounterKind, type Progress, type StepKind } from './counter';

type Schedule = 'suspend' | 'adversary';
const SCHEDULES: { value: Schedule; label: string }[] = [
  { value: 'suspend', label: 'suspend a thread' },
  { value: 'adversary', label: 'adversary schedule' },
];
const KIND_LABEL: Record<CounterKind, string> = { lock: 'lock-based', cas: 'CAS loop', fetch_add: 'fetch_add' };
const kindsFor = (schedule: Schedule): { value: CounterKind; label: string }[] =>
  (schedule === 'suspend' ? (['lock', 'cas', 'fetch_add'] as const) : (['cas', 'fetch_add'] as const)).map((value) => ({ value, label: KIND_LABEL[value] }));

const CELL_CLASS: Record<StepKind, string> = { ok: 'is-ok', failed: 'is-fail', wait: 'is-wait', work: 'is-work' };
const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'an increment completed' },
      { color: 'var(--bad)', label: 'a failed CAS' },
      { color: 'var(--dim)', label: 'a step spent waiting for the lock' },
      { color: 'var(--info)', label: 'a load, on the way to an increment' },
    ]}
  />
);

const run = (kind: CounterKind, schedule: Schedule): Progress => (schedule === 'suspend' ? suspendedRun(kind) : adversaryRun(kind));

function verdict(kind: CounterKind, schedule: Schedule, p: Progress): string {
  if (schedule === 'suspend') {
    if (kind === 'lock') return `T1 holds the lock and is suspended. After ${SUSPEND_STEPS} steps T2 has completed ${p.completed[1]} increments: it did not complete within ${SUSPEND_STEPS} steps.`;
    return `T1 is suspended in the middle of its increment. T2 completed ${p.completed[1]} increments in ${SUSPEND_STEPS} steps.`;
  }
  if (kind === 'cas') return `In ${ADVERSARY_ROUNDS} rounds T1 failed ${p.failed[0]} times and completed ${p.completed[0]} increments, while T2 completed ${p.completed[1]}. A thread completed in each round, and T1 got nothing in ${ADVERSARY_ROUNDS} rounds.`;
  return `On the same schedule each fetch_add finishes in one step: T1 needed ${p.t1Steps} step for its first increment and completed ${p.completed[0]} in ${ADVERSARY_ROUNDS} rounds, T2 ${p.completed[1]}.`;
}

/** Scene 3: lock-free is not wait-free. The same two threads under a suspension and under an adversary schedule. */
export function ProgressScene({ picker }: { picker: ReactNode }) {
  const [schedule, setSchedule] = useState<Schedule>('suspend');
  const [kindPicked, setKind] = useState<CounterKind>('lock');
  const kind: CounterKind = schedule === 'adversary' && kindPicked === 'lock' ? 'cas' : kindPicked;
  const p = run(kind, schedule);
  const lock = suspendedRun('lock');
  const cas = adversaryRun('cas');
  const fetchAdd = adversaryRun('fetch_add');
  const text = verdict(kind, schedule, p);

  return (
    <StageFrame
      height={520}
      intro={text}
      introKey={`${kind}|${schedule}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="T1 completed" value={p.completed[0]} color={p.completed[0] ? 'var(--ok)' : 'var(--dim)'} sub={schedule === 'suspend' ? 'suspended' : `in ${ADVERSARY_ROUNDS} rounds`} />
          <Stat label="T2 completed" value={p.completed[1]} color={p.completed[1] ? 'var(--ok)' : 'var(--bad)'} sub={schedule === 'suspend' ? `in ${SUSPEND_STEPS} steps` : `in ${ADVERSARY_ROUNDS} rounds`} />
          <Stat label="Failed CAS" value={p.failed[0] + p.failed[1]} color={p.failed[0] ? 'var(--bad)' : 'var(--dim)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Schedule" value={schedule} onChange={setSchedule} options={SCHEDULES} />
          <Segmented label="Counter" value={kind} onChange={setKind} options={kindsFor(schedule)} />
        </>,
      ]}
    >
      <div className="lfc-stage stage-pad">
        <Box>
          <SectionTitle hint={`${KIND_LABEL[kind]} counter, ${schedule === 'suspend' ? 'T1 suspended' : 'adversary schedule'}`}>The run</SectionTitle>
          <div className="lfc-lanes" role="list" aria-label="Steps in order, T1 on the top row and T2 on the bottom row">
            {p.steps.map((s, i) => (
              <div key={i} className="lfc-col" role="listitem" title={s.text} aria-label={s.text}>
                <span className={`lfc-cell ${s.thread === 1 ? CELL_CLASS[s.kind] : 'is-none'}`}>{s.thread === 1 ? 'T1' : ''}</span>
                <span className={`lfc-cell ${s.thread === 2 ? CELL_CLASS[s.kind] : 'is-none'}`}>{s.thread === 2 ? 'T2' : ''}</span>
              </div>
            ))}
          </div>
          <p className="lfc-note">{text}</p>
        </Box>
        <Box>
          <SectionTitle hint="three guarantees, each checkable against a run">What the runs show</SectionTitle>
          <ul className="lfc-list">
            <li><b>Blocking (a lock):</b> a suspended holder can stop the others. Lock-based, T1 suspended: T2 completed {lock.completed[1]} increments within {SUSPEND_STEPS} steps.</li>
            <li><b>Lock-free:</b> whenever the threads keep running, some thread&apos;s operation completes, though one thread can lose every round. CAS loop, adversary schedule: T2 completed {cas.completed[1]}, T1 completed {cas.completed[0]} after {cas.failed[0]} failed CAS in {ADVERSARY_ROUNDS} rounds.</li>
            <li><b>Wait-free:</b> each thread completes in a bounded number of its own steps. fetch_add, same schedule: T1 needed {fetchAdd.t1Steps} step and completed {fetchAdd.completed[0]} in {ADVERSARY_ROUNDS} rounds.</li>
          </ul>
          <p className="lfc-note">Obstruction-free (a thread that runs alone finishes) is named, not shown.</p>
        </Box>
        <Hint block tone="muted">Both schedules are fixed scripts, not searches: the adversary is told to pick this order. The run lengths ({SUSPEND_STEPS} steps, {ADVERSARY_ROUNDS} rounds) are fixed.</Hint>
        <ProvenanceRow>
          <Provenance kind="scripted">the suspension and the adversary schedule are scripted</Provenance>
          <Provenance kind="simulated">simulated schedules on a sequentially consistent model</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
