import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { decimal } from '../../core/format';
import { CONVENTION, pointCaption } from './captions';
import { MatrixEquation } from './MatrixEquation';
import {
  CORNERS, POINT_RANGES, divideRows, initialPoint, pipeline, projectCube, translationEffect, viewportRows, type PointState, type SpaceStep,
} from './model';
import { Wireframe } from './Wireframe';

/** Narrowest width at which a 4 by 4 matrix, a vector and the result stay readable. */
const MATRIX_MIN_WIDTH = 340;
const CORNER_OPTIONS = CORNERS.map((_, i) => ({ value: i, label: String(i) }));
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the corner you picked', shape: 'dot' },
      { color: 'var(--muted)', label: 'cube edges inside the frustum', shape: 'line' },
    ]}
  />
);

function StepBody({ step, previous }: { step: SpaceStep; previous: SpaceStep }) {
  const n2 = (v: number) => decimal(v, 2);
  if (step.id === 'ndc' && step.value && previous.value) {
    return (
      <div className="td-lines">
        {divideRows(previous.value).map((r) => (
          <span key={r.name}>{`${r.name} / w = ${n2(r.num)} / ${n2(r.den)} = ${n2(r.result)}`}</span>
        ))}
      </div>
    );
  }
  if (step.id === 'screen' && step.value && previous.value) {
    return (
      <div className="td-lines">
        {viewportRows(previous.value).map((r) => (
          <span key={r.name}>{`${r.name} = ${r.formula} = ${n2(r.result)}`}</span>
        ))}
      </div>
    );
  }
  if (step.matrix && step.value && previous.value) return <MatrixEquation name={step.matrixName} matrix={step.matrix} input={previous.value} output={step.value} />;
  if (step.value) return <div className="td-lines"><span>{`(${step.value.map(n2).join(', ')})`}</span></div>;
  return null;
}

export function PointScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<PointState>(initialPoint);
  const steps = useMemo(() => pipeline(s), [s]);
  const projected = useMemo(() => projectCube(s), [s]);
  const effect = translationEffect(s);
  const caption = pointCaption(s);
  const set = (patch: Partial<PointState>) => setS((cur) => ({ ...cur, ...patch }));
  const R = POINT_RANGES;
  return (
    <StageFrame
      height={520}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Moved by the translation, as a point" value={decimal(effect.point, 2)} sub="world units" />
          <Stat label="Moved by the translation, as a direction" value={decimal(effect.direction, 2)} sub="w = 0 ignores it" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Corner" value={s.vertex} onChange={(vertex) => set({ vertex })} options={CORNER_OPTIONS} />
          <Toggle label="Read it as" value={s.kind === 'direction'} onChange={(on) => set({ kind: on ? 'direction' : 'point' })} off="a point (w = 1)" on="a direction (w = 0)" />
        </>,
        <>
          <Slider label="Scale" value={s.scale} min={R.scale.min} max={R.scale.max} step={R.scale.step} format={(v) => `${v}×`} onChange={(scale) => set({ scale })} />
          <Slider label="Turn about y" value={s.turnDeg} min={R.turnDeg.min} max={R.turnDeg.max} step={R.turnDeg.step} format={(v) => `${v}°`} onChange={(turnDeg) => set({ turnDeg })} />
          <Slider label="Move x" value={s.moveX} min={R.moveX.min} max={R.moveX.max} step={R.moveX.step} onChange={(moveX) => set({ moveX })} />
          <Slider label="Move z" value={s.moveZ} min={R.moveZ.min} max={R.moveZ.max} step={R.moveZ.step} onChange={(moveZ) => set({ moveZ })} />
          <Button onClick={() => setS(initialPoint())}>Reset</Button>
        </>,
      ]}
    >
      <div className="td-stage stage-pad">
        <p className="hint is-muted">{CONVENTION}</p>
        <div className="td-row">
          <div className="td-col">
            <Box>
              <SectionTitle hint="200 by 150 pixels, the camera and lens are fixed here">The cube as the screen sees it</SectionTitle>
              <Wireframe projected={projected} mark={s.kind === 'point' ? s.vertex : null} ariaLabel={`Wireframe cube; corner ${s.vertex} ${s.kind === 'point' ? 'ringed' : 'read as a direction, so not drawn'}`} />
            </Box>
          </div>
          <div className="td-col">
            <SectionTitle hint="the same corner after each stage">One vertex through every space</SectionTitle>
            <WideRegion minWidth={MATRIX_MIN_WIDTH} label="The vertex in every space: scroll sideways to see all of it" hint="swipe to see the whole matrix">
              <ol className="td-steps">
                {steps.map((step, i) => (
                  <li key={step.id} className={`td-step ${step.value ? '' : 'is-gone'}`}>
                    <div className="td-step-title">{step.title}</div>
                    <div className="td-step-rule">{step.rule}</div>
                    <StepBody step={step} previous={steps[Math.max(0, i - 1)]} />
                  </li>
                ))}
              </ol>
            </WideRegion>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a tiny software renderer drawn as SVG, not a GPU</Provenance>
          <Provenance kind="from-memory">Direct3D and Vulkan use a different z range and y direction; check their specifications</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
