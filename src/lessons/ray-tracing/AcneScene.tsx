import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { acneCaption } from './captions';
import { paintRings } from './paint';
import { paintPixels } from '../../components/canvasImage';
import { RENDER_SCALE, RenderView } from './RenderView';
import { BIAS_CHOICES, IMAGE, differsFromClean, initialTrace, moveBody, render, sceneOf, settingsOf, type TraceState } from './scene';
import { TopDown } from './TopDown';

/** This scene opens on bias 0, the failure state. */
const initialAcne = (): TraceState => ({ ...initialTrace(), biasIndex: 0 });
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--bad)', label: 'a pixel that differs from the clean render (ringed)', shape: 'square' },
      { color: 'var(--amber)', label: 'the light (drag it)', shape: 'dot' },
    ]}
  />
);

export function AcneScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<TraceState>(initialAcne);
  const [rings, setRings] = useState(true);
  const [replay, setReplay] = useState(0);
  const scene = useMemo(() => sceneOf(s), [s]);
  const r = useMemo(() => render(scene, settingsOf(s)), [scene, s]);
  const flagged = useMemo(() => differsFromClean(s), [s]);
  const count = flagged.filter(Boolean).length;
  const url = useMemo(() => paintPixels(IMAGE.w, IMAGE.h, (i) => r.image.pixels[i], RENDER_SCALE), [r]);
  const ringsUrl = useMemo(() => paintRings(IMAGE.w, IMAGE.h, flagged, RENDER_SCALE), [flagged]);
  const caption = acneCaption(s, count);
  return (
    <StageFrame
      height={620}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Bias" value={BIAS_CHOICES[s.biasIndex]} sub="distance along the normal" />
          <Stat label="Pixels that differ from the clean render" value={count} color={count > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${IMAGE.w * IMAGE.h}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Bias" value={s.biasIndex} min={0} max={BIAS_CHOICES.length - 1} format={(i) => String(BIAS_CHOICES[i])} onChange={(biasIndex) => setS((c) => ({ ...c, biasIndex }))} />
          <Toggle label="Ring the pixels" value={rings} onChange={setRings} off="off" on="on" />
        </>,
        <>
          <Button onClick={() => setReplay((n) => n + 1)}>Trace again</Button>
          <Button onClick={() => { setS(initialAcne()); setRings(true); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="rt-stage stage-pad">
        <div className="rt-row">
          <div className="rt-col">
            <Box>
              <SectionTitle hint="bias is where secondary rays start, along the surface normal">The picture</SectionTitle>
              <RenderView url={url} ringsUrl={rings ? ringsUrl : null} replay={replay} ariaLabel={`Ray-traced picture at bias ${BIAS_CHOICES[s.biasIndex]}; ${count} pixels differ from the clean render`} />
            </Box>
          </div>
          <div className="rt-col">
            <Box>
              <SectionTitle hint="drag the light or a sphere, or focus one and use the arrow keys">The scene from above</SectionTitle>
              <TopDown state={s} onMove={(i, p) => setS((c) => moveBody(c, i, p))} />
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">the clean render is the same scene at bias 0.001, which is not an exact render (its own bias can shift a shadow edge by a pixel); a pixel counts when a channel differs by more than 0.02. The exact speckle pattern at bias 0 depends on this tracer's floating-point rounding</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
