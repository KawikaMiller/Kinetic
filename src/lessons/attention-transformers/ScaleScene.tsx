import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { scaleCaption } from './captions';
import { DK_STOPS, HIST_LIMIT, HIST_SAMPLES, KEYS, WEIGHT_DRAWS, measureScaling, type ScalingResult } from './scaling';
import { scaleOpening } from './openings';

/** Lets the "drawing the samples" hint paint before the main thread is busy (d_k = 512 takes about a second). */
const PAINT_DELAY_MS = 60;

export function ScaleScene({ picker }: { picker: ReactNode }) {
  const open = scaleOpening();
  const [stop, setStop] = useState(open.stop);
  const [result, setResult] = useState<ScalingResult>(() => measureScaling(DK_STOPS[open.stop]));
  const dk = DK_STOPS[stop];
  const stale = result.dk !== dk;

  // The samples for a new d_k are drawn after the slider has moved (the biggest takes about a second), then cached.
  useEffect(() => {
    const timer = setTimeout(() => setResult(measureScaling(dk)), PAINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dk]);

  const bars = useMemo(() => barsFromHistogram(result.histogram), [result]);
  const top = Math.max(...result.histogram.counts, 1);
  const root = Math.sqrt(result.dk);

  return (
    <StageFrame
      height={480}
      intro={scaleCaption(result)}
      introKey={[result]}
      stats={
        <Stats>
          <Stat label="Std. dev. of q·k" value={sig(result.sd)} sub={[`theory √d_k = ${sig(root)}`, `${HIST_SAMPLES.toLocaleString('en-US')} samples`]} />
          <Stat label="Largest weight, unscaled" value={result.unscaledMax.toFixed(2)} color="var(--bad)" sub={[`softmax gradient norm ${result.unscaledGrad.toFixed(2)}`, `mean of ${WEIGHT_DRAWS.toLocaleString('en-US')} draws over ${KEYS} keys`]} />
          <Stat label="Largest weight, scaled" value={result.scaledMax.toFixed(2)} color="var(--ok)" sub={[`softmax gradient norm ${result.scaledGrad.toFixed(2)}`, 'divided by √d_k']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'histogram of q·k (real samples)', shape: 'square' },
            { color: 'var(--violet)', label: '±√d_k, the theoretical standard deviation', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="d_k" value={stop} min={0} max={DK_STOPS.length - 1} format={(i) => String(DK_STOPS[i])} onChange={setStop} />
          {stale && <span className="hint" role="status">drawing the samples for d_k = {dk}…</span>}
        </>,
      ]}
    >
      <div className="at-stage stage-pad" aria-busy={stale}>
        <Plot2D
          x={{ domain: [-HIST_LIMIT, HIST_LIMIT], label: 'q · k', ticks: 5 }}
          y={{ domain: [0, top * 1.1], label: 'samples', ticks: 4 }}
          width={420}
          height={240}
          ariaLabel={`Histogram of q dot k at d_k = ${result.dk}: standard deviation ${sig(result.sd)}`}
        >
          <Bars bars={bars} tone="info" />
          <VLine at={root} tone="violet" dashed label={`+√${result.dk}`} />
          <VLine at={-root} tone="violet" dashed label={`−√${result.dk}`} />
        </Plot2D>
        <p className="at-note">
          Softmax is dominated by its biggest input. When the dot products spread out like √d_k, the biggest one wins almost alone, the weights approach one-hot, and the gradient to the other keys shrinks.
          Dividing by √d_k puts the scores back on a scale of about 1.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={result.seed}>
            {HIST_SAMPLES.toLocaleString('en-US')} random vector pairs and {WEIGHT_DRAWS.toLocaleString('en-US')} softmax draws, standard-normal entries; the same seed and d_k always give the same numbers
          </Provenance>
          <Provenance kind="toy">random vectors, not trained queries and keys: real models can differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
