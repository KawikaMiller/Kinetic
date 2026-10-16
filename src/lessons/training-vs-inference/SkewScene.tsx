import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pctText } from '../../core/format';
import { skewCaption } from './captions';
import { skewOpening } from './openings';
import { DRIFT_RANGE, DRIFT_STEPS, STALE_SHIFT, STALE_SPREAD, evaluationAccuracy, servedAccuracy, skewModel, type Preprocessing } from './training';

const HOW: { value: Preprocessing; label: string }[] = [
  { value: 'matching', label: 'Same as training' },
  { value: 'missing', label: 'Missing' },
  { value: 'different', label: 'Other statistics' },
];
export function SkewScene({ picker }: { picker: ReactNode }) {
  const open = skewOpening();
  const [how, setHow] = useState<Preprocessing>(open.how);
  const [drift, setDrift] = useState(open.drift);
  const model = skewModel();
  const evaluation = evaluationAccuracy(model);
  const accuracy = servedAccuracy(how, drift, model);
  const curve = useMemo(() => DRIFT_STEPS.map((d) => [d, servedAccuracy(how, d)] as [number, number]), [how]);

  return (
    <StageFrame
      height={500}
      intro={skewCaption({ how, drift, served: accuracy, evaluation })}
      introKey={[how, drift]}
      stats={
        <Stats>
          <Stat label="Offline evaluation" value={pctText(evaluation, 1)} sub="training pipeline on fresh data" />
          <Stat label="Served" value={pctText(accuracy, 1)} color={accuracy < evaluation ? 'var(--bad)' : 'var(--ok)'} sub={`same trained weights, ${how === 'matching' ? 'same' : how === 'missing' ? 'no' : 'different'} preprocessing`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'accuracy as the live data moves', shape: 'line' },
            { color: 'var(--hi)', label: 'where you are now', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Serving preprocessing" options={HOW} value={how} onChange={setHow} />
        </>,
        <>
          <Slider label="Live data moves by" value={drift} {...DRIFT_RANGE} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={setDrift} />
        </>,
      ]}
    >
      <div className="tv-stage stage-pad">
        <Plot2D x={{ domain: [DRIFT_RANGE.min, DRIFT_RANGE.max], label: 'shift of the first feature (raw units)', ticks: 5 }} y={{ domain: [0, 1], label: 'accuracy', ticks: 4, format: (v) => pctText(v, 0) }} width={380} height={230} ariaLabel={`Accuracy against drift with ${how} preprocessing: ${pctText(accuracy, 1)} now`}>
          <Curve points={curve} tone="info" />
          <Points data={[{ x: drift, y: accuracy, tone: 'hi' }]} r={5} />
        </Plot2D>
        <p className="tv-note">
          The weights never change here. With the pipeline missing, the model gets raw numbers it never saw; with other statistics it gets numbers rescaled by a mean {STALE_SHIFT} off and a spread {STALE_SPREAD} times too big. With the pipeline missing, every point gets the same class, so accuracy sits at 50% (chance for these two equal classes) and the curve is flat from a shift of -0.75 upward; only a larger downward shift moves some points across. Drift (the live data
          moving) is named, not taught: model evaluation and monitoring own that.
        </p>
        <ProvenanceRow>
          <Provenance kind="toy">a 2-4-1 network trained here on standardised blobs; accuracy is measured on 400 fresh seeded points</Provenance>
          <Provenance kind="simulated">the skew and the drift are computed from real predictions, not scripted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
