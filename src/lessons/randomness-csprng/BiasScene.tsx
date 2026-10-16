import { useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { BYTE_VALUES, RANGE, favoured, moduloCounts, rejectionCounts, rejectionLimit } from './bias';
import { biasCaption } from './captions';
import { OPENING } from './opening';

const PLOT = { width: 356, height: 220 } as const;

/** Scene 6: `byte % n` over all 256 byte values, and the rejection-sampling fix. */
export function BiasScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(OPENING.bias.range);
  const biased = moduloCounts(n);
  const fixed = rejectionCounts(n);
  const top = new Set(favoured(biased));
  const ceiling = Math.ceil(Math.max(...biased) * 1.25);
  const bar = (counts: readonly number[], tone: (i: number) => 'orange' | 'ok') => counts.map((y, i) => ({ x0: i, x1: i + 1, y, tone: tone(i) }));

  return (
    <StageFrame
      height={680}
      intro={biasCaption(n)}
      introKey={n}
      stats={
        <Stats>
          <Stat label="Hits per outcome" value={top.size ? `${Math.max(...biased)} or ${Math.min(...biased)}` : `${biased[0]}`} color={top.size ? 'var(--orange)' : 'var(--ok)'} sub={`of ${BYTE_VALUES} byte values, byte % ${n}`} />
          <Stat label="Rejection limit" value={rejectionLimit(n)} sub={`bytes at or above it are discarded: ${BYTE_VALUES - rejectionLimit(n)}`} />
          <Stat label="After rejection" value={`${fixed[0]} each`} color="var(--ok)" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'outcomes that come up more often', shape: 'square' }, { color: 'var(--ok)', label: 'unbiased', shape: 'square' }]} />}
      controls={[<>{picker}<Slider label="Range, n" value={n} min={RANGE.min} max={RANGE.max} onChange={setN} /></>]}
    >
      <div className="rn-stage stage-pad">
        <div className="rn-plots">
          <figure className="rn-figure">
            <figcaption>byte % {n}: byte values per outcome</figcaption>
            <Plot2D x={{ domain: [0, n], ticks: Math.min(n, 10), label: 'outcome' }} y={{ domain: [0, ceiling], ticks: 4, label: 'byte values' }} width={PLOT.width} height={PLOT.height} ariaLabel={`Byte values for each outcome of byte mod ${n}`}>
              <Bars bars={bar(biased, (i) => (top.has(i) ? 'orange' : 'ok'))} />
            </Plot2D>
          </figure>
          <figure className="rn-figure">
            <figcaption>after rejection sampling</figcaption>
            <Plot2D x={{ domain: [0, n], ticks: Math.min(n, 10), label: 'outcome' }} y={{ domain: [0, ceiling], ticks: 4, label: 'byte values' }} width={PLOT.width} height={PLOT.height} ariaLabel={`Byte values for each outcome after rejection sampling for n = ${n}`}>
              <Bars bars={bar(fixed, () => 'ok')} />
            </Plot2D>
          </figure>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">an exact enumeration of all 256 byte values, not a sample</Provenance>
        <ClaimLabel kind="practice">rejection sampling is the usual fix for modulo bias; many libraries provide a bounded-integer function that does it</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
