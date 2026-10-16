import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { neighbourCaption, rmse2 } from './captions';
import { DATA, referenceFor } from './facts';
import { MIN_OVERLAP_MAX, scoreNeighbours } from './neighbours';
import { EditsStrip } from './EditsStrip';
import { buildProblem, meanBaselineRmse, type Edits } from './problem';
import { NEIGHBOUR_DEFAULT, REFERENCE_MF } from './settings';

const BAR_MAX_RMSE = 1.5;

export function NeighbourScene({ picker, edits, setEdits }: { picker: ReactNode; edits: Edits; setEdits: (e: Edits) => void }) {
  const [minOverlap, setMinOverlap] = useState<number>(NEIGHBOUR_DEFAULT.minOverlap);
  const problem = useMemo(() => buildProblem(DATA, edits), [edits]);
  const score = useMemo(() => scoreNeighbours(problem, minOverlap), [problem, minOverlap]);
  const mf = useMemo(() => referenceFor(problem).test[REFERENCE_MF.epochs], [problem]);
  const baseline = useMemo(() => meanBaselineRmse(problem), [problem]);
  const caption = neighbourCaption(score, mf, minOverlap, baseline);

  return (
    <StageFrame
      height={400}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Neighbours: held-out RMSE" value={rmse2(score.rmse)} color="var(--info)" sub={`min overlap ${minOverlap}`} />
          <Stat label="Cells with a neighbour" value={`${Math.round(score.coverage * 100)}%`} color={score.coverage < 0.5 ? 'var(--bad)' : undefined} sub="the rest fall back to the user's mean" />
          <Stat label="Factorisation: held-out RMSE" value={rmse2(mf)} color="var(--violet)" sub={`${REFERENCE_MF.factors} factors, lambda ${REFERENCE_MF.lambda}, ${REFERENCE_MF.epochs} epochs`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'neighbours', shape: 'square' }, { color: 'var(--violet)', label: 'factorisation', shape: 'square' }, { color: 'var(--dim)', label: 'the overall mean', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Minimum overlap" value={minOverlap} min={1} max={MIN_OVERLAP_MAX} onChange={setMinOverlap} format={(v) => `${v} films`} />
        </>,
      ]}
    >
      <div className="rec-stage stage-pad">
        <EditsStrip edits={edits} setEdits={setEdits} />
        <Box>
          <SectionTitle hint="same held-out cells, lower is better">Two ways to fill the gaps</SectionTitle>
          <div className="rec-bars">
            <Bar value={score.rmse} max={BAR_MAX_RMSE} tone="info" label={<span className="rec-bar-label">User-based neighbours: {rmse2(score.rmse)}</span>} ariaLabel={`Neighbours RMSE ${rmse2(score.rmse)}`} />
            <Bar value={baseline} max={BAR_MAX_RMSE} tone="dim" label={<span className="rec-bar-label">Just predict the overall mean: {rmse2(baseline)}</span>} ariaLabel={`Overall-mean RMSE ${rmse2(baseline)}`} />
            <Bar value={mf} max={BAR_MAX_RMSE} tone="violet" label={<span className="rec-bar-label">Factorisation: {rmse2(mf)}</span>} ariaLabel={`Factorisation RMSE ${rmse2(mf)}`} />
          </div>
          <Hint tone="muted" block>Neighbours need users who rated the same films: raise the minimum overlap and fewer cells have anyone to learn from. A factorisation shares what it learns through a few factors and fails the other way when it has too few to express the tastes (try 1 factor in Factorise it). At this sparsity neighbours can be no better than the overall mean.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={DATA.seed}>invented ratings</Provenance>
          <Provenance kind="toy">user-based cosine on centred ratings, a classic baseline; the factorisation is fixed here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
