import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Provenance, ProvenanceRow, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { outboxFrames, pollIntro, pollSummary } from './captions';
import { initialPoll, pollSetupOf } from './init';
import { OUTBOX_LEGEND, OutboxPanels, OutboxStats } from './OutboxPanels';
import { ORDERING_LABEL, runOutbox, type Ordering, type RelayMode } from './outbox';

const RELAY_OPTIONS: { value: RelayMode; label: string }[] = [
  { value: 'cursor', label: 'Poll id > last seen' },
  { value: 'rescan', label: 'Poll with a re-scan margin' },
  { value: 'log', label: 'Read the commit log' },
];
const ORDERING_OPTIONS = (['t1-first', 't2-first'] as Ordering[]).map((o) => ({ value: o, label: ORDERING_LABEL[o] }));
const PLAY_MS = 150;

export function PollScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialPoll);
  const setup = useMemo(() => pollSetupOf(state), [state]);
  const run = useMemo(() => runOutbox(setup), [setup]);
  const frames = useMemo(() => outboxFrames(run, pollIntro(state.relay), pollSummary(run)), [run, state.relay]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;

  return (
    <StageFrame
      height={520}
      player={player}
      stats={<OutboxStats run={run} now={now} />}
      legend={OUTBOX_LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Relay reads" value={state.relay} onChange={(relay) => setState((s) => ({ ...s, relay }))} options={RELAY_OPTIONS} />
        </>,
        <>
          <Segmented label="Interleaving" value={state.ordering} onChange={(ordering) => setState((s) => ({ ...s, ordering }))} options={ORDERING_OPTIONS} />
          <Button onClick={() => setState(initialPoll())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ob-stage stage-pad">
        <OutboxPanels run={run} now={now} />
        <ProvenanceRow>
          <Provenance kind="simulated">two transactions that hold their ids 41 and 42 while they are open, and a relay that polls every 50 ms</Provenance>
          <Provenance kind="toy">toy database: the commit order and ids are modelled, not a real engine</Provenance>
          <ClaimLabel kind="practice">a sequence or auto-increment id is handed out when a row is inserted, not when its transaction commits, in many databases; verify against your database&apos;s documentation</ClaimLabel>
          <Provenance kind="from-memory">mitigations named, not run: read from the log (change data capture), poll with a safety margin and re-scan (this lesson&apos;s margin is 10 ids), or use a commit order the database guarantees</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
