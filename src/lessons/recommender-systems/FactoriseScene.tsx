import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { factoriseCaption, rmse2 } from './captions';
import { DATA } from './facts';
import { runMf, type MfConfig } from './mf';
import { EPOCHS_MAX, FACTOR_DEFAULT, LAMBDA_MAX, RATE_MAX, RATE_MIN } from './settings';
import { buildProblem, type Edits } from './problem';
import { RatingGrid } from './RatingGrid';

const FACTOR_OPTIONS = [1, 2, 3, 4, 5, 6].map((k) => ({ value: k, label: String(k) }));

export function FactoriseScene({ picker, edits }: { picker: ReactNode; edits: Edits }) {
  const [factors, setFactors] = useState<number>(FACTOR_DEFAULT.factors);
  const [lambda, setLambda] = useState<number>(FACTOR_DEFAULT.lambda);
  const [learningRate, setLearningRate] = useState<number>(FACTOR_DEFAULT.learningRate);
  const [epochs, setEpochs] = useState<number>(FACTOR_DEFAULT.epochs);
  const [showTruth, setShowTruth] = useState<boolean>(FACTOR_DEFAULT.showTruth);
  const problem = useMemo(() => buildProblem(DATA, edits), [edits]);
  const run = useMemo(() => runMf(problem, { factors, lambda, learningRate, epochs, seed: FACTOR_DEFAULT.seed }), [problem, factors, lambda, learningRate, epochs]);
  const cfg: MfConfig = { factors, lambda, learningRate, epochs, seed: FACTOR_DEFAULT.seed };
  const caption = factoriseCaption(run, cfg);
  const curve = (values: readonly number[]) => values.map((v, e) => [e, v] as [number, number]);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Training RMSE" value={rmse2(run.train[epochs])} color="var(--info)" sub={`${problem.train.length} ratings`} />
          <Stat label="Held-out RMSE" value={rmse2(run.test[epochs])} color="var(--violet)" sub={`${problem.test.length} cells it never saw`} />
          <Stat label="Lowest held-out" value={rmse2(run.test[run.bestEpoch])} sub={`at epoch ${run.bestEpoch}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'training RMSE', shape: 'line' },
            { color: 'var(--violet)', label: 'held-out RMSE; violet cells are predictions', shape: 'line' },
            { color: 'var(--ok)', label: 'truth shown: within 0.5', shape: 'square' },
            { color: 'var(--orange)', label: 'between', shape: 'square' },
            { color: 'var(--bad)', label: 'off by 1.5 or more', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Latent factors" value={factors} onChange={setFactors} options={FACTOR_OPTIONS} />
          <Toggle label="Held-out truth" value={showTruth} onChange={setShowTruth} off="Hidden" on="Shown" />
        </>,
        <>
          <Slider label="Epochs" value={epochs} min={0} max={EPOCHS_MAX} step={5} onChange={setEpochs} />
          <Slider label="Regularisation" value={lambda} min={0} max={LAMBDA_MAX} step={0.01} onChange={setLambda} format={(v) => v.toFixed(2)} />
          <Slider label="Learning rate" value={learningRate} min={RATE_MIN} max={RATE_MAX} step={0.01} onChange={setLearningRate} format={(v) => v.toFixed(2)} />
        </>,
      ]}
    >
      <div className="rec-stage stage-pad">
        <Box>
          <SectionTitle hint="stochastic gradient descent, one rating per update">Error after each epoch</SectionTitle>
          <div className="rec-plot">
            <Plot2D x={{ domain: [0, EPOCHS_MAX], label: 'epoch' }} y={{ domain: [0, 1.5], label: 'RMSE' }} width={356} ariaLabel="Training and held-out RMSE per epoch">
              <Curve points={curve(run.train)} tone="info" />
              <Curve points={curve(run.test)} tone="violet" />
              <VLine at={epochs} tone="hi" />
            </Plot2D>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="the same matrix; blank cells are now predicted">Predictions fill the gaps</SectionTitle>
          <RatingGrid problem={problem} mode={{ kind: 'predictions', run }} showTruth={showTruth} ariaLabel="Observed ratings and predictions" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={DATA.seed}>invented ratings, hidden rank-2 structure plus noise</Provenance>
          <Provenance kind="simulated" seed={FACTOR_DEFAULT.seed}>seeded factorisation trained live by SGD</Provenance>
          <Provenance kind="toy">few observed ratings and many factors overfit; real systems use far more data</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
