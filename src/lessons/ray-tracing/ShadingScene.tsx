import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { decimal, integer } from '../../core/format';
import { shadingCaption } from './captions';
import { paintPixels } from '../../components/canvasImage';
import { RENDER_SCALE, RenderView } from './RenderView';
import { IMAGE, MAX_BOUNCES, PRESETS, initialTrace, moveBody, render, sceneOf, settingsOf, type TraceState } from './scene';
import { TopDown } from './TopDown';

const SHININESS = { min: 1, max: 64, step: 1 } as const;
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'the light (drag it)', shape: 'dot' },
      { color: 'var(--muted)', label: 'a sphere (drag it)', shape: 'dot' },
    ]}
  />
);

export function ShadingScene({ picker, onSixtyFour }: { picker: ReactNode; onSixtyFour: () => void }) {
  const [s, setS] = useState<TraceState>(initialTrace);
  const [replay, setReplay] = useState(0);
  const scene = useMemo(() => sceneOf(s), [s]);
  const r = useMemo(() => render(scene, settingsOf(s)), [scene, s]);
  const url = useMemo(() => paintPixels(IMAGE.w, IMAGE.h, (i) => r.image.pixels[i], RENDER_SCALE), [r]);
  const caption = shadingCaption(s, r);
  const light = (patch: Partial<TraceState['lighting']>) => setS((c) => ({ ...c, lighting: { ...c.lighting, ...patch } }));
  return (
    <StageFrame
      height={640}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Ray-object tests" value={integer(r.stats.objectTests)} sub={`${decimal(r.stats.objectTests / (IMAGE.w * IMAGE.h), 1)} per pixel, counted`} />
          <Stat label="Budget" value={integer(r.budget)} sub="2 · pixels · objects · (1 + bounces)" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Ambient" value={s.lighting.ambient} min={0} max={1} step={0.05} format={(v) => decimal(v, 2)} onChange={(ambient) => light({ ambient })} />
          <Slider label="Diffuse" value={s.lighting.diffuse} min={0} max={1} step={0.05} format={(v) => decimal(v, 2)} onChange={(diffuse) => light({ diffuse })} />
          <Slider label="Specular" value={s.lighting.specular} min={0} max={1} step={0.05} format={(v) => decimal(v, 2)} onChange={(specular) => light({ specular })} />
          <Slider label="Shininess" value={s.lighting.shininess} min={SHININESS.min} max={SHININESS.max} step={SHININESS.step} onChange={(shininess) => light({ shininess })} />
        </>,
        <>
          <Toggle label="Shadows" value={s.shadows} onChange={(shadows) => setS((c) => ({ ...c, shadows }))} off="off" on="on" />
          <Slider label="Mirror ball reflectivity" value={s.mirror} min={0} max={1} step={0.1} format={(v) => decimal(v, 1)} onChange={(mirror) => setS((c) => ({ ...c, mirror }))} />
          <Slider label="Bounce depth" value={s.bounces} min={0} max={MAX_BOUNCES} onChange={(bounces) => setS((c) => ({ ...c, bounces }))} />
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => <ChipButton key={p.id} tone="info" onClick={() => setS((c) => p.apply(c))}>{p.label}</ChipButton>)}
            <ChipButton tone="info" onClick={onSixtyFour}>64 spheres</ChipButton>
          </ControlGroup>
          <Button onClick={() => setReplay((n) => n + 1)}>Trace again</Button>
          <Button onClick={() => setS(initialTrace())}>Reset</Button>
        </>,
      ]}
    >
      <div className="rt-stage stage-pad">
        <div className="rt-row">
          <div className="rt-col">
            <Box>
              <SectionTitle hint="re-rendered on every change">The picture</SectionTitle>
              <RenderView url={url} replay={replay} ariaLabel="Ray-traced picture of three spheres on a floor" />
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
          <Provenance kind="simulated">Lambert diffuse plus Phong specular, one light, mirror rays only; no refraction and no soft shadows</Provenance>
          <Provenance kind="from-memory">real-time systems use dedicated ray-tracing hardware and denoisers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
