import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { plainTone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { rolloutCaption } from './captions';
import {
  CHANGES, CONSUMERS, ORDERS, PRODUCERS, changeById, directionHolds, rollout, totalFailures, type ChangeId, type OrderId, type ServiceId, type State,
} from './rollout';

const STEP_MS = 1100;
const GANTT_MIN_WIDTH = 480;
const SERVICE_IDS: readonly ServiceId[] = [...PRODUCERS, ...CONSUMERS];
const LANES = [...SERVICE_IDS.map((id) => ({ id, label: id })), { id: 'messages', label: 'failed' }];
const ORDER_OPTIONS = ORDERS.map((o) => ({ value: o.id, label: o.label }));

interface RolloutFrame extends Frame {
  state: State;
}

/** One bar per schema a service runs, from the state it moved there to the next move (or the end). */
function bars(states: readonly State[], hops: number): GanttBar[] {
  const end = states.length;
  const lanes = SERVICE_IDS.flatMap((id) => {
    const moves = [0, ...Array.from({ length: hops }, (_, h) => states.findIndex((s) => s.upgraded === id && s.hop === h + 1))];
    return moves.map((from, v): GanttBar => ({ id: `${id}-${v}`, lane: id, start: from, end: moves[v + 1] ?? end, tone: plainTone(v), label: `v${v + 1}` }));
  });
  const failed = states.map((s): GanttBar => ({ id: `m-${s.index}`, lane: 'messages', start: s.index, end: s.index + 1, tone: s.failures ? 'bad' : 'ok', label: s.failures ? String(s.failures) : '' }));
  return [...lanes, ...failed];
}

export function RolloutScene({ picker }: { picker: ReactNode }) {
  const [change, setChange] = useState<ChangeId>('add-required');
  const [order, setOrder] = useState<OrderId>('consumers-first');
  const states = useMemo(() => rollout(change, order), [change, order]);
  const frames = useMemo<RolloutFrame[]>(() => states.map((state, i) => ({ state, say: rolloutCaption(states, i) })), [states]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.state;
  const sofar = totalFailures(states.slice(0, now.index + 1));
  const hops = changeById(change).chain.length - 1;
  const ganttBars = useMemo(() => bars(states, hops), [states, hops]);

  const backward = directionHolds(change, 'backward');
  const forward = directionHolds(change, 'forward');
  const yesNo = (b: boolean) => (b ? 'yes' : 'no');

  return (
    <StageFrame
      player={player}
      height={480}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a message decoded' },
            { color: 'var(--bad)', label: 'a message failed' },
            { color: 'var(--amber)', label: 'schema 1' },
            { color: 'var(--pink)', label: 'schema 2' },
            ...(hops > 1 ? [{ color: 'var(--sky)', label: 'schema 3' }] : []),
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Failed so far" value={plural(sofar, 'message')} color={sofar ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="This state" value={`${now.failures} of ${now.messages.length}`} color={now.failures ? 'var(--bad)' : 'var(--ok)'} sub={now.upgraded ? `after ${now.upgraded} moved` : 'before any upgrade'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <div className="se-chips" role="group" aria-label="The change">
            {CHANGES.map((c) => <ChipButton key={c.id} tone="info" on={change === c.id} onClick={() => setChange(c.id)}>{c.label}</ChipButton>)}
          </div>
        </>,
        <>
          <Segmented label="Upgrade order" value={order} onChange={setOrder} options={ORDER_OPTIONS} />
        </>,
      ]}
    >
      <div className="stage-pad se">
        <WideRegion minWidth={GANTT_MIN_WIDTH} label="Upgrade timeline: scroll sideways to see all of it">
          <GanttLanes lanes={LANES} bars={ganttBars} domain={[0, states.length]} now={now.index} size="md" labelWidth={56} ariaLabel="Which schema each service runs over the rollout" />
        </WideRegion>
        <div className="se-pair">
          <Box className="se-grid">
            <SectionTitle weight="regular" hint="each producer sends to each consumer">Messages in this state</SectionTitle>
            <CellGrid
              rows={PRODUCERS.length}
              cols={CONSUMERS.length}
              rowLabels={PRODUCERS}
              colLabels={CONSUMERS}
              size="md"
              ariaLabel="Whether each producer's message decodes at each consumer"
              cell={(r, c) => {
                const m = now.messages[r * CONSUMERS.length + c];
                return { tone: m.failed ? 'bad' : 'ok', fill: 'tint', text: m.failed ? 'fail' : 'ok', intensity: 0.28 };
              }}
              cellTitle={(r, c) => now.messages[r * CONSUMERS.length + c].error ?? 'decoded'}
            />
          </Box>
          <Box className="se-verdict">
            <SectionTitle weight="regular">What the run shows</SectionTitle>
            {player.atEnd ? (
              <p>
                {`${changeById(change).label}: new readers read old data: ${yesNo(backward)}. Old readers read new data: ${yesNo(forward)}. `}
                {`${ORDERS.find((o) => o.id === order)!.label} sent ${plural(totalFailures(states), 'message')} into a decode failure over ${plural(hops * 6, 'upgrade')}.`}
              </p>
            ) : (
              <p className="empty-note">Play to the end to see the verdict for this order.</p>
            )}
          </Box>
        </div>
        <div className="se-chips">
          <Provenance kind="simulated">three producers and three consumers; every message is really encoded and decoded</Provenance>
          <Provenance kind="scripted">the services upgrade one at a time in the order you pick, nothing random</Provenance>
        </div>
        <Hint block>
          Real rollouts overlap: messages already in flight, retries and slow services keep old versions alive longer than any plan says (see <code>deployment-strategies</code> for the rollout shapes).
        </Hint>
      </div>
    </StageFrame>
  );
}
