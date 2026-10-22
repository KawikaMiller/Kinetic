import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { CAS_PRESETS, MAX_THREADS, MIN_THREADS, casRun, casStep, executionStats, firstAttempt, type CasState } from './counter';

const COUNTS = [MIN_THREADS, MAX_THREADS].map((n) => ({ value: n, label: `${n} threads` }));
const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the thread whose step just ran' },
      { color: 'var(--ok)', label: 'a successful CAS' },
      { color: 'var(--bad)', label: 'a failed CAS' },
      { color: 'var(--info)', label: 'the value a thread remembers' },
    ]}
  />
);

const nextText = (s: CasState, t: number): string => {
  const th = s.threads[t];
  return th.phase === 'done' ? 'done' : th.phase === 'load' ? 'next: load x' : `next: cas(x, ${th.old}, ${th.old + 1})`;
};

/** Scene 1: a shared counter updated by a CAS loop; the learner picks which thread runs next, and the page counts every schedule. */
export function CasScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(2);
  const [picks, setPicks] = useState<number[]>([]);
  const run = useMemo(() => casRun(n, picks), [n, picks]);
  const stats = useMemo(() => [executionStats(2), executionStats(3)], []);
  const first = useMemo(() => [firstAttempt(2), firstAttempt(3)], []);
  const s = run.state;
  const last = run.steps[run.steps.length - 1];
  const retriesOf = (t: number) => run.steps.filter((x) => x.actor === `T${t + 1}` && x.failed).length;

  const press = (t: number) => { if (casStep(s, t)) setPicks([...picks, t]); };
  const intro = last
    ? `${last.actor}: ${last.text}. x is ${s.x}; ${s.ok} successful CAS, ${s.failed} failed.`
    : 'Each thread runs: old = load x, then cas(x, old, old + 1), and retries if the CAS fails. Pick which thread runs next.';

  return (
    <StageFrame
      height={560}
      intro={intro}
      introKey={`cas|${n}|${picks.join('')}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="x" value={s.x} color="var(--info)" sub={`${n} increments wanted`} />
          <Stat label="Successful CAS" value={s.ok} color="var(--ok)" />
          <Stat label="Failed CAS (retries)" value={s.failed} color={s.failed ? 'var(--bad)' : 'var(--dim)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Threads" value={n} onChange={(v) => { setN(v); setPicks([]); }} options={COUNTS} />
          <Button onClick={() => setPicks([])}>Reset</Button>
        </>,
        <>
          {CAS_PRESETS.map((p) => <ChipButton key={p.id} onClick={() => setPicks(p.picks(n))}>{p.label}</ChipButton>)}
          {s.threads.map((_, t) => <Button key={t} softDisabled={!casStep(s, t)} onClick={() => press(t)}>run T{t + 1} next</Button>)}
        </>,
      ]}
    >
      <div className="lfc-stage stage-pad">
        <div className="lfc-threads">
          {s.threads.map((th, t) => (
            <div key={t} className={`lfc-card${last?.actor === `T${t + 1}` ? ' is-now' : ''}`}>
              <b>T{t + 1}</b>
              <span className="mono">{nextText(s, t)}</span>
              <span className="lfc-seen mono">remembers old = {th.phase === 'cas' ? th.old : '–'}</span>
              <span className="lfc-seen">retries so far: {retriesOf(t)}</span>
            </div>
          ))}
        </div>
        <ol className="lfc-log mono" aria-label="Steps so far">
          {run.steps.map((x, i) => <li key={i} className={x.failed ? 'is-fail' : x.text.includes('succeeds') ? 'is-ok' : ''}>{x.actor}: {x.text}</li>)}
        </ol>
        <Box>
          <SectionTitle hint="every schedule of the CAS loop, from the explorer">All executions</SectionTitle>
          <table className="lfc-table">
            <thead><tr><th>Threads</th><th>Executions</th><th>0 retries</th><th>1</th><th>2</th><th>3</th><th>x at the end</th></tr></thead>
            <tbody>
              {stats.map((r) => (
                <tr key={r.threads}>
                  <td>{r.threads}</td><td>{integer(r.executions)}</td>
                  {[0, 1, 2, 3].map((k) => <td key={k}>{r.byRetries[k] === undefined ? '–' : integer(r.byRetries[k])}</td>)}
                  <td>{r.finalValues.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lfc-note">Exhaustive: {stats.map((r) => `${r.threads} threads, ${integer(r.states)} states`).join('; ')}, none cut off. The count of executions is for this step size (a load and a CAS are separate steps, the add is a local step), which is a different step size from the six-step read-add-write in race conditions, so its numbers differ.</p>
        </Box>
        <Box>
          <SectionTitle hint="each thread tries once: the CAS retries are the lost updates of an unlocked counter">First attempts against an unlocked counter</SectionTitle>
          <table className="lfc-table">
            <thead><tr><th>Threads</th><th>Interleavings</th><th>CAS fails at least once</th><th>No retry</th><th>Unlocked keeps every update</th><th>Same set</th></tr></thead>
            <tbody>
              {first.map((r) => (
                <tr key={r.threads}>
                  <td>{r.threads}</td><td>{r.interleavings}</td><td>{r.retrying}</td><td>{r.interleavings - r.retrying}</td><td>{r.unlockedKeepsAll}</td><td>{r.sameSet ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lfc-note">For 2 threads, {first[0].retrying} of the {first[0].interleavings} interleavings retry once, and they are the {first[0].retrying} where an unlocked read-add-write loses an update. A failed CAS is the update the unlocked version would have lost, noticed in time.</p>
        </Box>
        <Hint block tone="muted">Every step here is atomic and in order: the ordering of the CAS itself is a memory ordering question, not this lesson&apos;s.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated">simulated schedules on a sequentially consistent model; real programs have far larger state spaces</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
