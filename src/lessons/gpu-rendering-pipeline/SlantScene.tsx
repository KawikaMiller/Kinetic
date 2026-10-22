import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import { slantCaption } from './captions';
import { paintPixels, tokenRgb } from './paint';
import { IMAGE } from './render';
import { bentPixels, quadImage } from './slant';

const IMAGE_SCALE = 2;
const SQUARE_A = tokenRgb('sky');
const SQUARE_B = tokenRgb('line');
const OUTSIDE = tokenRgb('bg2');
const MODES = [
  { value: 'linear', label: 'screen-linear (wrong)' },
  { value: 'correct', label: 'perspective-correct' },
] as const;
type Mode = (typeof MODES)[number]['value'];
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--sky)', label: 'checker square, light', shape: 'square' },
      { color: 'var(--line)', label: 'checker square, dark', shape: 'square' },
    ]}
  />
);

export function SlantScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('correct');
  const correct = mode === 'correct';
  const bent = useMemo(() => bentPixels(), []);
  const image = useMemo(() => quadImage(correct), [correct]);
  const url = useMemo(
    () => paintPixels(IMAGE.w, IMAGE.h, (i) => (image[i].parity === null ? OUTSIDE : image[i].parity === 0 ? SQUARE_A : SQUARE_B), IMAGE_SCALE),
    [image],
  );
  const caption = slantCaption(correct, bent);
  return (
    <StageFrame
      height={520}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Pixels that differ between the modes" value={bent.differing} sub={`${pct(bent.differing / bent.covered)} of the ${bent.covered} covered`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Interpolation" value={mode} onChange={setMode} options={[...MODES]} />
          <Button onClick={() => setMode('correct')}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <div className="gp-row">
          <div className="gp-col">
            <Box>
              <SectionTitle hint="a floor receding from the camera, one checker square per two world units">A checker on a slanted quad</SectionTitle>
              <img className="gp-img" src={url ?? undefined} alt={`A checker floor receding into the distance, interpolated ${correct ? 'perspective-correct' : 'screen-linear, so the squares bend'}`} width={IMAGE.w * IMAGE_SCALE} height={IMAGE.h * IMAGE_SCALE} />
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">the quad is two triangles; texture coordinates are interpolated by the software pipeline in each mode</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
