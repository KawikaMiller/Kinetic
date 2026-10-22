import { useMemo, useState, type ReactNode } from 'react';
import { paintImage } from '../../components/canvasImage';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pct, sig } from '../../core/format';
import { TOKENS } from '../../core/palette';
import { depthResolution, DEPTH_BITS } from '../../core/raster3d';
import { depthCaption } from './captions';
import {
  DEPTH_IMAGE, DISTANCE_RANGE, FAR_CHOICES, GAP_CHOICES, NEAR_CHOICES, depthScene, initialDepth, type DepthState,
} from './model';

const IMAGE_SCALE = 2;
const PIXEL_COLOUR = [TOKENS.sky, TOKENS.orange, TOKENS.dim] as const;
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--sky)', label: 'the nearer surface wins', shape: 'square' },
      { color: 'var(--orange)', label: 'z-fighting: both surfaces store the same depth', shape: 'square' },
      { color: 'var(--dim)', label: 'outside near and far: clipped', shape: 'square' },
    ]}
  />
);
const choice = (values: readonly number[]) => ({ min: 0, max: values.length - 1, step: 1, format: (i: number) => String(values[i]) });

export function DepthScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<DepthState>(initialDepth);
  const r = useMemo(() => depthScene(s), [s]);
  const url = useMemo(
    () => paintImage(DEPTH_IMAGE.w, DEPTH_IMAGE.h, (ctx) => {
      r.tied.forEach((v, i) => {
        ctx.fillStyle = PIXEL_COLOUR[v];
        ctx.fillRect(i % DEPTH_IMAGE.w, Math.floor(i / DEPTH_IMAGE.w), 1, 1);
      });
    }, IMAGE_SCALE),
    [r],
  );
  const caption = depthCaption(s);
  const resolvable = r.gap >= r.resolution;
  const set = (patch: Partial<DepthState>) => setS((c) => ({ ...c, ...patch }));
  return (
    <StageFrame
      height={540}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="One depth step at this distance" value={sig(r.resolution)} sub="distance units" />
          <Stat label="Gap between the surfaces" value={r.gap} sub={resolvable ? 'at least one step' : 'under one step'} color={resolvable ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Pixels z-fighting" value={pct(r.tiedShare)} sub={`of the ${pct(1 - r.clippedShare)} drawn`} color={r.tiedShare > 0 ? 'var(--orange)' : undefined} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Near plane" value={s.nearIndex} {...choice(NEAR_CHOICES)} onChange={(nearIndex) => set({ nearIndex })} />
          <Slider label="Far plane" value={s.farIndex} {...choice(FAR_CHOICES)} onChange={(farIndex) => set({ farIndex })} />
        </>,
        <>
          <Slider label="Distance to the surfaces" value={s.distance} min={DISTANCE_RANGE.min} max={DISTANCE_RANGE.max} step={DISTANCE_RANGE.step} onChange={(distance) => set({ distance })} />
          <Slider label="Gap between them" value={s.gapIndex} {...choice(GAP_CHOICES)} onChange={(gapIndex) => set({ gapIndex })} />
          <Button onClick={() => setS(initialDepth())}>Reset</Button>
        </>,
      ]}
    >
      <div className="td-stage stage-pad">
        <div className="td-row">
          <div className="td-col">
            <Box>
              <SectionTitle hint={`${DEPTH_IMAGE.w} by ${DEPTH_IMAGE.h} pixels, two parallel surfaces seen at a slant`}>Two surfaces, one depth buffer</SectionTitle>
              {url && <img className="td-img" src={url} alt={`Two surfaces; ${pct(r.tiedShare)} of the drawn pixels z-fight`} width={DEPTH_IMAGE.w * IMAGE_SCALE} height={DEPTH_IMAGE.h * IMAGE_SCALE} />}
            </Box>
          </div>
          <div className="td-col">
            <Box>
              <SectionTitle hint="a gap below the curve cannot be told apart">Smallest gap the buffer resolves</SectionTitle>
              <Plot2D
                x={{ domain: [DISTANCE_RANGE.min, DISTANCE_RANGE.max], label: 'distance from the camera' }}
                y={{ domain: [1e-6, 1e3], log: true, label: 'gap (distance units)' }}
                ariaLabel="Smallest resolvable gap against distance for the chosen near and far planes"
              >
                <Curve fn={(d) => depthResolution(d, r.near, r.far)} tone="info" />
                <Points data={[{ x: r.distance, y: r.gap, tone: resolvable ? 'ok' : 'bad', r: 5 }]} labels={() => (resolvable ? 'your gap: resolved' : 'your gap: z-fights')} />
              </Plot2D>
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative">a {DEPTH_BITS}-bit integer depth buffer, a named constant; real hardware varies</Provenance>
          <Provenance kind="from-memory">many engines use a floating-point depth buffer with reversed z to get more precision; check your engine</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
