import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { holIntro, msText } from './captions';
import { DEFAULT_LAYOUT, holRun, packetText, summariseHol, toggleLost, type StreamTimes } from './hol';
import { initialHol, type HolState } from './init';
import { WideRegion } from '../../components/WideRegion';
import { NetControls } from './NetControls';

/** Narrowest width at which the axis labels and the resend marker stay apart. */
const GANTT_MIN_WIDTH = 480;
/** Streams take plain tones that are never a verdict or the waiting colour. */
const STREAM_TONE: Record<string, Tone> = { A: 'amber', B: 'pink', C: 'sky', D: 'muted' };
const LANES = DEFAULT_LAYOUT.streams.map((s) => ({ id: s, label: `stream ${s}` }));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'stream A receiving its data' },
      { color: 'var(--pink)', label: 'stream B' },
      { color: 'var(--sky)', label: 'stream C' },
      { color: 'var(--muted)', label: 'stream D' },
      { color: 'var(--orange)', label: 'a stream waiting on an earlier hole (hatched)' },
      { color: 'var(--bad)', label: 'a lost packet, and when its resend arrives' },
    ]}
  />
);

function barsOf(streams: readonly StreamTimes[], pick: (s: StreamTimes) => number): GanttBar[] {
  return streams.flatMap((s) => {
    const done = pick(s);
    const out: GanttBar[] = [{ id: `${s.stream}-data`, lane: s.stream, start: s.first, end: s.clean, tone: STREAM_TONE[s.stream] }];
    if (done > s.clean) out.push({ id: `${s.stream}-wait`, lane: s.stream, start: s.clean, end: done, tone: 'orange', kind: 'wait' });
    return out;
  });
}

export function HolScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<HolState>(initialHol);
  const run = useMemo(() => holRun(DEFAULT_LAYOUT, st.lost, st.rttMs), [st]);
  const sum = summariseHol(run);
  const end = Math.max(...run.streams.map((s) => Math.max(s.tcp, s.quic, s.clean)), 1) * 1.05;
  const markers = st.lost.map((k, i) => ({ at: run.arrivals[k], label: i === 0 ? `packet ${k + 1} resent` : `p${k + 1}`, tone: 'bad' as const }));

  return (
    <StageFrame
      height={660}
      legend={LEGEND}
      intro={holIntro(DEFAULT_LAYOUT, st)}
      introKey={[st.rttMs, st.lost.join(',')]}
      stats={
        <Stats>
          <Stat label="Streams delayed over TCP" value={`${sum.tcpDelayed} of ${DEFAULT_LAYOUT.streams.length}`} color={sum.tcpDelayed > 0 ? 'var(--orange)' : undefined} sub={`last one done at ${msText(sum.tcpEnd)}`} />
          <Stat label="Streams delayed over QUIC" value={`${sum.quicDelayed} of ${DEFAULT_LAYOUT.streams.length}`} color={sum.quicDelayed > 0 ? 'var(--orange)' : undefined} sub={`last one done at ${msText(sum.quicEnd)}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <NetControls rttMs={st.rttMs} onRtt={(rttMs) => setSt((s) => ({ ...s, rttMs }))} />
        </>,
        <>
          <ControlGroup label="Packets: click one to lose it" inline>
            {DEFAULT_LAYOUT.packets.map((p, k) => (
              <ChipButton key={k} tone="bad" on={st.lost.includes(k)} onClick={() => setSt((s) => ({ ...s, lost: toggleLost(s.lost, k) }))}>
                {`${k + 1}: ${packetText(p)}`}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setSt(initialHol())}>Reset</Button>
        </>,
      ]}
    >
      <div className="qc-stage stage-pad">
        <Box>
          <SectionTitle hint="one connection, four streams, ten packets 10 ms apart; stream data in packet order">TCP (HTTP/2): bytes come out in order</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Streams over TCP: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={barsOf(run.streams, (s) => s.tcp)} domain={[0, end]} markers={markers} unit=" ms" axis size="sm" labelWidth={78} ariaLabel="When each stream finishes over TCP" />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="each stream is delivered in order on its own">QUIC: each stream waits only for itself</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Streams over QUIC: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={barsOf(run.streams, (s) => s.quic)} domain={[0, end]} markers={markers} unit=" ms" axis size="sm" labelWidth={78} ariaLabel="When each stream finishes over QUIC" />
          </WideRegion>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a fixed layout of ten packets; a resend arrives one round trip after the original would have</Provenance>
          <Provenance kind="illustrative">no congestion control and no second loss; the layout is a made-up example</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
