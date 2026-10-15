import { useMemo, useState, type ReactNode } from 'react';
import { Arrow, Curve, Plot2D, Points, Segments } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { eigen2x2 } from '../../core/linalg';
import {
  MATRIX_BOUNDS, MATRIX_STEP, MAX_APPLIES, PRESETS, RESIDUAL_TOLERANCE, SNAP_DEGREES, behaviourOf, cloud, eigenCoordinates, eigenLines, iterates, rayleigh, residual, snapToEigenLine, stretchAt, type Behaviour, type Matrix2,
} from './eigen';
import { startMatrix, type ArrowMode } from './scenes';
import { arrowCaption, eigenvalueText, n3, residualText } from './text';

const DOMAIN = [-1.6, 1.6] as const;
const LINE_REACH = 1.5;
const INSPECT_START: [number, number] = [1, 0.4];
const AXIS_NAMES = [['a', 'b'], ['c', 'd']];

const lineLabel = (kind: Behaviour['kind'], i: number): string => {
  if (kind === 'shear') return 'the one eigen-line';
  return i === 0 ? 'the eigen-line of the larger eigenvalue' : 'the other eigen-line';
};

export function ArrowScene({ picker, mode }: { picker: ReactNode; mode: ArrowMode }) {
  const [A, setA] = useState<Matrix2>(startMatrix(mode));
  const [k, setK] = useState(0);
  const [probe, setProbe] = useState<[number, number]>(INSPECT_START);
  const behaviour = behaviourOf(A);
  const eigen = eigen2x2(A);
  const trails = useMemo(() => cloud().map((start) => iterates(A, start, MAX_APPLIES)), [A]);
  const at = Math.min(k, trails[0].length - 1);
  const res = residual(A, probe);
  const lambda = rayleigh(A, probe);
  const stretch = k > 0 ? stretchAt(A, [1, 0], Math.min(k, MAX_APPLIES)) : null;
  const ratio = eigen && eigen.kind === 'real' && behaviour.kind === 'converges' ? (() => {
    const c = eigenCoordinates(eigen.vectors[0], eigen.vectors[1], trails[0][at]);
    return c && Math.abs(c[0]) > 1e-12 ? c[1] / c[0] : null;
  })() : null;

  const setEntry = (i: number, j: number, v: number) => {
    setA(A.map((row, r) => row.map((x, c) => (r === i && c === j ? v : x))) as Matrix2);
    setK(0);
  };
  const load = (m: Matrix2) => {
    setA(m);
    setK(0);
  };
  const lines = eigenLines(A).map(({ direction: v, tone }) => ({ from: [-LINE_REACH * v[0], -LINE_REACH * v[1]] as [number, number], to: [LINE_REACH * v[0], LINE_REACH * v[1]] as [number, number], tone }));

  return (
    <StageFrame
      height={420}
      intro={arrowCaption(behaviour, k)}
      introKey={[A, k]}
      stats={
        <Stats>
          <Stat label="Eigenvalues" value={eigenvalueText(behaviour)} color="var(--ok)" sub="from the characteristic quadratic" />
          <Stat label="Stretch factor" value={stretch === null ? '–' : n3(stretch)} sub={stretch === null ? 'press Apply A' : 'length ratio of the arrow at 0°'} />
          <Stat label="Second ÷ first component" value={ratio === null ? '–' : n3(ratio)} sub={ratio === null ? 'needs two real eigen-directions' : 'of the arrow at 0°, in the eigen-basis'} />
          <Stat label={<>Residual |Av − <span className="keep-case">λ</span>v|</>} value={residualText(res, RESIDUAL_TOLERANCE)} color={res < RESIDUAL_TOLERANCE ? 'var(--ok)' : 'var(--bad)'} sub={`the dragged arrow, λ ≈ ${n3(lambda)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the arrow you drag', shape: 'dot' },
            ...lines.map((l, i) => ({ color: l.tone === 'ok' ? 'var(--ok)' : 'var(--violet)', label: lineLabel(behaviour.kind, i), shape: 'line' as const })),
            { color: 'var(--info)', label: 'the 12 arrows and their trails', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Matrix" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.A.every((row, i) => row.every((x, j) => x === A[i][j]))} onClick={() => load(p.A)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {A.map((row, i) => row.map((x, j) => (
            <Slider key={AXIS_NAMES[i][j]} label={AXIS_NAMES[i][j]} value={Number(x.toFixed(1))} min={MATRIX_BOUNDS.min} max={MATRIX_BOUNDS.max} step={MATRIX_STEP} format={(v) => v.toFixed(1)} onChange={(v) => setEntry(i, j, v)} />
          )))}
        </>,
        <>
          <Button variant="primary" onClick={() => setK(Math.min(MAX_APPLIES, k + 1))}>Apply A</Button>
          <Button onClick={() => setK(Math.min(MAX_APPLIES, k + 10))}>Apply 10 times</Button>
          <Button onClick={() => setK(0)}>Reset arrows</Button>
          <Hint>Matrix [[a, b], [c, d]]. Drag the yellow dot to inspect any arrow: its residual is 0 only along an eigen-line, and it snaps onto one within {SNAP_DEGREES}°.</Hint>
        </>,
      ]}
    >
      <div className="ep-stage stage-pad">
        <Plot2D x={{ domain: DOMAIN, ticks: 5 }} y={{ domain: DOMAIN, ticks: 5 }} aspect="equal" width={356} ariaLabel={`Twelve arrows after ${k} applications of the matrix, with its eigen-lines`}>
          <Segments segments={lines} />
          {trails.map((t, i) => (
            <Curve key={i} points={t.slice(0, at + 1).map((v): [number, number] => [v[0], v[1]])} tone="info" dashed />
          ))}
          {trails.map((t, i) => (
            <Arrow key={i} to={[t[at][0], t[at][1]]} tone="info" />
          ))}
          <Arrow to={probe} tone="hi" />
          <Points data={[{ x: probe[0], y: probe[1], tone: 'hi' }]} onDrag={(_, p) => setProbe(snapToEigenLine([p[0], p[1]], eigenLines(A)))} pointLabel={() => 'inspected arrow'} />
        </Plot2D>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">power iteration and the closed-form eigenvalues run live on the matrix you set</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
