import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, ClaimLabel, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { leaseFrames, needsSummary } from './captions';
import { initialNeeds, needsReading, needsSetup, type Purpose } from './init';
import { runLease, verdictOf } from './model';
import { LEGEND, RunPanels } from './RunPanels';

const PURPOSES = [
  { value: 'efficiency' as const, label: 'Efficiency: avoid doing the job twice' },
  { value: 'correctness' as const, label: 'Correctness: protect the data' },
];
const PLAY_MS = 130;

const GUARDS = [
  { name: 'Fencing token', needs: 'Storage compares the token of each write with the highest it has applied, and remembers that number.' },
  { name: 'Conditional write (compare-and-set)', needs: 'Storage can apply a write only if the record still has the version the writer read.' },
  { name: 'Idempotent write', needs: 'The operation gives the same result when it is applied twice, so a stale repeat does no harm.' },
];

export function NeedsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialNeeds);
  const setup = useMemo(() => needsSetup(state), [state]);
  const run = useMemo(() => runLease(setup), [setup]);
  const verdict = useMemo(() => verdictOf(setup), [setup]);
  const reading = useMemo(() => needsReading(run), [run]);
  const frames = useMemo(() => leaseFrames(run, verdict, needsSummary(state.purpose, state.storeChecks, reading)), [run, verdict, state, reading]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const harmed = state.purpose === 'correctness' && reading.staleApplied > 0;

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Jobs run" value={reading.jobsRun} sub="clients that ran to the end and wrote" />
          <Stat label="Repeated work" value={Math.max(0, reading.jobsRun - 1)} color={reading.jobsRun > 1 ? 'var(--orange)' : undefined} sub="the cost of the lapse for an efficiency lock" />
          <Stat label="Stale writes applied" value={reading.staleApplied} color={reading.staleApplied > 0 ? 'var(--bad)' : undefined} sub="storage took an older lease's write" />
          <Stat label="Stale writes rejected" value={reading.rejected} color={reading.rejected > 0 ? 'var(--ok)' : undefined} sub="storage compared the token" />
          <Stat label="Data" value={harmed ? 'corrupted' : state.purpose === 'efficiency' ? 'not at stake' : 'intact'} color={harmed ? 'var(--bad)' : 'var(--ok)'} sub="for the purpose picked below" />
        </Stats>
      }
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="The lock is for" value={state.purpose} onChange={(purpose: Purpose) => setState((s) => ({ ...s, purpose }))} options={PURPOSES} />
        </>,
        <>
          <Toggle label="Storage" value={!state.storeChecks} onChange={(cannot) => setState((s) => ({ ...s, storeChecks: !cannot }))} off="Checks tokens" on="Cannot check (an outside API)" />
          <Button onClick={() => setState(initialNeeds())}>Reset</Button>
        </>,
      ]}
    >
      <div className="lf-stage stage-pad">
        <RunPanels run={run} now={now} verdict={verdict} />
        <Box>
          <SectionTitle hint="three ways to guard a write, named here and not taught">What each guard asks of storage</SectionTitle>
          <div className="lf-scroll" role="region" aria-label="Guards for a write and what each needs from storage" tabIndex={0}>
            <table className="data-table lf-table table-cards">
              <thead>
                <tr><th scope="col">Guard</th><th scope="col">What storage has to offer</th></tr>
              </thead>
              <tbody>
                {GUARDS.map((g) => (
                  <tr key={g.name}>
                    <th scope="row" data-label="Guard">{g.name}</th>
                    <td data-label="What storage has to offer">{g.needs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lf-note">
            A fencing token needs storage to take part: a resource that cannot look at a token, such as many outside APIs, cannot be fenced this way, which is what the toggle above shows.
            For correctness the lock is a hint and the storage layer is the guard; for efficiency a lapsed lease is only wasted work.
          </p>
        </Box>
        <Box>
          <SectionTitle>The Redlock debate</SectionTitle>
          <p className="lf-note">
            A published critique of the Redlock algorithm argued that a lock which relies on timing needs a fencing token to protect data, and its author published a reply. This lesson takes no side beyond the fencing argument above, which holds in the model whatever the lock service is built from.
          </p>
          <ProvenanceRow>
            <ClaimLabel kind="view">two published blog posts, from memory; read both before quoting either</ClaimLabel>
            <ClaimLabel kind="practice">Chubby and ZooKeeper-style services expose a number that grows with each lock grant; from memory, check each system&apos;s documentation</ClaimLabel>
          </ProvenanceRow>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>the first scene&apos;s cluster with fencing on and the default pause; only whether storage checks the token changes</Provenance>
          <Provenance kind="scripted">whether repeating the job is harmless is the lesson&apos;s assumption for the efficiency purpose, not something the run proves</Provenance>
          <Provenance kind="illustrative">one box stands in for a replicated lock service</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
