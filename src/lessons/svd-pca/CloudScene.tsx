import { useMemo, useState, type ReactNode } from 'react';
import { Arrow, Plot2D, PlotCursor, PointerLayer, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { MAX_POINTS, PLOT_DOMAIN, axisAngle, clampToDomain, cloudPoints, pcaOf, projectOnto, residualSumSquares, rotateAbout, type P2 } from './model';
import { cloudCaption, n3 } from './text';

const ROTATE_STEPS = 100;
const MEAN_RING = 7;

export function CloudScene({ picker }: { picker: ReactNode }) {
  const [points, setPoints] = useState<P2[]>(() => cloudPoints());
  const [turn, setTurn] = useState(0);
  const [projected, setProjected] = useState(false);
  const [cursor, setCursor] = useState<P2>([0, 0]);
  const pca = useMemo(() => pcaOf(points), [points]);
  const t = turn / ROTATE_STEPS;
  const angle = axisAngle(pca.axes[0]);
  const shown = useMemo(() => (turn === 0 ? points : rotateAbout(points, pca.mean, angle * t)), [points, pca, angle, t, turn]);
  const axes = pca.axes.map((v) => (turn === 0 ? v : [Math.cos(axisAngle(v) - angle * t), Math.sin(axisAngle(v) - angle * t)])) as [number, number][];
  const proj = projectOnto(shown, pca.mean, axes[0]);
  const residual = residualSumSquares(shown, proj);
  const sd = pca.values.map((l) => Math.sqrt(l));
  const hasAxes = pca.degenerate !== 'same';
  const full = points.length >= MAX_POINTS;

  const add = (p: P2) => setPoints((ps) => (ps.length >= MAX_POINTS ? ps : [...ps, clampToDomain(p)]));

  return (
    <StageFrame
      height={460}
      intro={cloudCaption(pca, points.length, turn > 0, projected, residual)}
      introKey={[points, turn, projected]}
      stats={
        <Stats>
          <Stat label="Explained variance" value={pca.explained === null ? '–' : `${(pca.explained * 100).toFixed(1)}%`} color="var(--hi)" sub="λ₁ ÷ (λ₁ + λ₂)" />
          <Stat label="Eigenvalues" value={`${n3(pca.values[0])}, ${n3(pca.values[1])}`} color="var(--violet)" sub="of the population covariance (divided by n)" />
          <Stat label="Squared residual" value={projected ? n3(residual) : '–'} color="var(--orange)" sub={projected ? `n × λ₂ = ${n3(points.length * pca.values[1])}` : 'turn on Project'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a data point', shape: 'dot' },
            { color: 'var(--muted)', label: 'the mean (ringed): PCA subtracts it first', shape: 'dot' },
            { color: 'var(--hi)', label: 'first axis PC1', shape: 'line' },
            { color: 'var(--violet)', label: 'second axis PC2', shape: 'line' },
            { color: 'var(--orange)', label: 'residual lines', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Rotate to principal axes" value={turn} min={0} max={ROTATE_STEPS} format={(v) => `${v}%`} onChange={setTurn} />
          <Toggle label="Project onto PC1" value={projected} onChange={setProjected} off="Off" on="On" />
        </>,
        <>
          <Button onClick={() => add(cursor)} softDisabled={full}>Add point at cursor</Button>
          <Button onClick={() => setPoints((ps) => ps.slice(0, -1))} softDisabled={points.length <= 1}>Remove last point</Button>
          <Button onClick={() => { setPoints(cloudPoints()); setTurn(0); }}>Reset cloud</Button>
          <Hint>Click the plot or use the cursor and button to add up to {MAX_POINTS} points; drag a point (only while the rotation is 0%).</Hint>
        </>,
      ]}
    >
      <div className="sp-stage stage-pad">
        <Plot2D x={{ domain: PLOT_DOMAIN, ticks: 5 }} y={{ domain: PLOT_DOMAIN, ticks: 5 }} aspect="equal" width={356} ariaLabel={`${points.length} points with their principal axes`}>
          <PointerLayer onDown={(p) => add([p[0], p[1]])} />
          {hasAxes && <Points data={[{ x: pca.mean[0], y: pca.mean[1], tone: 'muted', hollow: true }]} r={MEAN_RING} />}
          {projected && hasAxes && <Segments segments={shown.map((p, i) => ({ from: p, to: proj[i], tone: 'orange' as const }))} />}
          {hasAxes && <Arrow from={pca.mean} to={[pca.mean[0] + sd[0] * axes[0][0], pca.mean[1] + sd[0] * axes[0][1]]} tone="hi" label="PC1" />}
          {hasAxes && pca.degenerate === 'none' && <Arrow from={pca.mean} to={[pca.mean[0] + sd[1] * axes[1][0], pca.mean[1] + sd[1] * axes[1][1]]} tone="violet" label="PC2" />}
          {projected && hasAxes && <Points data={proj.map((p) => ({ x: p[0], y: p[1], tone: 'info' as const, hollow: true }))} r={3} />}
          <Points
            data={shown.map((p) => ({ x: p[0], y: p[1], tone: 'info' as const }))}
            r={3.5}
            roving
            onDrag={turn === 0 ? (i, p) => setPoints((ps) => ps.map((q, j) => (j === i ? clampToDomain([p[0], p[1]]) : q))) : undefined}
            pointLabel={(i) => `point ${i + 1}`}
          />
          <PlotCursor at={cursor} onMove={(p) => setCursor([p[0], p[1]])} label="Add-point cursor" />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={11}>a seeded correlated cloud; the axes come from the Jacobi eigen-decomposition of its covariance</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
