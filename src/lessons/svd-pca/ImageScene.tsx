import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { clamp01 } from '../../core/math';
import { IMAGES, IMAGE_SIZE, RANK_BOUNDS, discardedNorm, frobenius, imageOf, rebuild, storageOfImage, storageOfRank, svdOf, type ImageId } from './model';
import { imageCaption, n3, storageSentence } from './text';

const GRID_SIZE = { cell: 26 };
const BAR_HALF = 0.34;

function Grid({ values, tone, label }: { values: readonly (readonly number[])[]; tone: 'muted' | 'ok' | 'bad'; label: string }) {
  return (
    <figure className="sp-figure">
      <CellGrid rows={IMAGE_SIZE} cols={IMAGE_SIZE} size={GRID_SIZE} cell={(r, c) => ({ tone, fill: 'tint', intensity: clamp01(Math.abs(values[r][c])) })} ariaLabel={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function ImageScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<ImageId>('smiley');
  const [k, setK] = useState(2);
  const A = useMemo(() => imageOf(id), [id]);
  const svd = useMemo(() => svdOf(A), [A]);
  const Ak = useMemo(() => rebuild(svd, k), [svd, k]);
  const error = frobenius(A, Ak);
  const discarded = discardedNorm(svd.s, k);
  const total = svd.s.reduce((s, x) => s + x * x, 0);
  const kept = svd.s.slice(0, k).reduce((s, x) => s + x * x, 0) / total;
  const diff = A.map((row, i) => row.map((x, j) => x - Ak[i][j]));

  return (
    <StageFrame
      height={420}
      intro={imageCaption({ k, error, discarded, kept })}
      introKey={[id, k]}
      stats={
        <Stats>
          <Stat label="Error ‖A − A_k‖" value={n3(error)} color="var(--bad)" sub={[`√(Σ discarded σ²) = ${n3(discarded)}`]} />
          <Stat label="Storage" value={`${k} × ${2 * IMAGE_SIZE + 1} = ${storageOfRank(k)}`} color={storageOfRank(k) < storageOfImage() ? 'var(--ok)' : 'var(--bad)'} sub={storageSentence(k)} />
          <Stat label="Energy kept" value={`${(kept * 100).toFixed(1)}%`} color="var(--ok)" sub="Σ kept σ² ÷ Σ all σ²" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'the original image' },
            { color: 'var(--ok)', label: 'the rebuild and the kept terms' },
            { color: 'var(--bad)', label: 'the error and the discarded terms' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Image" inline>
            {IMAGES.map((im) => (
              <ChipButton key={im.id} tone="info" on={im.id === id} onClick={() => setId(im.id)}>
                {im.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Slider label="Terms k" value={k} min={RANK_BOUNDS.min} max={RANK_BOUNDS.max} onChange={setK} />
          <Segmented label="Jump to" value={k} onChange={setK} options={[1, 2, 4, 8].map((v) => ({ value: v, label: String(v) }))} />
          <Hint>A_k = the sum of the top k terms σᵢ uᵢ vᵢᵀ. Cell shade is the size of each value (a rebuild can dip below zero; its size is shown).</Hint>
        </>,
      ]}
    >
      <div className="sp-stage stage-pad">
        <Grid values={A} tone="muted" label="Original" />
        <Grid values={Ak} tone="ok" label={`Rebuilt from ${k} ${k === 1 ? 'term' : 'terms'}`} />
        <Grid values={diff} tone="bad" label="Error A − A_k" />
        <Plot2D
          x={{ domain: [0.5, IMAGE_SIZE + 0.5] as const, tickValues: svd.s.map((_, i) => i + 1), label: 'term i' }}
          y={{ domain: [0, Math.max(...svd.s) * 1.08] as const, label: 'σᵢ', ticks: 4, format: (v) => v.toFixed(1) }}
          ariaLabel={`Singular values of the image, the first ${k} kept`}
        >
          <Bars bars={svd.s.map((s, i) => ({ x0: i + 1 - BAR_HALF, x1: i + 1 + BAR_HALF, y: s, tone: i < k ? 'ok' : 'bad' }))} />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">8 × 8 teaching images defined in code; the SVD is a small-matrix Jacobi routine, not a library for large images</Provenance>
        <Provenance kind="illustrative">rank-k storage here is a counting exercise: real image codecs use other transforms</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
