import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { blendCaption, regionLabel } from './captions';
import { ALPHA_RANGE, BACKGROUND, BLEND_GRID, COLOUR_A, COLOUR_B, blend, initialBlend, probePixel, type BlendOrder, type BlendState, type Region } from './blend';
import { paintPixels, rgbText } from './paint';

const IMAGE_SCALE = 10;
const TABLE_MIN_WIDTH = 340;
const ORDER_OPTIONS: { value: BlendOrder; label: string }[] = [
  { value: 'a-then-b', label: 'A then B' },
  { value: 'b-then-a', label: 'B then A' },
];
const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: 'both', label: 'overlap' },
  { value: 'a-only', label: 'only A' },
  { value: 'b-only', label: 'only B' },
  { value: 'none', label: 'neither' },
];
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--pink)', label: 'triangle A', shape: 'square' },
      { color: 'var(--sky)', label: 'triangle B', shape: 'square' },
      { color: 'var(--hi)', label: 'the pixel being read', shape: 'dot' },
    ]}
  />
);

export function BlendScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<BlendState>(initialBlend);
  const [region, setRegion] = useState<Region>('both');
  const result = useMemo(() => blend(s), [s]);
  const url = useMemo(() => paintPixels(BLEND_GRID.w, BLEND_GRID.h, (i) => result.pixels[i], IMAGE_SCALE), [result]);
  const slot = probePixel(region);
  const steps = result.steps[slot];
  const caption = blendCaption(s, region);
  const [px, py] = [slot % BLEND_GRID.w, Math.floor(slot / BLEND_GRID.w)];
  return (
    <StageFrame
      height={540}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="The pixel's colour" value={rgbText(result.pixels[slot])} sub={`pixel (${px}, ${py}): ${regionLabel(region)} it`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Draw" value={s.order} onChange={(order) => setS((c) => ({ ...c, order }))} options={ORDER_OPTIONS} />
          <Segmented label="Read the pixel where" value={region} onChange={setRegion} options={REGION_OPTIONS} />
        </>,
        <>
          <Slider label="Alpha of A" value={s.alphaA} min={ALPHA_RANGE.min} max={ALPHA_RANGE.max} step={ALPHA_RANGE.step} format={(v) => decimal(v, 1)} onChange={(alphaA) => setS((c) => ({ ...c, alphaA }))} />
          <Slider label="Alpha of B" value={s.alphaB} min={ALPHA_RANGE.min} max={ALPHA_RANGE.max} step={ALPHA_RANGE.step} format={(v) => decimal(v, 1)} onChange={(alphaB) => setS((c) => ({ ...c, alphaB }))} />
          <Button onClick={() => { setS(initialBlend()); setRegion('both'); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <div className="gp-row">
          <div className="gp-col">
            <Box>
              <SectionTitle hint="source-alpha blending over a dark background">Two translucent triangles</SectionTitle>
              <div className="gp-imgbox">
                <img className="gp-img" src={url ?? undefined} alt={`Two translucent triangles drawn ${s.order === 'a-then-b' ? 'A then B' : 'B then A'}`} width={BLEND_GRID.w * IMAGE_SCALE} height={BLEND_GRID.h * IMAGE_SCALE} />
                <span className="gp-ring" aria-hidden="true" style={{ left: `${((px + 0.5) / BLEND_GRID.w) * 100}%`, top: `${((py + 0.5) / BLEND_GRID.h) * 100}%` }} />
              </div>
            </Box>
          </div>
          <div className="gp-col">
            <Box>
              <SectionTitle hint="alpha · source + (1 - alpha) · what is already there">The blend at that pixel</SectionTitle>
              <WideRegion minWidth={TABLE_MIN_WIDTH} label="Blend steps: scroll sideways to see all of it" hint="swipe to see the whole table">
                <table className="data-table gp-table">
                  <thead><tr><th>Drawn</th><th>Alpha</th><th>Source</th><th>Before</th><th>After</th></tr></thead>
                  <tbody>
                    {steps.length === 0 && <tr><td colSpan={5}>nothing is drawn here: the background {rgbText(BACKGROUND)} stays</td></tr>}
                    {steps.map((st) => (
                      <tr key={st.triangle}>
                        <td>{st.triangle}</td>
                        <td>{decimal(st.alpha, 1)}</td>
                        <td>{rgbText(st.triangle === 'A' ? COLOUR_A : COLOUR_B)}</td>
                        <td>{rgbText(st.before)}</td>
                        <td>{rgbText(st.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WideRegion>
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">two triangles on a 32 by 24 grid, blended by the formula; no sorting, no premultiplied alpha</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
