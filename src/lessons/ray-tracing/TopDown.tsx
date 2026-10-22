import { Curve, Plot2D, Points, Segments, type PlotPoint } from '../../components/Plot2D';
import type { Vec3 } from '../../core/raster3d';
import { CAMERA, SPHERES, objectsOf, type Segment, type Trail, type TraceState } from './scene';

const AXIS = { domain: [-8, 8] as const };
const DEPTH_AXIS = { domain: [-3, 11] as const };
const RING_POINTS = 48;
/** Plot coordinates: world x across, and -z up the page, so the scene recedes upward. */
const toPlot = (p: Vec3): [number, number] => [p[0], -p[2]];

const circle = (cx: number, cz: number, r: number): [number, number][] =>
  Array.from({ length: RING_POINTS + 1 }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / RING_POINTS), -cz + r * Math.sin((2 * Math.PI * i) / RING_POINTS)]);

const lines = (segments: readonly Segment[]) => segments.filter((s) => s.from[0] !== s.to[0] || s.from[2] !== s.to[2]).map((s) => ({ from: toPlot(s.from), to: toPlot(s.to) }));

/**
 * The scene seen from above. The light and the spheres can be dragged (arrow keys move a focused one);
 * a trail draws one pixel's camera, shadow and mirror rays and rings the first hit.
 */
export function TopDown({ state, onMove, trail }: { state: TraceState; onMove?: (index: number, plot: readonly [number, number]) => void; trail?: Trail | null }) {
  const objects = objectsOf(state);
  const handles: PlotPoint[] = [
    { x: state.light[0], y: -state.light[1], tone: 'amber', r: 6 },
    ...state.spheres.map(([x, z]): PlotPoint => ({ x, y: -z, tone: 'muted', r: 5 })),
  ];
  const hits: PlotPoint[] = (trail?.hits ?? []).map((h, i) => {
    const [x, y] = toPlot(h.point);
    return { x, y, tone: h.shadowed ? 'dim' : 'ok', r: 4, ring: i === 0 ? 'hi' : undefined };
  });
  const segments = trail?.segments ?? [];
  const eye = toPlot(CAMERA.eye);
  return (
    <Plot2D x={{ ...AXIS, label: 'world x' }} y={{ ...DEPTH_AXIS, label: 'world -z (up the page is further away)' }} aspect="equal" ariaLabel="Top-down view of the scene: camera, three spheres, the light and the rays of the chosen pixel">
      {objects.filter((o) => o.kind === 'sphere').map((o, i) => (
        <Curve key={SPHERES[i].name} points={circle(o.center[0], o.center[2], o.radius)} tone="muted" />
      ))}
      <Segments segments={lines(segments.filter((s) => s.kind === 'camera'))} tone="info" />
      <Segments segments={lines(segments.filter((s) => s.kind === 'shadow' && !s.blocked))} tone="violet" />
      <Segments segments={lines(segments.filter((s) => s.kind === 'shadow' && s.blocked))} tone="violet" dashed />
      <Segments segments={lines(segments.filter((s) => s.kind === 'reflect'))} tone="hi" />
      <Points data={hits} />
      <Points data={[{ x: eye[0], y: eye[1], tone: 'info', r: 4, hollow: true }]} labels={() => 'camera'} />
      <Points
        data={handles}
        onDrag={onMove ? (i, p) => onMove(i, p) : undefined}
        pointLabel={(i) => (i === 0 ? 'Light' : SPHERES[i - 1].name)}
        labels={(i) => (i === 0 ? 'light' : { text: SPHERES[i - 1].name, left: i === 1 })}
      />
    </Plot2D>
  );
}
