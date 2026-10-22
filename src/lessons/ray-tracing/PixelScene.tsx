import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { pixelCaption } from './captions';
import { paintPixels, rgbText } from '../../components/canvasImage';
import { RENDER_SCALE, RenderView } from './RenderView';
import { DEFAULT_PIXEL, IMAGE, initialTrace, moveBody, pixelRay, render, sceneOf, settingsOf, trailOf, type TraceState } from './scene';
import { TopDown } from './TopDown';

const TABLE_MIN_WIDTH = 340;
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'camera ray', shape: 'line' },
      { color: 'var(--violet)', label: 'shadow ray (dashed when blocked)', shape: 'line' },
      { color: 'var(--hi)', label: 'mirror ray, and the first hit ringed', shape: 'line' },
      { color: 'var(--ok)', label: 'a lit point', shape: 'dot' },
      { color: 'var(--dim)', label: 'a shadowed point', shape: 'dot' },
      { color: 'var(--amber)', label: 'the light', shape: 'dot' },
    ]}
  />
);

export function PixelScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<TraceState>(initialTrace);
  const [pixel, setPixel] = useState<{ x: number; y: number }>(DEFAULT_PIXEL);
  const [replay, setReplay] = useState(0);
  const scene = useMemo(() => sceneOf(s), [s]);
  const r = useMemo(() => render(scene, settingsOf(s)), [scene, s]);
  const url = useMemo(() => paintPixels(IMAGE.w, IMAGE.h, (i) => r.image.pixels[i], RENDER_SCALE), [r]);
  const trail = useMemo(() => trailOf(scene, pixelRay(pixel.x, pixel.y), settingsOf(s)), [scene, s, pixel]);
  const caption = pixelCaption(s, pixel.x, pixel.y, trail);
  const first = trail.hits[0];
  return (
    <StageFrame
      height={620}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Pixel colour" value={rgbText(trail.colour)} sub={`pixel (${pixel.x}, ${pixel.y})`} />
          <Stat label="Camera ray hit" value={first ? first.object : 'nothing'} sub={first ? `t = ${decimal(first.t, 3)}` : 'background colour'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Pixel x" value={pixel.x} min={0} max={IMAGE.w - 1} onChange={(x) => setPixel((p) => ({ ...p, x }))} />
          <Slider label="Pixel y" value={pixel.y} min={0} max={IMAGE.h - 1} onChange={(y) => setPixel((p) => ({ ...p, y }))} />
        </>,
        <>
          <Button onClick={() => setReplay((n) => n + 1)}>Trace again</Button>
          <Button onClick={() => { setS(initialTrace()); setPixel(DEFAULT_PIXEL); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="rt-stage stage-pad">
        <div className="rt-row">
          <div className="rt-col">
            <Box>
              <SectionTitle hint={`${IMAGE.w} by ${IMAGE.h} pixels; click one, or use the sliders`}>The picture</SectionTitle>
              <RenderView url={url} replay={replay} ring={pixel} onPick={(x, y) => setPixel({ x, y })} ariaLabel="Ray-traced picture of three spheres on a floor" />
            </Box>
          </div>
          <div className="rt-col">
            <Box>
              <SectionTitle hint="drag the light or a sphere, or focus one and use the arrow keys">The rays of that pixel, from above</SectionTitle>
              <TopDown state={s} trail={trail} onMove={(i, p) => setS((c) => moveBody(c, i, p))} />
            </Box>
          </div>
        </div>
        <WideRegion minWidth={TABLE_MIN_WIDTH} label="Hits of that pixel's rays: scroll sideways to see all of it" hint="swipe to see the whole table">
          <table className="data-table rt-table">
            <thead><tr><th>Ray</th><th>Hits</th><th>t</th><th>Hit point</th><th>N·L</th><th>Light</th></tr></thead>
            <tbody>
              {trail.hits.length === 0 && <tr><td>camera</td><td colSpan={5}>nothing: the background colour</td></tr>}
              {trail.hits.map((h) => (
                <tr key={h.bounce}>
                  <td>{h.bounce === 0 ? 'camera' : `mirror ${h.bounce}`}</td>
                  <td>{h.object}</td>
                  <td>{decimal(h.t, 3)}</td>
                  <td>{`(${h.point.map((v) => decimal(v, 2)).join(', ')})`}</td>
                  <td>{decimal(h.nl, 2)}</td>
                  <td>{h.shadowed === null ? 'shadows off' : h.shadowed ? 'in shadow' : 'lit'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <ProvenanceRow>
          <Provenance kind="simulated">96 by 72, one light, no global illumination; production renderers sample many light paths</Provenance>
          <Provenance kind="toy">the diagram drops the height of each ray: it is a top view</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
