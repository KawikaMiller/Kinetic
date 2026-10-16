import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { bytes, power, sig } from '../../core/format';
import type { Tone } from '../../core/tone';
import { memoryCaption } from './captions';
import {
  DEVICE_BYTES, PARAMETER_STOPS, TOKEN_STOPS, TRAINING_BYTES_PER_PARAMETER, bytesPerParameter, forwardFlopsPerToken, memoryFigures, trainingFlops, trainingRatio, type Regime,
} from './memory';
import { memoryOpening } from './openings';

/** Decimal gigabytes: 16e9 reads "16.0 GB". */
const gb = (n: number) => bytes(n, { base: 1000 });

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'inference', label: 'Inference' },
  { value: 'training', label: 'Training (Adam, mixed precision)' },
];
const TONE: Record<string, Tone> = { weights: 'sky', gradients: 'amber', optimizer: 'orange' };

/** A big count as m x 10^e (3 significant figures) once it passes a million. */
function scientific(x: number): string {
  if (x < 1e6) return Math.round(x).toLocaleString('en-US');
  const exponent = Math.floor(Math.log10(x));
  return `${Number((x / 10 ** exponent).toPrecision(3))} × ${power(exponent, 10)}`;
}

export function MemoryScene({ picker }: { picker: ReactNode }) {
  const open = memoryOpening();
  const [stop, setStop] = useState(open.stop);
  const [regime, setRegime] = useState<Regime>(open.regime);
  const [tokenStop, setTokenStop] = useState(open.tokenStop);
  const parameters = PARAMETER_STOPS[stop];
  const tokens = TOKEN_STOPS[tokenStop];
  const figures = memoryFigures(parameters, regime);
  const perParameter = bytesPerParameter(regime);

  return (
    <StageFrame
      height={500}
      intro={memoryCaption({ parameters, regime, total: figures.total, bytesPerParameter: perParameter, fits: figures.fits, device: DEVICE_BYTES, ratio: trainingRatio() })}
      introKey={[stop, regime]}
      stats={
        <Stats>
          <Stat label="Bytes per parameter" value={perParameter} sub={regime === 'training' ? '2 + 2 + 12' : 'half-precision weights'} />
          <Stat label="Memory" value={gb(figures.total)} color={figures.fits ? undefined : 'var(--bad)'} sub={`${sig(parameters)} parameters, before activations`} />
          <Stat label="Training / inference" value={`${trainingRatio()}x`} sub={`${TRAINING_BYTES_PER_PARAMETER} bytes against ${bytesPerParameter('inference')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'weights', shape: 'square' },
            { color: 'var(--amber)', label: 'gradients', shape: 'square' },
            { color: 'var(--orange)', label: 'master weights and optimizer state', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Regime" options={REGIMES} value={regime} onChange={setRegime} />
        </>,
        <>
          <Slider label="Parameters" value={stop} min={0} max={PARAMETER_STOPS.length - 1} format={(i) => sig(PARAMETER_STOPS[i])} onChange={setStop} />
          <Slider label="Training tokens D" value={tokenStop} min={0} max={TOKEN_STOPS.length - 1} format={(i) => sig(TOKEN_STOPS[i])} onChange={setTokenStop} />
        </>,
      ]}
    >
      <div className="tv-stage stage-pad">
        <div className="tv-wide">
          <Bar
            segments={figures.perComponent.map((c) => ({ value: c.bytes, tone: TONE[c.id] }))}
            max={DEVICE_BYTES}
            height={16}
            animate={false}
            ariaLabel={`${gb(figures.total)} of an illustrative ${gb(DEVICE_BYTES)} device`}
          />
          <span className="tv-note">{figures.fits ? `Fits an illustrative ${gb(DEVICE_BYTES)} device` : `Does not fit an illustrative ${gb(DEVICE_BYTES)} device`}, before activations.</span>
        </div>
        <table className="data-table tv-table table-cards">
          <caption className="sr-only">Bytes per parameter and memory by component</caption>
          <thead><tr><th>component</th><th>bytes per parameter</th><th>memory</th></tr></thead>
          <tbody>
            {figures.perComponent.map((c) => (
              <tr key={c.id}>
                <td data-label="component">{c.label}</td>
                <td data-label="bytes per parameter">{c.bytesPerParameter}</td>
                <td data-label="memory">{gb(c.bytes)}</td>
              </tr>
            ))}
            <tr><td data-label="component"><b>total</b></td><td data-label="bytes per parameter"><b>{perParameter}</b></td><td data-label="memory"><b>{gb(figures.total)}</b></td></tr>
          </tbody>
        </table>
        <p className="tv-note">
          Activations are on top of this, and they grow with batch size and sequence length; a smaller batch, or gradient accumulation (several small batches added up before one update), trades time for activation memory.
        </p>
        <section className="tv-panel" aria-label="Compute rule of thumb">
          <h3 className="section-title">Compute: training about 6 N D, one forward token about 2 N</h3>
          <p className="tv-readout">
            N = {sig(parameters)}, D = {sig(tokens)}: training <b>{scientific(trainingFlops(parameters, tokens))}</b> floating-point operations; one forward pass of one token <b>{scientific(forwardFlopsPerToken(parameters))}</b>.
          </p>
        </section>
        <ProvenanceRow>
          <Provenance kind="illustrative">the parameter counts, token counts and the 80 GB device are made up</Provenance>
          <Provenance kind="from-memory">16 bytes per parameter (ZeRO paper, Rajbhandari et al. 2020) and 6 N D (Kaplan et al. 2020): verify against the papers</Provenance>
          <ClaimLabel kind="research">training state counted as 2 + 2 + 12 bytes in mixed precision with Adam</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
