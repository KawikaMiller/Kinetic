import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import type { TokenName } from '../../core/palette';
import { overdrawCaption } from './captions';
import { OVERDRAW_GRID, ORDERS, initialOverdraw, overdraw, type OverdrawState } from './overdraw';
import { paintPixels, tokenRgb } from '../../components/canvasImage';

const IMAGE_SCALE = 8;
/** Triangles from the farthest to the nearest take four plain tones, so none of them reads as pass or fail. */
const TRIANGLE_TOKENS: readonly TokenName[] = ['amber', 'pink', 'sky', 'muted'];
const TRIANGLE_COLOURS = TRIANGLE_TOKENS.map(tokenRgb);
const OUTSIDE = tokenRgb('bg2');
const LEGEND = (
  <Legend
    items={TRIANGLE_TOKENS.map((t, i) => ({ color: `var(--${t})`, label: `triangle ${i + 1}${i === 0 ? ' (farthest)' : i === TRIANGLE_TOKENS.length - 1 ? ' (nearest)' : ''}`, shape: 'square' as const }))}
  />
);

export function OrderScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<OverdrawState>(initialOverdraw);
  const r = useMemo(() => overdraw(s), [s]);
  const url = useMemo(
    () => paintPixels(OVERDRAW_GRID.w, OVERDRAW_GRID.h, (i) => (r.rendered.id[i] < 0 ? OUTSIDE : TRIANGLE_COLOURS[r.rendered.id[i]]), IMAGE_SCALE),
    [r],
  );
  const caption = overdrawCaption(s);
  return (
    <StageFrame
      height={540}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Fragments rasterised" value={r.rendered.coveredFragments} sub="candidates for a pixel" />
          <Stat label="Fragment shader runs" value={r.rendered.shaderInvocations} sub="the cost" color="var(--bad)" />
          <Stat label="Runs thrown away" value={r.wasted} sub={`${r.visible} pixels show a triangle`} color={r.wasted > 0 ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Draw order" value={s.order} onChange={(order) => setS((c) => ({ ...c, order }))} options={[...ORDERS]} />
          <Toggle label="Early depth test" value={s.earlyZ} onChange={(earlyZ) => setS((c) => ({ ...c, earlyZ }))} off="off" on="on" />
          <Button onClick={() => setS(initialOverdraw())}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <div className="gp-row">
          <div className="gp-col">
            <Box>
              <SectionTitle hint={`${OVERDRAW_GRID.w} by ${OVERDRAW_GRID.h} pixels, drawn in the order ${r.drawOrder.map((i) => i + 1).join(', ')}`}>Four opaque triangles</SectionTitle>
              <img className="gp-img" src={url ?? undefined} alt={`Four overlapping opaque triangles; the picture is the same in every order; the shader ran ${r.rendered.shaderInvocations} times`} width={OVERDRAW_GRID.w * IMAGE_SCALE} height={OVERDRAW_GRID.h * IMAGE_SCALE} />
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">flat-depth triangles in a software z-buffer with the invocations counted, not measured on a GPU</Provenance>
          <Provenance kind="from-memory">the early depth test is skipped when a shader writes depth or discards fragments</Provenance>
          <Provenance kind="simulated" seed={7}>the shuffled order is a fixed seeded shuffle</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
