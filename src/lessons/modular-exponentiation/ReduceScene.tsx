import { useMemo, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { power } from '../../core/format';
import { digitSeries, digitsOf } from './modpow';
import { OPENING } from './presets';
import { TripleFields } from './TripleFields';
import { useTriple } from './useTriple';

const fmt = (x: number) => (x >= 1e9 ? x.toExponential(2) : x.toLocaleString('en-US'));

/** Scene 2: why reduce at every step. The digits of the full power double with each bit; the reduced value stays inside the modulus. */
export function ReduceScene({ picker }: { picker: ReactNode }) {
  const state = useTriple(OPENING.reduce);
  const { base, exponent, modulus } = state.triple;
  const series = useMemo(() => digitSeries(base, exponent, modulus), [base, exponent, modulus]);
  const last = series[series.length - 1];
  const worstReduced = Math.max(...series.map((p) => p.reduced));
  const modulusDigits = digitsOf(modulus);
  const top = Math.max(10, last.unreduced * 2);
  const bitsTotal = series.length;

  return (
    <StageFrame
      height={430}
      intro={
        <>
          Without reducing, {base.toString()}^{exponent.toString()} would be written out with about {fmt(last.unreduced)} digit{last.unreduced === 1 ? '' : 's'}; with a reduction after every step the running value never needed more than {worstReduced} digit{worstReduced === 1 ? '' : 's'} (the modulus has {modulusDigits}).
        </>
      }
      introKey={`${base}-${exponent}-${modulus}`}
      stats={
        <Stats>
          <Stat label="Full power, written out" value={fmt(last.unreduced)} color="var(--bad)" sub="digits: floor(e log10 base) + 1" />
          <Stat label="Reduced running value" value={worstReduced} color="var(--ok)" sub={`digits at most; the modulus has ${modulusDigits}`} />
          <Stat label="Bits in the exponent" value={bitsTotal} color="var(--info)" sub="one point on the plot per bit" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'digits of the full power so far', shape: 'line' },
            { color: 'var(--ok)', label: 'digits of the reduced running value', shape: 'line' },
          ]}
        />
      }
      controls={[picker, <TripleFields key="fields" state={state} />]}
    >
      <div className="me-stage stage-pad">
        <Plot2D
          x={{ domain: [1, Math.max(2, bitsTotal)], label: 'bits of the exponent processed' }}
          y={{ domain: [1, top], log: true, label: 'digits', format: (v) => power(Math.round(Math.log10(v)), 10) }}
          ariaLabel="Digits of the full power and of the reduced value after each bit of the exponent, log scale"
        >
          <Curve points={series.map((p) => [p.bits, p.unreduced] as const)} tone="bad" />
          <Curve points={series.map((p) => [p.bits, p.reduced] as const)} tone="ok" />
          <Points data={series.map((p) => ({ x: p.bits, y: p.unreduced, tone: 'bad' as const }))} r={2.5} />
          <Points data={series.map((p) => ({ x: p.bits, y: p.reduced, tone: 'ok' as const }))} r={2.5} />
        </Plot2D>
        <p className="me-note">
          Each squaring doubles the exponent of the full power, so the digit count of the full power roughly doubles with each bit, which is close to a straight climb on this log axis. The green curve stays within the modulus's size. The full-power digit counts come from the formula (checked against written-out powers for small exponents), not from computing the power.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes, not cryptography</Provenance>
        <Provenance kind="real">the reduced digit counts come from running the algorithm; the full-power counts are the log10 formula</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
