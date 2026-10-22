import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { integer } from '../../core/format';
import { lerp } from '../../core/math';
import { DEFAULT_QUALITY, QUALITY } from './blocks';
import { dB, imageCaption } from './captions';
import { RAW_BYTES, SIDE, measure, rateDistortion, syntheticImage } from './image';
import { grey, paintPixels, tokenRgb } from './paint';

const SCALE = 3;
const ERROR_FULL = 64;
const GRID_LINES = Array.from({ length: SIDE / 8 - 1 }, (_, i) => (i + 1) * 8);
const BAD = tokenRgb('bad');
const BG = tokenRgb('bg2');
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--violet)', label: 'the 8 by 8 block grid', shape: 'line' },
      { color: 'var(--bad)', label: 'difference from the original, stronger when larger', shape: 'square' },
      { color: 'var(--hi)', label: 'the current quality on the curve', shape: 'dot' },
    ]}
  />
);

export function ImageScene({ picker }: { picker: ReactNode }) {
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [overlay, setOverlay] = useState(false);
  const image = useMemo(() => syntheticImage(), []);
  const curve = useMemo(() => rateDistortion(image), [image]);
  const here = useMemo(() => measure(image, quality), [image, quality]);
  const original = useMemo(() => paintPixels(SIDE, SIDE, (i) => grey(image[Math.floor(i / SIDE)][i % SIDE]), SCALE), [image]);
  const recon = useMemo(() => paintPixels(SIDE, SIDE, (i) => grey(here.encoded.reconstructed[Math.floor(i / SIDE)][i % SIDE]), SCALE), [here]);
  const diff = useMemo(
    () => paintPixels(SIDE, SIDE, (i) => {
      const y = Math.floor(i / SIDE);
      const x = i % SIDE;
      const t = Math.min(1, Math.abs(image[y][x] - here.encoded.reconstructed[y][x]) / ERROR_FULL);
      return [lerp(BG[0], BAD[0], t), lerp(BG[1], BAD[1], t), lerp(BG[2], BAD[2], t)];
    }, SCALE),
    [image, here],
  );
  const points = curve.map((p) => [p.bytes, p.psnr] as [number, number]);
  const xMax = Math.ceil(Math.max(...curve.map((p) => p.bytes)) / 500) * 500;
  const yMin = Math.floor(Math.min(...curve.map((p) => p.psnr)) / 5) * 5 - 5;
  const yMax = Math.ceil(Math.max(...curve.map((p) => p.psnr)) / 5) * 5 + 5;
  const caption = imageCaption(quality, here.point);
  return (
    <StageFrame
      height={700}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Estimated size" value={`${integer(Math.round(here.point.bytes))} B`} sub={`of ${integer(RAW_BYTES)} B raw`} />
          <Stat label="PSNR" value={dB(here.point.psnr)} sub={`MSE ${here.point.mse.toFixed(2)}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Quality" value={quality} min={QUALITY.min} max={QUALITY.max} step={QUALITY.step} onChange={setQuality} />
          <Toggle label="Block grid" value={overlay} onChange={setOverlay} off="off" on="on" />
          <Button onClick={() => { setQuality(DEFAULT_QUALITY); setOverlay(false); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-row">
          <Box>
            <SectionTitle hint="64 by 64, grey">Original</SectionTitle>
            {original && <img className="lc-img lc-img-sm" src={original} alt="The original synthetic image: a gradient, a bright disc, a dark stripe and a patch of noise" width={SIDE * SCALE} height={SIDE * SCALE} />}
          </Box>
          <Box>
            <SectionTitle hint={`quality ${quality}`}>Reconstruction</SectionTitle>
            <div className="lc-imgbox">
              {recon && <img className="lc-img lc-img-sm" src={recon} alt={`The image after compression at quality ${quality}`} width={SIDE * SCALE} height={SIDE * SCALE} />}
              {overlay && (
                <svg className="lc-grid" viewBox={`0 0 ${SIDE} ${SIDE}`} aria-hidden="true">
                  {GRID_LINES.map((p) => (
                    <g key={p}>
                      <line x1={p} y1={0} x2={p} y2={SIDE} />
                      <line x1={0} y1={p} x2={SIDE} y2={p} />
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </Box>
          <Box>
            <SectionTitle hint="how far each pixel moved">Difference</SectionTitle>
            {diff && <img className="lc-img lc-img-sm" src={diff} alt="Where the reconstruction differs from the original, brighter red for a larger difference" width={SIDE * SCALE} height={SIDE * SCALE} />}
          </Box>
        </div>
        <Box>
          <SectionTitle hint="each dot is one quality from 5 to 95">Size against quality of picture</SectionTitle>
          <Plot2D x={{ domain: [0, xMax], label: 'estimated size (bytes)' }} y={{ domain: [yMin, yMax], label: 'PSNR (dB)' }} ariaLabel="Rate-distortion curve: estimated size against PSNR for qualities 5 to 95, with the current quality marked">
            <Curve points={points} tone="info" />
            <Points data={[{ x: here.point.bytes, y: Math.min(here.point.psnr, yMax), tone: 'hi', r: 6 }]} />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the reconstruction and the error are computed from the DCT and the quantisation</Provenance>
          <Provenance kind="illustrative">the size is an estimate from symbol entropy, not a real JPEG file; baseline grey only</Provenance>
          <Provenance kind="simulated" seed={12}>the image is synthetic, drawn from a seed</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
