import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Polygon, Segments, type PlotPoint } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { cameraCaption } from './captions';
import {
  ASPECTS, CAMERA_PRESETS, FAR_RANGE, FOV_RANGE, NEAR_RANGE, PLOT_LIMIT, cameraView, footprint, initialCamera, moveHandle, setFar, setNear, type AspectId,
  type CameraState, type ProjectionKind,
} from './model';
import { Wireframe } from './Wireframe';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'frustum edges (near and far planes, sides)', shape: 'line' },
      { color: 'var(--amber)', label: 'eye', shape: 'dot' },
      { color: 'var(--pink)', label: 'target', shape: 'dot' },
      { color: 'var(--muted)', label: 'cube corner inside the frustum', shape: 'dot' },
      { color: 'var(--dim)', label: 'cube corner outside it', shape: 'dot' },
    ]}
  />
);
const AXIS = { domain: [-PLOT_LIMIT, PLOT_LIMIT] as const };
const PROJECTIONS: { value: ProjectionKind; label: string }[] = [
  { value: 'perspective', label: 'perspective' },
  { value: 'orthographic', label: 'orthographic' },
];
const ASPECT_OPTIONS = ASPECTS.map((a) => ({ value: a.id, label: a.id }));
const FOOT = footprint();

export function FrustumScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<CameraState>(initialCamera);
  const view = useMemo(() => cameraView(s), [s]);
  const caption = cameraCaption(s);
  const handles: PlotPoint[] = [
    { x: s.eye[0], y: -s.eye[1], tone: 'amber', r: 6 },
    { x: s.target[0], y: -s.target[1], tone: 'pink', r: 6 },
  ];
  const corners: PlotPoint[] = FOOT.map((f) => ({
    x: f.point[0], y: f.point[1], tone: f.vertices.every((v) => view.projected[v].inFrustum) ? 'muted' : 'dim', r: 4,
  }));
  const outline = FOOT.map((f, i) => ({ from: f.point, to: FOOT[(i + 1) % FOOT.length].point }));
  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={caption}
      introKey={`${caption}|${s.note ?? ''}`}
      stats={
        <Stats>
          <Stat label="Corners outside the frustum" value={`${view.outside} of 8`} />
          <Stat label="Corners behind the camera" value={view.behind} sub="their edges are not drawn" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Projection" value={s.projection} onChange={(projection) => setS((c) => ({ ...c, projection, note: null }))} options={PROJECTIONS} />
          <Segmented label="Aspect" value={s.aspect} onChange={(aspect: AspectId) => setS((c) => ({ ...c, aspect, note: null }))} options={ASPECT_OPTIONS} />
        </>,
        <>
          {s.projection === 'perspective' && (
            <Slider label="Field of view" value={s.fovDeg} min={FOV_RANGE.min} max={FOV_RANGE.max} step={FOV_RANGE.step} format={(v) => `${v}°`} onChange={(fovDeg) => setS((c) => ({ ...c, fovDeg, note: null }))} />
          )}
          <Slider label="Near plane" value={s.near} min={NEAR_RANGE.min} max={NEAR_RANGE.max} step={NEAR_RANGE.step} format={(v) => decimal(v, 1)} onChange={(v) => setS((c) => setNear(c, v))} />
          <Slider label="Far plane" value={s.far} min={FAR_RANGE.min} max={FAR_RANGE.max} step={FAR_RANGE.step} onChange={(v) => setS((c) => setFar(c, v))} />
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {CAMERA_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" onClick={() => setS((c) => p.apply(c))}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setS(initialCamera())}>Reset</Button>
        </>,
      ]}
    >
      <div className="td-stage stage-pad">
        <div className="td-row">
          <div className="td-col">
            <Box>
              <SectionTitle hint="drag the eye and the target, or focus one and use the arrow keys">Top view of the camera</SectionTitle>
              <Plot2D x={{ ...AXIS, label: 'world x' }} y={{ ...AXIS, label: 'world -z (up the page is further ahead)' }} aspect="equal" ariaLabel="Top-down view of the camera, its frustum and the cube">
                <Polygon points={view.trapezoid} tone="info" />
                <Segments segments={outline} tone="muted" />
                <Points data={corners} />
                <Points data={handles} onDrag={(i, p) => setS((c) => moveHandle(c, i === 0 ? 'eye' : 'target', p))} pointLabel={(i) => (i === 0 ? 'Camera eye' : 'Look-at target')} labels={(i) => (i === 0 ? 'eye' : 'target')} />
              </Plot2D>
            </Box>
          </div>
          <div className="td-col">
            <Box>
              <SectionTitle hint="what the camera sees, 200 by 150 pixels">The picture</SectionTitle>
              <Wireframe projected={view.projected} ariaLabel={`Wireframe cube through the camera; ${view.outside} of 8 corners outside the frustum`} />
            </Box>
            {s.note && <p className="td-note" role="status">{s.note}</p>}
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a tiny software renderer; the camera stays level at one height so the top view is exact</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
