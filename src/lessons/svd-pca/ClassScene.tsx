import { useMemo, useState, type ReactNode } from 'react';
import { Arrow, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { PLOT_DOMAIN, alongAxis, bestThresholdAccuracy, classData, pcaOf, projectOnto } from './model';
import { classCaption } from './text';

const AXIS_REACH = 5.5;

export function ClassScene({ picker }: { picker: ReactNode }) {
  const [onto, setOnto] = useState<0 | 1>(0);
  const rows = useMemo(() => classData(), []);
  const pts = useMemo(() => rows.map((r) => r.point), [rows]);
  const labels = rows.map((r) => r.label);
  const pca = useMemo(() => pcaOf(pts), [pts]);
  const accuracy = pca.axes.map((axis) => bestThresholdAccuracy(alongAxis(pts, pca.mean, axis), labels));
  const projected = projectOnto(pts, pca.mean, pca.axes[onto]);

  return (
    <StageFrame
      height={420}
      intro={classCaption(accuracy[0], accuracy[1], pca.explained)}
      introKey={[accuracy[0], accuracy[1]]}
      stats={
        <Stats>
          <Stat label="Best cut on PC1" value={`${(accuracy[0] * 100).toFixed(1)}%`} color="var(--hi)" sub="most variance" />
          <Stat label="Best cut on PC2" value={`${(accuracy[1] * 100).toFixed(1)}%`} color="var(--violet)" sub="least variance" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'class A', shape: 'dot' },
            { color: 'var(--sky)', label: 'class B', shape: 'dot' },
            { color: 'var(--hi)', label: 'PC1', shape: 'line' },
            { color: 'var(--violet)', label: 'PC2', shape: 'line' },
            { color: 'var(--info)', label: 'points projected onto the chosen axis', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Project onto" value={onto} onChange={setOnto} options={[{ value: 0, label: 'PC1' }, { value: 1, label: 'PC2' }]} />
        </>,
      ]}
    >
      <div className="sp-stage stage-pad">
        <Plot2D x={{ domain: PLOT_DOMAIN, ticks: 5 }} y={{ domain: PLOT_DOMAIN, ticks: 5 }} aspect="equal" width={356} ariaLabel="Two classes separated along the low-variance direction">
          <Arrow from={[pca.mean[0] - AXIS_REACH * pca.axes[1][0], pca.mean[1] - AXIS_REACH * pca.axes[1][1]]} to={[pca.mean[0] + AXIS_REACH * pca.axes[1][0], pca.mean[1] + AXIS_REACH * pca.axes[1][1]]} tone="violet" />
          <Arrow from={[pca.mean[0] - AXIS_REACH * pca.axes[0][0], pca.mean[1] - AXIS_REACH * pca.axes[0][1]]} to={[pca.mean[0] + AXIS_REACH * pca.axes[0][0], pca.mean[1] + AXIS_REACH * pca.axes[0][1]]} tone="hi" />
          <Points data={pts.map((p, i) => ({ x: p[0], y: p[1], tone: labels[i] === 0 ? ('amber' as const) : ('sky' as const) }))} r={3.5} />
          <Points data={projected.map((p) => ({ x: p[0], y: p[1], tone: 'info' as const, hollow: true }))} r={2.5} />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={31}>two seeded classes, 30 points each; the accuracies are a brute-force search over every threshold</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
