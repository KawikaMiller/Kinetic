import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { DEFAULT_QUALITY, QUALITY } from './blocks';
import { dB, generationCaption } from './captions';
import { SAVES, SHIFT, SIDE, generations, syntheticImage } from './image';
import { grey, paintPixels } from './paint';

const SCALE = 3;
interface LossState {
  quality: number;
  saves: number;
  shift: number;
}
const initialLoss = (): LossState => ({ quality: DEFAULT_QUALITY, saves: SAVES.max, shift: 0 });
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'pixels the save changed', shape: 'line' },
      { color: 'var(--bad)', label: 'the shifted grid: it keeps changing', shape: 'dot' },
    ]}
  />
);

export function LossScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<LossState>(initialLoss);
  const image = useMemo(() => syntheticImage(), []);
  const g = useMemo(() => generations(image, s.quality, s.saves, s.shift), [image, s.quality, s.saves, s.shift]);
  const last = g.saved[g.saved.length - 1];
  const original = useMemo(() => paintPixels(SIDE, SIDE, (i) => grey(image[Math.floor(i / SIDE)][i % SIDE]), SCALE), [image]);
  const result = useMemo(() => paintPixels(SIDE, SIDE, (i) => grey(last[Math.floor(i / SIDE)][i % SIDE]), SCALE), [last]);
  const points = g.changed.map((c, i) => [i + 1, c] as [number, number]);
  const yMax = Math.max(100, Math.ceil(Math.max(...g.changed) / 500) * 500);
  const caption = generationCaption(s.quality, s.shift, g);
  return (
    <StageFrame
      height={700}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label={`Pixels changed by save ${s.saves}`} value={integer(g.changed[s.saves - 1])} sub={`save 1 changed ${integer(g.changed[0])}`} color={s.shift > 0 ? 'var(--bad)' : undefined} />
          <Stat label="PSNR against the original" value={dB(g.psnr[s.saves - 1])} sub={s.shift > 0 ? `moved ${s.shift * s.saves} pixels in total` : 'not moved'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Quality" value={s.quality} min={QUALITY.min} max={QUALITY.max} step={QUALITY.step} onChange={(quality) => setS((c) => ({ ...c, quality }))} />
          <Slider label="Re-saves" value={s.saves} min={SAVES.min} max={SAVES.max} onChange={(saves) => setS((c) => ({ ...c, saves }))} />
          <Slider label="Shift the grid between saves" value={s.shift} min={SHIFT.min} max={SHIFT.max} format={(v) => `${v} px`} onChange={(shift) => setS((c) => ({ ...c, shift }))} />
          <Button onClick={() => setS(initialLoss())}>Reset</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-row">
          <Box>
            <SectionTitle hint="before any save">Original</SectionTitle>
            {original && <img className="lc-img lc-img-sm" src={original} alt="The original synthetic image" width={SIDE * SCALE} height={SIDE * SCALE} />}
          </Box>
          <Box>
            <SectionTitle hint={`after ${s.saves} saves at quality ${s.quality}`}>After the saves</SectionTitle>
            {result && <img className="lc-img lc-img-sm" src={result} alt={`The image after ${s.saves} re-saves`} width={SIDE * SCALE} height={SIDE * SCALE} />}
          </Box>
        </div>
        <Box>
          <SectionTitle hint="measured by comparing each save's output with the image that went in">Pixels changed by each save</SectionTitle>
          <Plot2D x={{ domain: [1, Math.max(2, s.saves)], label: 'save number' }} y={{ domain: [0, yMax], label: 'pixels changed' }} ariaLabel="Pixels changed by each re-save">
            <Curve points={points} tone={s.shift > 0 ? 'bad' : 'info'} />
            <Points data={points.map(([x, y]) => ({ x, y, tone: s.shift > 0 ? ('bad' as const) : ('info' as const) }))} r={3} />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">each save is the lesson's own encode and decode; the changes are counted, not claimed (the last digits of the counts depend on this engine's floating-point rounding)</Provenance>
          <Provenance kind="illustrative">the shift wraps around the edges and stands for a crop or an edit that moves the 8 by 8 grid</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
