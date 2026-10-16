import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { OVERLAP_MAX_PCT, OVERLAP_STEP_PCT, SIZE_MAX, SIZE_MIN, SIZE_STEP } from './chunker';
import { measureCaption } from './captions';
import { evalRecall } from './retrieval';
import { K_MAX, K_MIN, MEASURE_DEFAULT } from './settings';
import { QUESTION_COUNT } from './retrieval';
import { SWEEP_SIZES, recallCurve, smallestFullK } from './views';

export function MeasureScene({ picker }: { picker: ReactNode }) {
  const [size, setSize] = useState<number>(MEASURE_DEFAULT.size);
  const [k, setK] = useState<number>(MEASURE_DEFAULT.k);
  const [overlapPct, setOverlapPct] = useState<number>(MEASURE_DEFAULT.overlapPct);
  const tfidf = useMemo(() => recallCurve('tfidf', k, overlapPct), [k, overlapPct]);
  const bm25 = useMemo(() => recallCurve('bm25', k, overlapPct), [k, overlapPct]);
  const atSize = { tfidf: Math.round(evalRecall(size, overlapPct, 'tfidf', k).recall * 100), bm25: Math.round(evalRecall(size, overlapPct, 'bm25', k).recall * 100) };
  const kFull = useMemo(() => smallestFullK(size, overlapPct, 'tfidf', K_MAX), [size, overlapPct]);
  const caption = measureCaption(tfidf, bm25, size, k, overlapPct, atSize);
  const points = (c: { percent: number[] }) => SWEEP_SIZES.map((s, i) => [s, c.percent[i]] as [number, number]);

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label={`TF-IDF recall@${k}`} value={`${atSize.tfidf}%`} color="var(--info)" sub={`at ${size} words`} />
          <Stat label={`BM25 recall@${k}`} value={`${atSize.bm25}%`} color="var(--violet)" sub={`at ${size} words`} />
          <Stat label="Smallest k for 100%" value={kFull === null ? 'none up to 8' : kFull} sub={`TF-IDF at ${size} words`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'TF-IDF recall', shape: 'line' },
            { color: 'var(--violet)', label: 'BM25 recall', shape: 'line' },
            { color: 'var(--hi)', label: 'chosen chunk size', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Chunk size" value={size} min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} onChange={setSize} format={(v) => `${v} words`} />
          <Slider label="Top k" value={k} min={K_MIN} max={K_MAX} onChange={setK} />
          <Slider label="Overlap" value={overlapPct} min={0} max={OVERLAP_MAX_PCT} step={OVERLAP_STEP_PCT} onChange={setOverlapPct} format={(v) => `${v}%`} />
        </>,
      ]}
    >
      <div className="rag-stage stage-pad">
        <Box>
          <SectionTitle hint={`the whole pipeline re-run at ${SWEEP_SIZES.length} sizes over ${QUESTION_COUNT} questions`}>Recall@k against chunk size</SectionTitle>
          <div className="rag-plot">
            <Plot2D x={{ domain: [SIZE_MIN, SIZE_MAX], label: 'chunk size (words)' }} y={{ domain: [0, 100], label: 'recall@k (%)' }} width={356} ariaLabel={`Recall at ${k} against chunk size for TF-IDF and BM25`}>
              <Curve points={points(tfidf)} tone="info" />
              <Curve points={points(bm25)} tone="violet" dashed />
              <VLine at={size} tone="hi" />
            </Plot2D>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">every point is a full run of chunk, index, retrieve and check; the curve is a result, not a drawing</Provenance>
          <Provenance kind="toy">8 questions are a toy evaluation set: a real one needs hundreds of questions and a held-out set</Provenance>
          <Provenance kind="illustrative">invented documents and gold sentences</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
