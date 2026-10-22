import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { sig } from '../../core/format';
import { powerCaption, type PowerReading } from './captions';
import { ALPHAS, BASELINE, LIFT, LONG_WINDOW_DAYS, POWERS, POWER_SEED, RUNS, analyticPower, checkLift, daysToReach, parseTraffic, sampleSize, simulatedPower } from './power';
import { OPENING } from './opening';

/** The simulated power counts as confirming the asked power when it lands within this many (as a share, 0.05 is five points). */
const POWER_TOLERANCE = 0.05;

/** Scene 3: the sample size a test needs at your traffic, and a simulation that checks it. */
export function PowerScene({ picker }: { picker: ReactNode }) {
  const [baseline, setBaseline] = useState(OPENING.power.baseline);
  const [lift, setLift] = useState(OPENING.power.lift);
  const [alpha, setAlpha] = useState(OPENING.power.alpha);
  const [power, setPower] = useState(OPENING.power.power);
  const [trafficText, setTrafficText] = useState(OPENING.power.traffic);

  const traffic = parseTraffic(trafficText);
  const trafficValue = traffic.ok ? traffic.value : null;
  const liftError = checkLift(baseline, lift);
  const refusal = liftError ?? (traffic.ok ? null : traffic.error);
  const spec = useMemo(() => ({ baseline, lift, alpha, power }), [baseline, lift, alpha, power]);
  const reading = useMemo<PowerReading | null>(() => {
    if (liftError !== null || trafficValue === null) return null;
    const n = sampleSize(spec);
    return { spec, n, days: daysToReach(n, trafficValue), perDay: trafficValue, simulated: simulatedPower(spec, n, POWER_SEED) };
  }, [spec, liftError, trafficValue]);

  return (
    <StageFrame
      height={600}
      intro={powerCaption(reading, refusal)}
      introKey={[baseline, lift, alpha, power, trafficText]}
      stats={
        <Stats>
          <Stat label="Visitors per arm" value={reading ? reading.n.toLocaleString('en-US') : '–'} color="var(--hi)" sub="about: the common two-proportion formula" />
          <Stat label="Time to reach it" value={reading ? `${sig(reading.days, 3)} days` : '–'} color={reading && reading.days > LONG_WINDOW_DAYS ? 'var(--bad)' : undefined} sub="two arms at your daily traffic" />
          <Stat label="Power in simulation" value={reading ? `${Math.round(reading.simulated * 100)}%` : '–'} color={reading && Math.abs(reading.simulated - power) <= POWER_TOLERANCE ? 'var(--ok)' : undefined} sub={reading && Math.abs(reading.simulated - power) > POWER_TOLERANCE ? `${RUNS.toLocaleString('en-US')} seeded tests; not within 5 points of the ${Math.round(power * 100)}% asked: the normal approximation is rough near 0% or 100%` : `${RUNS.toLocaleString('en-US')} seeded tests at that size`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'power as visitors per arm grow', shape: 'line' }, { color: 'var(--hi)', label: 'the size you need', shape: 'line' }, { color: 'var(--ok)', label: 'the power you asked for', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Baseline conversion" value={baseline} {...BASELINE} format={(v) => `${v}%`} onChange={setBaseline} />
          <Slider label="Smallest lift to detect" value={lift} {...LIFT} format={(v) => `${v} points`} onChange={setLift} />
        </>,
        <>
          <Segmented label="Significance level" options={ALPHAS.map((a) => ({ value: a, label: String(a) }))} value={alpha} onChange={setAlpha} />
          <Segmented label="Power" options={POWERS.map((p) => ({ value: p, label: String(p) }))} value={power} onChange={setPower} />
          <TextField label="Visitors a day" value={trafficText} width={110} onChange={setTrafficText} />
        </>,
      ]}
    >
      <div className="pt-stage stage-pad">
        {refusal && <Hint tone="muted" block>{refusal}</Hint>}
        {reading && (
          <Plot2D
            x={{ domain: [0, reading.n * 2], ticks: 5, label: 'visitors per arm' }}
            y={{ domain: [0, 1], ticks: 5, label: 'power', format: (v) => `${Math.round(v * 100)}%` }}
            ariaLabel={`Power against visitors per arm: ${Math.round(analyticPower(spec, reading.n) * 100)}% at ${reading.n}`}
          >
            <HLine at={power} tone="ok" label={`${Math.round(power * 100)}%`} />
            <VLine at={reading.n} tone="hi" />
            <Curve fn={(n) => analyticPower(spec, n)} tone="info" />
          </Plot2D>
        )}
        {reading && (
          <Hint tone="muted" block>
            At these inputs the same test needs about {sig(sampleSize({ ...spec, lift: lift / 2 }) / reading.n, 2)} times as many visitors ({sampleSize({ ...spec, lift: lift / 2 }).toLocaleString('en-US')} an arm) if the lift you care about is half as big. The size is the common textbook form with these assumptions: two-sided test, equal arms, one look at the end (no peeking), a normal approximation and every visitor counted once; equally standard forms differ by a few visitors.
          </Hint>
        )}
        <Hint tone="muted" block>
          For the sampling behind p-values and power, see <Link to="/lesson/hypothesis-testing-ab">hypothesis testing and A/B experiments</Link>.
        </Hint>
        <ProvenanceRow>
          <ClaimLabel kind="standard">n per arm = 2 (z for alpha/2 plus z for power) squared x p(1 - p) / lift squared, with the average of the two rates for p</ClaimLabel>
          <Provenance kind="simulated" seed={POWER_SEED}>{RUNS.toLocaleString('en-US')} tests; counts are a normal approximation of the binomial (the smallest test here has 75 visitors an arm)</Provenance>
          <Provenance kind="invented">the baseline, lift and traffic are yours; no real product is shown</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
