import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { renoFrames, seg } from './captions';
import { QueueChart, RttChart, WindowChart } from './Charts';
import { initialReno, RENO_ROUNDS } from './init';
import { LinkControls } from './LinkControls';
import { bdpOf, bufferOf, simulate, thresholdOf, type LinkSetup } from './model';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the window (segments sent per round)' },
      { color: 'var(--info)', label: 'the queue in the buffer' },
      { color: 'var(--ok)', label: 'the pipe: BDP' },
      { color: 'var(--bad)', label: 'where the buffer overflows (dashed), and a loss (dashed tick)' },
      { color: 'var(--orange)', label: 'a timeout (dashed tick)' },
      { color: 'var(--amber)', label: 'slow start, along the x axis' },
      { color: 'var(--sky)', label: 'congestion avoidance, along the x axis' },
    ]}
  />
);

export function RenoScene({ picker }: { picker: ReactNode }) {
  const [link, setLink] = useState<LinkSetup>(initialReno);
  const recs = useMemo(() => simulate('reno', link, RENO_ROUNDS), [link]);
  const frames = useMemo(() => renoFrames(recs, link), [recs, link]);
  const player = usePlayer(frames, { interval: 450, autoplay: true });
  const now = Math.min(recs.length - 1, Math.round(player.frame.now));
  const r = recs[now];
  const losses = recs.filter((x) => x.round <= now && x.event !== null).length;
  const patch = (p: Partial<LinkSetup>) => setLink((l) => ({ ...l, ...p }));

  return (
    <StageFrame
      height={720}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Window" value={seg(r.sent)} sub={r.saturated ? 'held at the cap' : `${r.phase === 'slow-start' ? 'slow start' : 'congestion avoidance'}, round ${now}`} color="var(--hi)" />
          <Stat label="Threshold ssthresh" value={Number.isFinite(r.ssthresh) ? seg(r.ssthresh) : 'none yet'} sub="where slow start hands over" />
          <Stat label="Queue" value={seg(r.queue)} color="var(--info)" sub={`of ${bufferOf(link)} segments of buffer`} />
          <Stat label="Round trip" value={`${Math.round(r.rttMs)} ms`} sub={`base ${link.rttMs} ms`} />
          <Stat label="Link used" value={pct(r.util)} sub={`${losses} loss ${losses === 1 ? 'event' : 'events'} so far`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Loss reaction" value={link.timeouts} off="fast retransmit (duplicate ACKs)" on="timeout (whole window lost)" onChange={(timeouts) => patch({ timeouts })} />
        </>,
        <LinkControls key="link" link={link} onChange={patch} show={{ buffer: true, loss: true, seed: link.loss > 0 }} />,
        <Button key="reset" onClick={() => setLink(initialReno())}>
          Reset
        </Button>,
      ]}
    >
      <div className="cc-stage stage-pad">
        <Box>
          <SectionTitle hint={`BDP ${seg(bdpOf(link))} segments, buffer ${bufferOf(link)}, overflow above ${seg(thresholdOf(link))}`}>Reno on one bottleneck link</SectionTitle>
          <div className="cc-charts">
            <WindowChart recs={recs} upTo={now} link={link} ariaLabel="Reno's window per round trip, with the pipe size and the overflow line" />
            <QueueChart recs={recs} upTo={now} link={link} ariaLabel="Segments waiting in the buffer per round trip" />
            <RttChart recs={recs} upTo={now} link={link} ariaLabel="The round trip time the sender measures per round trip" />
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={link.loss > 0 ? link.seed : undefined}>a per-round-trip fluid model: no ACK clocking, no delayed ACKs, no SACK</Provenance>
          <Provenance kind="from-memory">initial window 10 (RFC 6928) and the halving and restart rules (RFC 5681): verify</Provenance>
          <Provenance kind="illustrative">a segment is 1500 bytes here; the receiver window is not modelled (a sender uses the smaller of cwnd and rwnd)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
