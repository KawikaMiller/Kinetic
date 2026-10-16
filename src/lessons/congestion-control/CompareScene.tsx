import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { ALGO_LABEL, algoSummaryLine, compareIntro, type AlgoRun } from './captions';
import { QueueChart, WindowChart } from './Charts';
import { COMPARE_ROUNDS, initialCompare } from './init';
import { LinkControls } from './LinkControls';
import { simulate, summarise, type Algo, type LinkSetup } from './model';

const ALGOS: readonly Algo[] = ['reno', 'cubic', 'bbr'];
const Y_LABEL: Record<Algo, string> = { reno: 'window, segments', cubic: 'window, segments', bbr: 'rate, segments per base round trip' };
const NOTE: Record<Algo, string> = {
  reno: 'halves on a loss, adds one per round',
  cubic: 'a cubic curve back toward the window of the last loss',
  bbr: 'paces at its estimate of the bottleneck rate; BBRv1 shown, later versions changed the loss response',
};

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the window, or BBR\'s sending rate' },
      { color: 'var(--info)', label: 'the queue in the buffer' },
      { color: 'var(--ok)', label: 'the pipe: BDP' },
      { color: 'var(--bad)', label: 'where the buffer overflows (dashed), a loss (dashed tick)' },
      { color: 'var(--amber)', label: 'slow start or BBR startup, along the x axis' },
      { color: 'var(--pink)', label: 'BBR drain' },
      { color: 'var(--sky)', label: 'congestion avoidance or BBR ProbeBW' },
    ]}
  />
);

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [link, setLink] = useState<LinkSetup>(initialCompare);
  const runs: AlgoRun[] = useMemo(
    () =>
      ALGOS.map((algo) => {
        const recs = simulate(algo, link, COMPARE_ROUNDS);
        return { algo, recs, summary: summarise(recs), dropped: recs.reduce((s, r) => s + r.overflow, 0) };
      }),
    [link],
  );
  const patch = (p: Partial<LinkSetup>) => setLink((l) => ({ ...l, ...p }));

  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={compareIntro(link, runs)}
      introKey={[link.mbps, link.rttMs, link.bufferBdp, link.loss, link.seed]}
      stats={
        <Stats>
          {runs.map((r) => (
            <Stat key={r.algo} label={`${ALGO_LABEL[r.algo]} round trip`} value={`${Math.round(r.summary.meanRttMs)} ms`} sub={[`${pct(r.summary.meanUtil)} of the link used`, `${r.summary.lossEvents} losses reacted to`]} />
          ))}
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setLink(initialCompare())}>Reset</Button>
        </>,
        <LinkControls key="link" link={link} onChange={patch} show={{ buffer: true, loss: true, seed: link.loss > 0 }} />,
      ]}
    >
      <div className="cc-stage stage-pad">
        <div className="cc-columns">
          {runs.map((r) => (
            <Box key={r.algo}>
              <SectionTitle hint={NOTE[r.algo]}>{ALGO_LABEL[r.algo]}</SectionTitle>
              <div className="cc-charts">
                <WindowChart recs={r.recs} upTo={COMPARE_ROUNDS} link={link} yLabel={Y_LABEL[r.algo]} ariaLabel={`${ALGO_LABEL[r.algo]}: ${algoSummaryLine(r)}`} />
                <QueueChart recs={r.recs} upTo={COMPARE_ROUNDS} link={link} ariaLabel={`${ALGO_LABEL[r.algo]}: segments waiting in the buffer per round trip`} />
              </div>
              <p className="cc-note">{algoSummaryLine(r)}</p>
            </Box>
          ))}
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={link.loss > 0 ? link.seed : undefined}>the same link and seed for all three; a per-round-trip fluid model</Provenance>
          <Provenance kind="from-memory">CUBIC C = 0.4 and beta = 0.7 (RFC 9438, earlier RFC 8312) and the BBR gains 2/ln 2, 0.75, 1.25 are from memory: verify</Provenance>
          <Provenance kind="toy">CUBIC is the basic cubic curve only: no TCP-friendly region, fast convergence or HyStart, so the CUBIC against Reno numbers here are for this model, not a general result</Provenance>
          <Provenance kind="toy">BBRv1 is shown, from the 2016 ACM Queue paper; later versions changed the loss response. ProbeRTT is named, not simulated</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
