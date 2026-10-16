import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { firstBytes, handshakeFrames, msText } from './captions';
import { STACKS, STACK_LABEL, roundTripsBeforeRequest, schedule, timelineEnd } from './flights';
import { initialHandshake, type HandshakeState } from './init';
import { NetControls } from './NetControls';
import { WideRegion } from '../../components/WideRegion';

/** Narrowest width at which the four lanes keep their request and first-byte labels apart. */
const GANTT_MIN_WIDTH = 480;
const STACK_OPTIONS = STACKS.map((s) => ({ value: s, label: STACK_LABEL[s] }));
const LANES = STACKS.map((s) => ({ id: s, label: STACK_LABEL[s] }));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'the handshake flights, before the request can leave' },
      { color: 'var(--hi)', label: 'the first request' },
      { color: 'var(--ok)', label: 'the first byte of the response' },
      { color: 'var(--muted)', label: 'waiting for the answer (hatched)' },
    ]}
  />
);

export function HandshakeScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<HandshakeState>(initialHandshake);
  const frames = useMemo(() => handshakeFrames(st), [st]);
  const player = usePlayer(frames, { interval: 180, autoplay: true });
  const now = player.frame.now;
  const end = timelineEnd(st.rttMs, st.thinkMs);
  const fb = firstBytes(st.rttMs, st.thinkMs);
  const bars: GanttBar[] = useMemo(
    () =>
      STACKS.flatMap((stack) => {
        const s = schedule(stack, st.rttMs, st.thinkMs);
        const out: GanttBar[] = [];
        if (s.requestAt > 0) out.push({ id: `${stack}-hs`, lane: stack, start: 0, end: s.requestAt, tone: 'info' });
        out.push({ id: `${stack}-wait`, lane: stack, start: s.requestAt, end: s.firstByteAt, tone: 'muted', kind: 'wait' });
        out.push({ id: `${stack}-req`, lane: stack, start: s.requestAt, end: s.requestAt, tone: 'hi', label: 'request' });
        out.push({ id: `${stack}-fb`, lane: stack, start: s.firstByteAt, end: s.firstByteAt, tone: 'ok', label: 'first byte' });
        return out;
      }),
    [st.rttMs, st.thinkMs],
  );
  const sched = schedule(st.stack, st.rttMs, st.thinkMs);
  const shown = sched.flights.filter((f) => f.sentAt <= now);
  const idx = STACKS.indexOf(st.stack);
  const patch = (p: Partial<HandshakeState>) => setSt((s) => ({ ...s, ...p }));

  return (
    <StageFrame
      height={620}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Round trips before the request" value={roundTripsBeforeRequest(st.stack)} sub={STACK_LABEL[st.stack]} />
          <Stat label="First byte at" value={msText(fb[idx])} color="var(--ok)" sub={`${roundTripsBeforeRequest(st.stack) + 1} round trips${st.thinkMs > 0 ? ` and ${msText(st.thinkMs)} of think time` : ''}`} />
          <Stat label="Sooner than TCP + TLS 1.2 by" value={msText(fb[0] - fb[idx])} sub="round trips saved, DNS left out" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Show the messages of" value={st.stack} options={STACK_OPTIONS} onChange={(stack) => patch({ stack })} />
        </>,
        <NetControls key="net" rttMs={st.rttMs} onRtt={(rttMs) => patch({ rttMs })} thinkMs={st.thinkMs} onThink={(thinkMs) => patch({ thinkMs })} />,
        <Button key="reset" onClick={() => setSt(initialHandshake())}>
          Reset
        </Button>,
      ]}
    >
      <div className="qc-stage stage-pad">
        <Box>
          <SectionTitle hint={`${msText(st.rttMs)} round trip; each flight takes half`}>Time to the first byte, four ways</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline of the four stacks: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={barsAt(bars, now)} domain={[0, end]} now={now} unit=" ms" axis size="md" labelWidth={92} labelMinPx={40} ariaLabel="When each stack can send its request and when the first byte of the response arrives" />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="the flights sent so far, with the time each left">{STACK_LABEL[st.stack]}</SectionTitle>
          <SequenceDiagram
            actors={[{ id: 'client', label: 'client' }, { id: 'server', label: 'server' }]}
            messages={shown.map((f) => ({ id: f.id, from: f.from, to: f.from === 'client' ? 'server' : 'client', label: f.label, note: `leaves at ${msText(f.sentAt)}` }))}
            fit="shown"
            ariaLabel={`The messages of ${STACK_LABEL[st.stack]} sent so far`}
          />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">flights timed from the round trip and think time; DNS is left out</Provenance>
          <Provenance kind="not-run">shown, not run: no real handshake happens here, and real ones carry more detail</Provenance>
          <Provenance kind="from-memory">the flight counts follow RFC 8446 (TLS 1.3), RFC 9000 and RFC 9001 (QUIC) and the TLS 1.2 handshake: verify</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
