import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { decimal } from '../../core/format';
import { clipCaption, vec } from './captions';
import { APEX_RANGE, CLIP_SCENE, DEG, VIEW_H, VIEW_W, clipScene, initialClip, sideSegments, type ClipState } from './model';

const TABLE_MIN_WIDTH = 340;
const SIDE_DEPTH = 10;
const HALF_FOV = Math.tan((CLIP_SCENE.fovDeg * DEG) / 2);
const FRUSTUM_EDGES = [
  { from: [0, 0] as [number, number], to: [SIDE_DEPTH, SIDE_DEPTH * HALF_FOV] as [number, number] },
  { from: [0, 0] as [number, number], to: [SIDE_DEPTH, -SIDE_DEPTH * HALF_FOV] as [number, number] },
];
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a vertex clipping created on a plane', shape: 'dot' },
      { color: 'var(--bad)', label: 'the broken result with clipping off', shape: 'square' },
      { color: 'var(--info)', label: 'near plane and frustum', shape: 'line' },
      { color: 'var(--dim)', label: 'clipped-away part (dashed)', shape: 'line' },
    ]}
  />
);

export function ClipScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ClipState>(initialClip);
  const result = useMemo(() => clipScene(s), [s]);
  const side = useMemo(() => sideSegments(s.apexZ), [s.apexZ]);
  const caption = clipCaption(s);
  const broken = !s.clipping && result.behindInput > 0;
  const points = result.polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Corners behind the camera" value={`${result.behindInput} of 3`} sub="w <= 0 after the projection" />
          <Stat label="Vertices drawn" value={result.rows.length} sub={`${result.rows.filter((r) => r.created).length} created by clipping`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Clipping" value={s.clipping} onChange={(clipping) => setS((c) => ({ ...c, clipping }))} off="off" on="on" />
          <Slider label="Apex depth z (positive is behind the camera)" value={s.apexZ} min={APEX_RANGE.min} max={APEX_RANGE.max} step={APEX_RANGE.step} format={(v) => decimal(v, 1)} onChange={(apexZ) => setS((c) => ({ ...c, apexZ }))} />
          <Button onClick={() => setS(initialClip())}>Reset</Button>
        </>,
      ]}
    >
      <div className="td-stage stage-pad">
        <div className="td-row">
          <div className="td-col">
            <Box>
              <SectionTitle hint="200 by 150 pixels">The picture</SectionTitle>
              <svg className="td-view" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={broken ? (result.rows.some((r) => r.clip[3] === 0) ? 'Nothing drawn: a corner has w exactly 0, so it has no screen position' : 'Triangle drawn wrongly: a corner behind the camera is mirrored through the screen') : 'Triangle after clipping'}>
                {result.polygon.length >= 3 && <polygon className={`td-poly ${broken ? 'is-bad' : 'is-plain'}`} points={points} />}
                {result.rows.filter((r) => r.created && r.screen).map((r, i) => <circle key={i} className="td-new" cx={r.screen?.[0]} cy={r.screen?.[1]} r={3} />)}
              </svg>
            </Box>
            <Box>
              <SectionTitle hint="the vertices that are drawn">Clip-space vertices</SectionTitle>
              <WideRegion minWidth={TABLE_MIN_WIDTH} label="Vertex table: scroll sideways to see all of it" hint="swipe to see the whole table">
                <table className="data-table td-table">
                  <thead>
                    <tr><th>Vertex</th><th>Clip (x, y, z, w)</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className={r.created ? 'td-row-new' : r.behind ? 'td-row-bad' : ''}>
                        <td>{r.name}</td>
                        <td>{vec(r.clip)}</td>
                        <td>{r.created ? `new, on the ${r.planes.join(' and ')} plane` : r.behind ? 'behind the camera (w <= 0)' : 'in front'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WideRegion>
            </Box>
          </div>
          <div className="td-col">
            <Box>
              <SectionTitle hint="the camera is at 0, looking to the right">Side view of the triangle</SectionTitle>
              <Plot2D x={{ domain: [-3, SIDE_DEPTH], label: 'depth in front of the camera' }} y={{ domain: [-4, 4], label: 'height' }} aspect="equal" ariaLabel="Side view of the triangle and the near plane">
                <Segments segments={FRUSTUM_EDGES} tone="info" />
                <VLine at={CLIP_SCENE.near} label="near" tone="info" />
                <Segments segments={side.filter((x) => x.kept).map((x) => ({ from: x.from, to: x.to }))} tone="muted" />
                <Segments segments={side.filter((x) => !x.kept).map((x) => ({ from: x.from, to: x.to }))} tone="dim" dashed />
                <Points data={[{ x: 0, y: 0, tone: 'amber', r: 5 }]} labels={() => 'camera'} />
              </Plot2D>
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">Sutherland-Hodgman clipping in clip space against the six planes, drawn as SVG</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
