import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { DataPlot } from './DataPlot';
import { neuronCaption } from './captions';
import {
  CLASS_NAME, CLASS_TONE, DATA_SEED, FIT_STEPS, NEURON_DEFAULT, neuronOpening, WEIGHT_RANGE, datasetPoints, decisionLine, fitNeuron, neuronHeat, neuronOutput,
  neuronStats, xorCornerLoss, type DatasetId, type NeuronWeights,
} from './model';

const DATASET_OPTIONS: { value: DatasetId; label: string }[] = [
  { value: 'blobs', label: 'Two blobs' },
  { value: 'xor', label: 'XOR' },
];

/** A term after the first, with its sign as an operator: 0.8 reads "+ 0.8", -0.8 reads "− 0.8". */
const signed = (v: number) => (v < 0 ? `− ${sig(-v)}` : `+ ${sig(v)}`);

/** Computed once: gradient descent on the four XOR corners, which settles at ln 2. */
const CORNER_LOSS = xorCornerLoss();

export function NeuronScene({ picker }: { picker: ReactNode }) {
  const [dataset, setDataset] = useState<DatasetId>(neuronOpening().dataset);
  const [weights, setWeights] = useState<NeuronWeights>(neuronOpening().weights);
  const points = datasetPoints(dataset);
  const stats = useMemo(() => neuronStats(weights, dataset), [weights, dataset]);
  const heat = useMemo(() => neuronHeat(weights), [weights]);
  const set = (key: keyof NeuronWeights) => (v: number) => setWeights((w) => ({ ...w, [key]: v }));

  return (
    <StageFrame
      height={420}
      intro={neuronCaption(weights, dataset, stats)}
      introKey={[weights, dataset]}
      stats={
        <Stats>
          <Stat label="Loss (cross-entropy)" value={sig(stats.loss)} sub="lower is better" />
          <Stat label="Accuracy" value={pctText(stats.accuracy, 0)} sub={`best straight line: ${pctText(stats.best, 0)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: `var(--${CLASS_TONE[0]})`, label: CLASS_NAME[0], shape: 'dot' },
            { color: `var(--${CLASS_TONE[1]})`, label: CLASS_NAME[1], shape: 'dot' },
            { color: 'var(--bad)', label: 'ring: on the wrong side', shape: 'dot' },
            { color: 'var(--muted)', label: 'the line p = 0.5', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Data" options={DATASET_OPTIONS} value={dataset} onChange={setDataset} />
        </>,
        <>
          <Slider label="w1" value={weights.w1} {...WEIGHT_RANGE} format={(v) => sig(v)} onChange={set('w1')} />
          <Slider label="w2" value={weights.w2} {...WEIGHT_RANGE} format={(v) => sig(v)} onChange={set('w2')} />
          <Slider label="b" value={weights.b} {...WEIGHT_RANGE} format={(v) => sig(v)} onChange={set('b')} />
        </>,
        <>
          <Button variant="primary" onClick={() => setWeights((w) => fitNeuron(w, points, FIT_STEPS))}>Fit: {FIT_STEPS} gradient-descent steps</Button>
          <Button onClick={() => setWeights(NEURON_DEFAULT)}>Reset weights</Button>
        </>,
      ]}
    >
      <div className="nn-stage stage-pad">
        <div className="nn-formula">
          p = σ(w1·x1 + w2·x2 + b) = σ({sig(weights.w1)}·x1 {signed(weights.w2)}·x2 {signed(weights.b)})
        </div>
        <DataPlot
          points={points}
          heat={{ fn: heat }}
          wrong={(p) => (neuronOutput(weights, p.x, p.y) > 0.5 ? 1 : 0) !== p.label}
          line={decisionLine(weights)}
          ariaLabel={`Plane shaded by one neuron's output, ${datasetPoints(dataset).length} labelled points, accuracy ${pctText(stats.accuracy, 0)}`}
        />
        {dataset === 'xor' && (
          <Hint tone="muted" className="nn-note">
            On just the four corner points of XOR, gradient descent (computed here, {sig(CORNER_LOSS, 4)} at the end) settles at the loss ln 2 = {sig(Math.LN2, 4)}: the loss of answering p = 0.5 for everything.
            No setting of one neuron's weights separates XOR.
          </Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">one neuron on {points.length} seeded points (data seed {DATA_SEED}); fitted here in your browser</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
