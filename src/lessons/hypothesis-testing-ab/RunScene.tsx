import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Area, Curve, Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { normalPdf } from '../../core/distributions';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { VERDICT_TONE, pText, pointsText, runCaption, verdictSays, zText } from './frames';
import {
  ALPHA, BASELINE, LIFT, RUN_DEFAULT, VISITORS_EXPONENT, Z_CRITICAL, rateA, rateB, runExperiment, runSeed, verdictKind, visitorsAt,
} from './model';

const Z_AXIS = 4;
const DENSITY_TOP = 0.45;
const INTERVAL_PAD = 0.15;

export function RunScene({ picker }: { picker: ReactNode }) {
  const [baseline, setBaseline] = useState(RUN_DEFAULT.baseline);
  const [lift, setLift] = useState(RUN_DEFAULT.lift);
  const [exponent, setExponent] = useState(RUN_DEFAULT.exponent);
  const [seed, setSeed] = useState(RUN_DEFAULT.seed);
  const [index, setIndex] = useState(0);

  const visitors = visitorsAt(exponent);
  const spec = useMemo(() => ({ baseline, lift, visitors, seed: runSeed(seed, index) }), [baseline, lift, visitors, seed, index]);
  const { arms, test } = useMemo(() => runExperiment(spec), [spec]);
  const kind = verdictKind(test, lift);

  useIntroCaption(runCaption(spec, arms, test), [spec]);

  const z = test.z;
  const edge = z === null ? null : Math.abs(z);
  const lo = test.lo;
  const hi = test.hi;
  const xs = lo === null || hi === null ? [-0.02, 0.02] : [Math.min(lo, 0), Math.max(hi, 0)];
  const pad = (xs[1] - xs[0]) * INTERVAL_PAD || 0.01;
  const tone = VERDICT_TONE[kind];

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="A converts" value={pctText(test.rateA, 2)} color="var(--sky)" sub={[`${arms.conversionsA.toLocaleString('en-US')} of ${arms.visitorsA.toLocaleString('en-US')}`]} />
          <Stat label="B converts" value={pctText(test.rateB, 2)} color="var(--amber)" sub={[`${arms.conversionsB.toLocaleString('en-US')} of ${arms.visitorsB.toLocaleString('en-US')}`]} />
          <Stat
            label="p-value"
            value={test.p === null ? 'undefined' : pText(test.p)}
            sub={test.z === null ? ['no z-test here'] : [`z = ${zText(test.z)}`, `pooled SE ${sig(test.se!, 3)}`]}
          />
          <Stat
            label="95% interval, B − A"
            value={lo === null || hi === null ? '–' : `${pointsText(lo)} to ${pointsText(hi)}`}
            sub={[`difference ${pointsText(test.diff)}`, `true lift ${pointsText(lift / 100)}`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'variant A' },
            { color: 'var(--amber)', label: 'variant B' },
            { color: 'var(--violet)', label: 'p-value area (both tails)' },
            { color: 'var(--hi)', label: 'this run', shape: 'line' },
            { color: 'var(--dim)', label: 'α = 0.05 (z = ±1.96)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Baseline conversion" value={baseline} {...BASELINE} format={(v) => `${v}%`} onChange={setBaseline} />
          <Slider label="True lift of B" value={lift} {...LIFT} format={(v) => pointsText(v / 100)} onChange={setLift} />
        </>,
        <>
          <Slider label="Visitors per arm" value={exponent} {...VISITORS_EXPONENT} format={() => visitors.toLocaleString('en-US')} onChange={setExponent} />
          <Button variant="primary" onClick={() => setIndex((i) => i + 1)}>Run again</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ab-stage stage-pad">
        <div className="ab-row">
          <Plot2D
            x={{ domain: [-Z_AXIS, Z_AXIS], label: 'z: how many standard errors apart', ticks: 5 }}
            y={{ domain: [0, DENSITY_TOP], label: 'density if there were no difference', ticks: 3 }}
            ariaLabel={z === null ? 'Normal curve; no z-test for this run' : `Normal curve; this run is at z = ${zText(z)} and p = ${pText(test.p!)}`}
          >
            {edge !== null && edge < Z_AXIS && <Area fn={(x) => normalPdf(x)} from={edge} to={Z_AXIS} tone="violet" />}
            {edge !== null && edge < Z_AXIS && <Area fn={(x) => normalPdf(x)} from={-Z_AXIS} to={-edge} tone="violet" />}
            {edge !== null && edge >= Z_AXIS && <Area fn={(x) => normalPdf(x)} from={-Z_AXIS} to={Z_AXIS} tone="violet" />}
            <Curve fn={(x) => normalPdf(x)} tone="info" />
            <VLine at={-Z_CRITICAL} tone="dim" />
            <VLine at={Z_CRITICAL} tone="dim" label="1.96" />
            {z !== null && Math.abs(z) <= Z_AXIS && <VLine at={z} tone="hi" label={`z = ${zText(z)}`} dashed={false} />}
          </Plot2D>
          <Plot2D
            x={{ domain: [xs[0] - pad, xs[1] + pad], label: 'B − A (share of visitors)', format: (v) => `${(v * 100).toFixed(1)}`, ticks: 5 }}
            y={{ domain: [0, 2], format: () => '', ticks: 1 }}
            ariaLabel={lo === null || hi === null ? 'Interval for the difference: none for this run' : `95% interval for the difference: ${pointsText(lo)} to ${pointsText(hi)}`}
          >
            <VLine at={0} tone="dim" label="no difference" />
            {lo !== null && hi !== null && <Segments segments={[{ from: [lo, 1], to: [hi, 1], tone: 'violet' }]} />}
            {lo !== null && hi !== null && <Points data={[{ x: test.diff, y: 1, tone: 'hi' }]} r={5} />}
          </Plot2D>
        </div>
        <Box className="ab-verdict">
          <SectionTitle>Verdict</SectionTitle>
          <p className={tone ? `ab-${tone}` : ''}>{test.status === 'ok' ? verdictSays(kind) : 'No verdict from this run.'}</p>
          <Hint tone="muted" block>
            Only the simulation knows whether the lift is real. A real experiment shows you the numbers on the left and never the truth.
          </Hint>
        </Box>
        <Hint tone="muted" className="ab-note">
          Frequentist two-proportion z-test at a fixed horizon: assumes independent users and one pre-registered look at the end. p = {ALPHA} is the line being tested against; p is not the chance that B is better.
        </Hint>
        <div className="ab-chips">
          <Provenance kind="simulated" seed={seed}>run {index + 1}: {visitors.toLocaleString('en-US')} simulated visitors per arm, A at {pctText(rateA(spec), 1)} and B at {pctText(rateB(spec), 1)} in truth</Provenance>
          <Provenance kind="illustrative">no real experiment is shown</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
