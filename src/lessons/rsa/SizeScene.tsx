import { useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { HLine, Plot2D, Points, Curve, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { humanDuration, power } from '../../core/format';
import { factorCaption, group, sizeCaption } from './frames';
import {
  BITS_MAX, BITS_MIN, BITS_STEP, DIVISIONS_PER_SECOND, FACTORING_RECORDS, GNFS_RECORD_BITS, bitLength, factorToy, trialDivisionsLog2, trialSeconds, type FactorRun, type RsaKey,
} from './model';
import { ToyNote } from './Parts';

const AGE_OF_UNIVERSE_S = 13.8e9 * 365.25 * 86400;
/** log₁₀ seconds on the y axis: from a nanosecond-ish floor to past 10³⁰⁰. */
const LOG_Y: [number, number] = [-9, 300];
const DEFAULT_BITS = 2048;

export function SizeScene({ picker, rsaKey }: { picker: ReactNode; rsaKey: RsaKey }) {
  const [bits, setBits] = useState(DEFAULT_BITS);
  const [run, setRun] = useState<FactorRun | null>(null);
  const setCaption = useSetCaption();
  const toyBits = bitLength(rsaKey.n);

  useIntroCaption(<>This key's n = {group(rsaKey.n)} is only {toyBits} bits. Press "Factor n" to break it the slow, obvious way.</>, [rsaKey]);

  const factor = () => {
    const r = factorToy(rsaKey.n);
    setRun(r);
    setCaption(factorCaption(rsaKey, r));
  };
  const changeBits = (b: number) => {
    setBits(b);
    setCaption(sizeCaption(b), { quiet: true });
  };
  const logAt = (b: number) => Math.log10(trialSeconds(b));

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Toy n" value={group(rsaKey.n)} color="var(--info)" sub={`${toyBits} bits`} />
          <Stat label={`Divisions for ${bits} bits`} value={<>≈ {power(trialDivisionsLog2(bits))}</>} sub="trial division, extrapolated" />
          <Stat label="At 10⁹ a second" value={humanDuration(trialSeconds(bits))} sub="trial division only, illustrative" />
          <Stat label="GNFS record so far" value={`${GNFS_RECORD_BITS} bits`} color="var(--bad)" sub="RSA-250, factored in 2020" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'trial division only: projected time (extrapolated)', shape: 'line' },
            { color: 'var(--bad)', label: 'sizes actually factored (512, 768, 829 bits; on the axis, position = size only)', shape: 'dot' },
            { color: 'var(--hi)', label: 'the size picked', shape: 'dot' },
            { color: 'var(--dim)', label: 'age of the universe, 2048 bits', shape: 'line' },
            { color: 'var(--ok)', label: 'factors found' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={factor}>Factor n</Button>
          <Slider label="Key size" value={bits} min={BITS_MIN} max={BITS_MAX} step={BITS_STEP} onChange={changeBits} format={(b) => `${b} bits`} />
        </>,
      ]}
    >
      <div className="stage-pad rsa-size">
        <Box className="rsa-factor">
          <p className="rsa-big">n = {group(rsaKey.n)}</p>
          {run ? (
            <p>
              <span className="hl ok">{run.factors.map((f) => group(f)).join(' × ')}</span> after {group(run.steps)} trial-division steps.
              Those are p and q, so d follows at once.
            </p>
          ) : (
            <p className="rsa-sub">Trial division tries 2, 3, 5, 7 … up to √n.</p>
          )}
        </Box>
        <div className="rsa-plot">
          <Plot2D
            x={{ domain: [BITS_MIN, BITS_MAX], label: 'bits in n' }}
            y={{ domain: LOG_Y, ticks: 4, label: 'seconds (log)', format: (v) => power(v, 10) }}
            ariaLabel={`Projected trial-division time: ${humanDuration(trialSeconds(bits))} for ${bits} bits; sizes up to ${GNFS_RECORD_BITS} bits have actually been factored`}
          >
            <HLine at={Math.log10(AGE_OF_UNIVERSE_S)} label="age of the universe" tone="dim" />
            <VLine at={BITS_MAX} label="2048" tone="dim" />
            <Curve fn={logAt} tone="violet" dashed />
            <Points
              data={FACTORING_RECORDS.map((r) => ({ x: r.bits, y: LOG_Y[0], tone: 'bad' as const }))}
              pointLabel={(i) => `${FACTORING_RECORDS[i].name}, ${FACTORING_RECORDS[i].bits} bits, factored in ${FACTORING_RECORDS[i].year}`}
            />
            <Points data={[{ x: bits, y: logAt(bits), tone: 'hi' }]} />
          </Plot2D>
        </div>
        <Hint block>
          The curve is trial division only, extrapolated, at an illustrative {group(DIVISIONS_PER_SECOND)} divisions a second: it makes
          small keys look far safer than they are. Real attackers use the general number field sieve, which has publicly factored
          RSA-155 (512 bits) in 1999, RSA-768 in 2009 and the 829-bit RSA-250 in 2020, with about 2,700 CPU-core-years.
          2048-bit moduli are still out of reach; NIST asks for at least 2048 bits today and 3072 for protection beyond 2030.
        </Hint>
        <ToyNote />
      </div>
    </StageFrame>
  );
}
