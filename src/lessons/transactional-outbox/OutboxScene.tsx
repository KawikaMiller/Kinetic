import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Provenance, ProvenanceRow, Segmented, TextField, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { outboxFrames, outboxIntro, outcomeSummary } from './captions';
import { addOrder, initialOutbox, outboxSetupOf } from './init';
import { OUTBOX_LEGEND, OutboxPanels, OutboxStats } from './OutboxPanels';
import { FAULT_LABEL, MAX_ORDERS, runOutbox, type Fault } from './outbox';

const FAULT_OPTIONS = (['none', 'before', 'after-commit', 'relay-mid'] as Fault[]).map((f) => ({ value: f, label: FAULT_LABEL[f] }));
const PLAY_MS = 150;

export function OutboxScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialOutbox);
  const setup = useMemo(() => outboxSetupOf(state), [state]);
  const run = useMemo(() => runOutbox(setup), [setup]);
  const frames = useMemo(() => outboxFrames(run, outboxIntro(state.fault, state.dedupe), outcomeSummary(run)), [run, state.fault, state.dedupe]);
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
          <Segmented label="Crash" value={state.fault} onChange={(fault) => setState((s) => ({ ...s, fault }))} options={FAULT_OPTIONS} />
          <Toggle label="Consumer inbox" value={state.dedupe} onChange={(dedupe) => setState((s) => ({ ...s, dedupe }))} off="No dedupe" on="Skips a seen event id" />
        </>,
        <>
          <TextField label="Order amount" value={state.text} onChange={(text) => setState((s) => ({ ...s, text, refusal: null }))} onEnter={() => setState(addOrder)} width={80} spellCheck={false} />
          <Button variant="primary" onClick={() => setState(addOrder)}>Place another order</Button>
          <Button onClick={() => setState(initialOutbox())}>Reset</Button>
          <span className="ob-refusal" role="status">{state.refusal ?? `${state.amounts.length} of ${MAX_ORDERS} orders placed.`}</span>
        </>,
      ]}
    >
      <div className="ob-stage stage-pad">
        <OutboxPanels run={run} now={now} />
        <ProvenanceRow>
          <Provenance kind="simulated">a service, a toy database, a relay, a broker and a consumer on the distSim harness; crash instants fixed so each case is one exact run</Provenance>
          <Provenance kind="toy">toy database: commit order and ids modelled, not a real engine; one message to it is one atomic transaction</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
