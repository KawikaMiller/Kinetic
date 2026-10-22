import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { integer } from '../../core/format';
import { bvhCaption } from './captions';
import { mixRgb } from './paint';
import { paintPixels, tokenRgb } from '../../components/canvasImage';
import { RENDER_SCALE, RenderView } from './RenderView';
import { IMAGE, MANY, compareBvh, manySpheres } from './scene';

const HEAT_COLD = tokenRgb('bg2');
const HEAT_HOT = tokenRgb('info');
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'many ray-object tests at that pixel', shape: 'square' },
      { color: 'var(--bg-2)', label: 'few or none', shape: 'square' },
    ]}
  />
);

export function BvhScene({ picker }: { picker: ReactNode }) {
  const [bvh, setBvh] = useState(false);
  const [replay, setReplay] = useState(0);
  const cmp = useMemo(() => compareBvh(manySpheres()), []);
  const shown = bvh ? cmp.withBvh : cmp.without;
  const peak = Math.max(...cmp.without.image.testsPerPixel, 1);
  const url = useMemo(() => paintPixels(IMAGE.w, IMAGE.h, (i) => shown.image.pixels[i], RENDER_SCALE), [shown]);
  const heat = useMemo(
    () => paintPixels(IMAGE.w, IMAGE.h, (i) => mixRgb(HEAT_COLD, HEAT_HOT, shown.image.testsPerPixel[i] / peak), RENDER_SCALE),
    [shown, peak],
  );
  const caption = bvhCaption(cmp, bvh);
  return (
    <StageFrame
      height={620}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Object tests without" value={integer(cmp.without.stats.objectTests)} sub="spheres tested one by one" />
          <Stat label="Object tests with" value={integer(cmp.withBvh.stats.objectTests)} sub={`plus ${integer(cmp.withBvh.stats.boxTests)} box tests`} color="var(--ok)" />
          <Stat label="Images" value={cmp.identical ? 'identical' : 'different'} color={cmp.identical ? 'var(--ok)' : 'var(--bad)'} sub="pixel for pixel" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Bounding volume hierarchy" value={bvh} onChange={setBvh} off="off" on="on" />
          <Button onClick={() => setReplay((n) => n + 1)}>Trace again</Button>
          <Button onClick={() => setBvh(false)}>Reset</Button>
        </>,
      ]}
    >
      <div className="rt-stage stage-pad">
        <div className="rt-row">
          <div className="rt-col">
            <Box>
              <SectionTitle hint={`${MANY.count} spheres and a floor`}>The picture</SectionTitle>
              <RenderView url={url} replay={replay} ariaLabel={`Ray-traced picture of ${MANY.count} spheres, ${bvh ? 'with' : 'without'} the hierarchy`} />
            </Box>
          </div>
          <div className="rt-col">
            <Box>
              <SectionTitle hint="ray-object tests per pixel (camera and shadow rays)">The work per pixel</SectionTitle>
              <RenderView url={heat} replay={replay} ariaLabel="Heat map of ray-object tests per pixel" />
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={MANY.seed}>seeded layout of 64 spheres; counts are measured while tracing, not estimated</Provenance>
          <Provenance kind="toy">a median-split hierarchy of boxes over the spheres; the floor is always tested</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
