import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { plainTone } from '../../core/tone';
import { epicycleCaption, shareText } from './captions';
import { SAMPLES, SHAPES, chainAt, circlesOf, pathOf, shapeError, shapeSamples, type ShapeId } from './epicycles';

/** The drawing is 3.4 units across, centred on the origin; the shapes are about 2 across. */
const VIEW = 1.7;
const SIZE = 340;
const TIME_STEP = 0.01;
const PLAY_MS = 40;
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--dim)', label: 'the shape (64 samples)', shape: 'line' },
      { color: 'var(--hi)', label: 'the path the circles trace', shape: 'line' },
      { color: 'var(--amber)', label: 'circles and arms, largest first (amber, pink, sky, orange)', shape: 'dot' },
    ]}
  />
);
const toPx = (v: number) => ((v + VIEW) / (2 * VIEW)) * SIZE;
const toPy = (v: number) => ((VIEW - v) / (2 * VIEW)) * SIZE;
const points = (zs: readonly { re: number; im: number }[]) => zs.map((z) => `${toPx(z.re).toFixed(2)},${toPy(z.im).toFixed(2)}`).join(' ');

interface EpicycleState {
  shape: ShapeId;
  used: number;
  t: number;
  playing: boolean;
}
const initialEpicycles = (): EpicycleState => ({ shape: 'letter', used: 3, t: 0, playing: false });

export function EpicycleScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<EpicycleState>(initialEpicycles);
  const z = useMemo(() => shapeSamples(s.shape), [s.shape]);
  const circles = useMemo(() => circlesOf(z), [z]);
  const path = useMemo(() => pathOf(circles, s.used), [circles, s.used]);
  const chain = chainAt(circles, s.used, s.t);
  const error = shapeError(z, circles, s.used);
  const total = circles.reduce((sum, c) => sum + c.radius ** 2, 0);
  const kept = circles.slice(0, s.used).reduce((sum, c) => sum + c.radius ** 2, 0) / total;
  const caption = epicycleCaption(s.shape, s.used);
  useEffect(() => {
    if (!s.playing) return;
    const id = setInterval(() => setS((c) => ({ ...c, t: (c.t + TIME_STEP) % 1 })), PLAY_MS);
    return () => clearInterval(id);
  }, [s.playing]);
  const tip = chain[chain.length - 1];
  return (
    <StageFrame
      height={620}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Circles used" value={`${s.used} of ${SAMPLES}`} />
          <Stat label="Error" value={decimal(error, 3)} color={error < 1e-9 ? 'var(--ok)' : 'var(--bad)'} sub="RMS distance at the samples" />
          <Stat label="Energy in these circles" value={shareText(kept)} sub="of the whole shape" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Shape" value={s.shape} onChange={(shape: ShapeId) => setS((c) => ({ ...c, shape }))} options={[...SHAPES]} />
        </>,
        <>
          <Slider label="Circles used" value={s.used} min={1} max={SAMPLES} onChange={(used) => setS((c) => ({ ...c, used }))} />
          <Slider label="Time in the period" value={s.t} min={0} max={1 - TIME_STEP} step={TIME_STEP} format={(v) => decimal(v, 2)} onChange={(t) => setS((c) => ({ ...c, t, playing: false }))} />
          <Button onClick={() => setS((c) => ({ ...c, playing: !c.playing }))}>{s.playing ? 'Pause' : 'Play'}</Button>
          <Button onClick={() => setS(initialEpicycles())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ft-stage stage-pad">
        <Box>
          <SectionTitle hint="each circle turns at a whole number of turns per period; its size is one DFT coefficient">Circles chained tip to tail</SectionTitle>
          <svg className="ft-epi" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Epicycles: the ${s.used} largest circles of the ${s.shape} chained tip to tail, tracing its outline`}>
            <polygon className="ft-shape" points={points(z)} />
            <polyline className="ft-path" points={points(path)} />
            {chain.slice(0, -1).map((from, i) => {
              const r = circles[i].radius;
              const to = chain[i + 1];
              const tone = plainTone(i);
              return (
                <g key={i} style={{ color: `var(--${tone})` }}>
                  <circle className="ft-circle" cx={toPx(from.re)} cy={toPy(from.im)} r={(r / (2 * VIEW)) * SIZE} />
                  <line className="ft-arm" x1={toPx(from.re)} y1={toPy(from.im)} x2={toPx(to.re)} y2={toPy(to.im)} />
                </g>
              );
            })}
            <circle className="ft-pen" cx={toPx(tip.re)} cy={toPy(tip.im)} r={4} />
          </svg>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the circles are the DFT of the 64 samples, computed here</Provenance>
          <Provenance kind="illustrative">the shapes are small hand-made outlines, resampled evenly along their length</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
