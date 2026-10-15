import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Button, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pointsText, powerCaption, repeatCaption } from './frames';
import {
  ALPHA, BASELINE, LIFT, REPEAT_DEFAULT, REPLICATES, VISITORS_EXPONENT, pHistogram, replicate, sampleSizePerArm, visitorsAt, type Replicated,
} from './model';
import { pctText, sig } from '../../core/format';
import { SeedField } from '../../components/SeedField';

const BINS = 20;
const POWER_OPTIONS: Option<number>[] = [
  { value: 0.8, label: '80% power' },
  { value: 0.9, label: '90% power' },
];
const MDE = { min: 0.25, max: 3, step: 0.25 } as const;
const HEADROOM = 1.2;

interface Result {
  key: string;
  replicated: Replicated;
}

export function RepeatScene({ picker }: { picker: ReactNode }) {
  const [baseline, setBaseline] = useState(REPEAT_DEFAULT.baseline);
  const [lift, setLift] = useState(REPEAT_DEFAULT.lift);
  const [exponent, setExponent] = useState(REPEAT_DEFAULT.exponent);
  const [seed, setSeed] = useState(REPEAT_DEFAULT.seed);
  const [mde, setMde] = useState(REPEAT_DEFAULT.mde);
  const [power, setPower] = useState(REPEAT_DEFAULT.power);
  const setCaption = useSetCaption();

  const visitors = visitorsAt(exponent);
  const spec = { baseline, lift, visitors, seed };
  const key = `${baseline}|${lift}|${visitors}|${seed}`;
  const [result, setResult] = useState<Result>(() => ({ key, replicated: replicate(spec) }));
  const current = result.key === key ? result.replicated : null;
  const needed = sampleSizePerArm(baseline / 100, mde / 100, ALPHA, power);

  useIntroCaption(
    current ? repeatCaption(spec, current.below, REPLICATES) : <>Settings changed: press the button to replicate this experiment {REPLICATES.toLocaleString('en-US')} times.</>,
    [current, key],
  );

  const run = () => {
    const replicated = replicate(spec);
    setResult({ key, replicated });
    setCaption(repeatCaption(spec, replicated.below, REPLICATES));
  };

  const counts = current ? pHistogram(current.pValues, BINS) : [];
  const share = (c: number) => c / (current?.pValues.length || 1);
  const top = Math.max(0.1, ...counts.map(share)) * HEADROOM;

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat
            label={lift === 0 ? 'False positives' : 'Power'}
            value={current ? pctText(current.below) : '–'}
            sub={current ? [`p < ${ALPHA} in ${REPLICATES.toLocaleString('en-US')} experiments`, lift === 0 ? 'the threshold promises 5%' : `true lift ${pointsText(lift / 100)}`] : ['press the button']}
          />
          <Stat
            label="Visitors needed"
            value={needed.toLocaleString('en-US')}
            sub={[`per arm, to detect ${baseline}% → ${sig(baseline + mde)}%`, `at α = 0.05 and ${pctText(power, 0)} power`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'p-values below 0.05 (the first bin)' },
            { color: 'var(--muted)', label: 'the other p-values' },
            { color: 'var(--dim)', label: 'α = 0.05', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Baseline conversion" value={baseline} {...BASELINE} format={(v) => `${v}%`} onChange={setBaseline} />
          <Slider label="True lift of B" value={lift} {...LIFT} format={(v) => pointsText(v / 100)} onChange={setLift} />
          <Slider label="Visitors per arm" value={exponent} {...VISITORS_EXPONENT} format={() => visitors.toLocaleString('en-US')} onChange={setExponent} />
        </>,
        <>
          <Button variant="primary" onClick={run}>Run {REPLICATES.toLocaleString('en-US')} experiments</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Slider label="Smallest lift worth detecting" value={mde} {...MDE} format={(v) => pointsText(v / 100)} onChange={(v) => { setMde(v); setCaption(powerCaption(baseline, v, power)); }} />
          <Segmented label="Power wanted" value={power} onChange={(v) => { setPower(v); setCaption(powerCaption(baseline, mde, v)); }} options={POWER_OPTIONS} />
        </>,
      ]}
    >
      <div className="ab-stage stage-pad">
        {current ? (
          <Plot2D
            x={{ domain: [0, 1], label: 'p-value', ticks: 5 }}
            y={{ domain: [0, top], label: 'share of experiments', format: (v) => `${Math.round(v * 100)}%`, ticks: 4 }}
            ariaLabel={`Histogram of ${current.pValues.length} p-values; ${pctText(current.below)} are below 0.05`}
          >
            <Bars bars={counts.map((c, i) => ({ x0: i / BINS, x1: (i + 1) / BINS, y: share(c), tone: (i + 1) / BINS <= ALPHA ? 'violet' as const : 'muted' as const }))} />
            <VLine at={ALPHA} tone="dim" label="0.05" />
          </Plot2D>
        ) : (
          <Box className="ab-stale">
            <SectionTitle>Settings changed</SectionTitle>
            <p>The histogram belongs to the old settings, so it is cleared. Press &quot;Run {REPLICATES.toLocaleString('en-US')} experiments&quot; to draw it again.</p>
          </Box>
        )}
        <Box className="ab-calc">
          <SectionTitle hint="n per arm = (z(1 − α/2) + z(power))² × [p₁(1 − p₁) + p₂(1 − p₂)] ÷ δ²">Power calculator</SectionTitle>
          <p>
            From {baseline}% to {sig(baseline + mde)}% needs about <b>{needed.toLocaleString('en-US')}</b> visitors per arm. Halving the lift to {pointsText(mde / 200)} needs{' '}
            <b>{sampleSizePerArm(baseline / 100, mde / 200, ALPHA, power).toLocaleString('en-US')}</b>: roughly four times as many, because n grows like 1/δ².
          </p>
        </Box>
        <Hint tone="muted" className="ab-note">With no true lift, p-values are spread flat between 0 and 1, so about 5% land below 0.05 whatever n is. With a real lift they pile up near 0.</Hint>
        <div className="ab-chips">
          <Provenance kind="simulated" seed={seed}>{REPLICATES.toLocaleString('en-US')} replicated experiments from this seed</Provenance>
          <Provenance kind="illustrative">no real experiment is shown</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
