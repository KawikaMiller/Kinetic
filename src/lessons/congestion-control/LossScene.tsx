import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points, VLine, HLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { lossIntro, seg } from './captions';
import { initialLoss, LOSS_CURVE_POINTS, LOSS_ROUNDS } from './init';
import { LinkControls } from './LinkControls';
import { RANGES, bdpOf, mathisWindow, renoMeanWindow, thresholdOf, type LinkSetup } from './model';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: "Reno's mean window, simulated at each loss rate on this link" },
      { color: 'var(--dim)', label: 'the Mathis relation, 1.22 / sqrt(p), dashed' },
      { color: 'var(--ok)', label: 'the pipe: BDP' },
      { color: 'var(--bad)', label: 'the loss rate you set (vertical line), and where the buffer would overflow (dashed)' },
    ]}
  />
);

/** The window (segments) range of the plot: from 1 up to a tidy power above the biggest thing shown. */
const WINDOW_AXIS = [1, 2000] as const;

export function LossScene({ picker }: { picker: ReactNode }) {
  const [link, setLink] = useState<LinkSetup>(initialLoss);
  const limit = thresholdOf(link);
  const curve = useMemo(
    () => LOSS_CURVE_POINTS.map((p) => [p, Math.max(WINDOW_AXIS[0], renoMeanWindow(p, LOSS_ROUNDS, link.seed, limit))] as const),
    [limit, link.seed],
  );
  const sim = useMemo(() => renoMeanWindow(link.loss, LOSS_ROUNDS, link.seed, limit), [link.loss, link.seed, limit]);
  const mathis = link.loss > 0 ? mathisWindow(link.loss) : null;
  const bdp = bdpOf(link);
  const util = Math.min(1, sim / bdp);
  const patch = (p: Partial<LinkSetup>) => setLink((l) => ({ ...l, ...p }));

  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={lossIntro(link, sim, mathis)}
      introKey={[link.mbps, link.rttMs, link.bufferBdp, link.loss, link.seed]}
      stats={
        <Stats>
          <Stat label="Reno's mean window" value={seg(sim)} color="var(--hi)" sub={`segments, over ${LOSS_ROUNDS.toLocaleString('en-US')} round trips`} />
          <Stat label="Mathis relation" value={mathis === null ? 'no loss' : seg(mathis)} sub="1.22 / sqrt(p), segments" />
          <Stat label="Link used" value={pct(util)} color={util < 0.5 ? 'var(--bad)' : undefined} sub={`${seg(link.mbps * util)} of ${link.mbps} Mbit/s`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setLink(initialLoss())}>Reset</Button>
        </>,
        <LinkControls key="link" link={link} onChange={patch} show={{ buffer: true, loss: true, seed: true }} />,
      ]}
    >
      <div className="cc-stage stage-pad">
        <Box>
          <SectionTitle hint="both axes are logarithmic; loss means chance loss, not a full buffer">Mean window against random loss</SectionTitle>
          <Plot2D
            x={{ domain: [1e-4, RANGES.loss.max], log: true, label: 'random loss per segment', ticks: 4, format: (v) => pct(v, v < 0.001 ? 2 : 1) }}
            y={{ domain: WINDOW_AXIS, log: true, label: 'mean window, segments', ticks: 4 }}
            ariaLabel="Reno's mean window against the random loss rate, simulated and from the Mathis relation"
          >
            <HLine at={bdp} label="BDP" tone="ok" dashed={false} />
            <HLine at={limit} label="overflow" tone="bad" />
            <Curve fn={(p) => mathisWindow(p)} tone="dim" dashed />
            <Curve points={curve} tone="hi" />
            {link.loss > 0 && <VLine at={link.loss} tone="bad" />}
            {link.loss > 0 && <Points data={[{ x: link.loss, y: Math.max(WINDOW_AXIS[0], sim), tone: 'hi' }]} />}
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={link.seed}>Reno under chance loss, per round trip, with the buffer limit; no timeouts</Provenance>
          <Provenance kind="from-memory">the Mathis relation, window about 1.22 / sqrt(p) (Mathis et al., 1997): verify</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
