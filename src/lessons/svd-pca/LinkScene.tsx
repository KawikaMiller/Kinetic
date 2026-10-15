import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { SMALL_FEATURES, SMALL_ROWS, smallData, svdVersusCovariance } from './model';
import { linkCaption, n2, n3 } from './text';

const DEFAULT_SEED = 4;
const CELL = { cell: 40 };

export function LinkScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const X = useMemo(() => smallData(seed), [seed]);
  const rows = useMemo(() => svdVersusCovariance(X), [X]);
  const gap = Math.max(...rows.map((r) => Math.abs(r.fromSvd - r.fromCovariance)));

  return (
    <StageFrame
      height={380}
      intro={linkCaption(rows, SMALL_ROWS)}
      introKey={[seed]}
      stats={
        <Stats>
          <Stat label="Data" value={`${SMALL_ROWS} × ${SMALL_FEATURES}`} sub="centred, seeded; 8 rows is the most the lesson's small SVD takes" />
          <Stat label="Largest difference" value={gap.toExponential(1)} color="var(--ok)" sub="between the two routes" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'from the SVD: σ² ÷ (n − 1)' }, { color: 'var(--violet)', label: 'from the covariance eigenvalues' }]} />}
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sp-stage stage-pad">
        <figure className="sp-figure">
          <CellGrid rows={SMALL_ROWS} cols={SMALL_FEATURES} size={CELL} cell={(r, c) => ({ text: n2(X[r][c]), tone: 'muted', fill: 'tint', intensity: 0.15 })} ariaLabel="The centred data matrix, 8 rows by 3 features" />
          <figcaption>The centred data X</figcaption>
        </figure>
        <table className="sp-table" aria-label="Singular values and covariance eigenvalues">
          <thead>
            <tr><th scope="col">#</th><th scope="col">σ</th><th scope="col" className="sp-info">σ² ÷ (n − 1)</th><th scope="col" className="sp-violet">covariance λ</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td>{n3(r.sigma)}</td>
                <td className="sp-info">{n3(r.fromSvd)}</td>
                <td className="sp-violet">{n3(r.fromCovariance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>a seeded 8 × 3 data set; both columns are computed live (small-matrix SVD and a Jacobi eigen-decomposition)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
