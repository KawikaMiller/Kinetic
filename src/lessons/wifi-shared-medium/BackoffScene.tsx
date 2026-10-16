import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { WideRegion } from '../../components/WideRegion';
import { backoffFrames } from './captions';
import { backoffStory, type BackoffSlot } from './backoff';
import { CW_MIN } from './dcf';
import { initialBackoff, type BackoffState } from './init';

const GANTT_MIN_WIDTH = 440;
const LANES = [
  { id: 'medium', label: 'the air' },
  { id: 'a', label: 'station A' },
];

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'A counting down, in idle slots (hatched)' },
      { color: 'var(--muted)', label: 'A waiting with its counter frozen, or for DIFS (hatched)' },
      { color: 'var(--hi)', label: 'A sends' },
      { color: 'var(--pink)', label: "station B's frames on the air" },
      { color: 'var(--ok)', label: 'the ACK' },
      { color: 'var(--bad)', label: 'an ACK that never came (dashed)' },
    ]}
  />
);

function barsOf(slots: readonly BackoffSlot[]): GanttBar[] {
  return slots.flatMap((s): GanttBar[] => {
    const at = { start: s.t, end: s.t + 1 };
    switch (s.medium) {
      case 'busy-other':
        return [{ id: `m${s.t}`, lane: 'medium', ...at, tone: 'pink' }, { id: `a${s.t}`, lane: 'a', ...at, tone: 'muted', kind: 'wait' }];
      case 'difs':
        return [{ id: `a${s.t}`, lane: 'a', ...at, tone: 'muted', kind: 'wait' }];
      case 'idle':
        return [{ id: `a${s.t}`, lane: 'a', ...at, tone: 'info', kind: 'wait' }];
      case 'a-sends':
        return [{ id: `m${s.t}`, lane: 'medium', ...at, tone: 'amber' }, { id: `a${s.t}`, lane: 'a', ...at, tone: 'hi' }];
      case 'ack':
        return [{ id: `m${s.t}`, lane: 'medium', ...at, tone: 'ok' }, { id: `a${s.t}`, lane: 'a', ...at, tone: 'ok' }];
      case 'ack-missing':
        return [{ id: `a${s.t}`, lane: 'a', ...at, tone: 'bad', kind: 'blocked' }];
    }
  });
}

export function BackoffScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<BackoffState>(initialBackoff);
  const story = useMemo(() => backoffStory(st.seed, st.ackLost), [st]);
  const frames = useMemo(() => backoffFrames(story), [story]);
  const player = usePlayer(frames, { interval: 600, autoplay: true });
  const slot = story.slots[player.frame.slot];
  const bars = useMemo(() => barsOf(story.slots.slice(0, player.frame.slot + 1)), [story, player.frame.slot]);
  const draws = story.draws.filter((_, i) => i === 0 || story.slots.slice(0, player.frame.slot + 1).some((s) => s.attempt === i + 1));

  return (
    <StageFrame
      height={460}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="A's counter" value={slot.counter ?? '–'} color="var(--info)" sub={`drawn from 0 to ${slot.cw}`} />
          <Stat label="Backoff drawn" value={draws[draws.length - 1]} sub={draws.length > 1 ? `second try; the first was ${draws[0]}` : 'first try'} />
          <Stat label="Contention window" value={slot.cw} sub={slot.cw === CW_MIN ? 'the starting window' : 'doubled after a missing ACK'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="The ACK" value={st.ackLost} off="comes back" on="goes missing" onChange={(ackLost) => setSt((s) => ({ ...s, ackLost }))} />
        </>,
        <>
          <SeedField seed={st.seed} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} />
          <Button onClick={() => setSt(initialBackoff())}>Reset</Button>
        </>,
      ]}
    >
      <div className="wf-stage stage-pad">
        <Box>
          <SectionTitle hint="one slot per column; the counter moves only in idle slots">Station A tries to send</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline of one station's attempt: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={bars} domain={[0, story.slots.length]} now={player.frame.slot + 1} unit=" slots" axis size="md" labelWidth={84} ariaLabel="The medium and station A, slot by slot" />
          </WideRegion>
          <p className="wf-note">
            Old shared Ethernet detected a collision while it was sending (CSMA/CD) and stopped. A radio cannot listen while it sends, and two stations can be out of each other's range, so Wi-Fi tries to avoid collisions (CSMA/CA) and infers a loss from a missing ACK.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>the backoff is drawn from the seed; the other station is scripted</Provenance>
          <Provenance kind="illustrative">abstract slots: real Wi-Fi timing has SIFS, DIFS, preambles and ACKs of other lengths</Provenance>
          <Provenance kind="from-memory">a starting window of 15 and doubling per failed try, from IEEE 802.11 (verify)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
