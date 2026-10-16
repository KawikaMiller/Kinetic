import { useMemo, useState } from 'react';
import { CellGrid } from '../components/CellGrid';
import { Bars, Plot2D } from '../components/Plot2D';
import { paintImage } from '../components/canvasImage';
import { Slider, Stat, Stats, Toggle } from '../components/ui';
import { SectionTitle } from '../components/Panel';
import { JPEG_LUMA_TABLE, dct2, dequantise, idct2, levelShift, quantise, scaleQuantTable, type Grid } from '../core/dct';
import { lookAt, perspective, projectToScreen, rotationY, type Vec3 } from '../core/raster3d';
import { makeCamera, makeScene, newTraceStats, renderImage, type SceneObject, type TraceSettings } from '../core/raytrace';
import { matMul } from '../core/vec';
import { fft, dft, fromReal, magnitudes, mse, newOpCount, psnr, window as windowOf, applyWindow } from '../core/signal';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 8 to 9, agent L: core/signal, core/dct (#/dev/kit). */

const N = 64;
const SAMPLE_BLOCK: Grid = [
  [52, 55, 61, 66, 70, 61, 64, 73],
  [63, 59, 55, 90, 109, 85, 69, 72],
  [62, 59, 68, 113, 144, 104, 66, 73],
  [63, 58, 71, 122, 154, 106, 70, 69],
  [67, 61, 68, 104, 126, 88, 68, 70],
  [79, 65, 60, 70, 77, 68, 58, 75],
  [85, 71, 64, 59, 55, 61, 65, 83],
  [87, 79, 69, 68, 65, 76, 78, 94],
];

function SpectrumDemo() {
  const [cycles, setCycles] = useState(8.5);
  const [hann, setHann] = useState(false);
  const [bars, work] = useMemo(() => {
    const tone = Array.from({ length: N }, (_, t) => Math.sin((2 * Math.PI * cycles * t) / N));
    const x = hann ? applyWindow(tone, windowOf('hann', N)) : tone;
    const slow = newOpCount();
    const fast = newOpCount();
    dft(fromReal(x), slow);
    const mags = magnitudes(fft(fromReal(x), fast)).slice(0, N / 2);
    return [mags.map((y, k) => ({ x0: k, x1: k + 1, y })), { slow: slow.complexMuls, fast: fast.complexMuls }];
  }, [cycles, hann]);
  return (
    <>
      <Slider label="Cycles in the window" value={cycles} min={1} max={20} step={0.5} format={(v) => `${v}`} onChange={setCycles} />
      <Toggle label="Hann window" value={hann} onChange={setHann} />
      <Plot2D x={{ domain: [0, N / 2], label: 'bin' }} y={{ domain: [0, N / 2], label: 'magnitude' }} ariaLabel="Magnitude spectrum of a sampled tone">
        <Bars bars={bars} tone="info" />
      </Plot2D>
      <Stats>
        <Stat label="DFT multiplications" value={work.slow} sub="N squared, counted" />
        <Stat label="FFT multiplications" value={work.fast} sub="(N/2) log2 N, counted" />
      </Stats>
    </>
  );
}

function DctDemo() {
  const [quality, setQuality] = useState(50);
  const result = useMemo(() => {
    const table = scaleQuantTable(JPEG_LUMA_TABLE, quality);
    const levels = quantise(dct2(levelShift(SAMPLE_BLOCK)), table);
    const reconstructed = levelShift(idct2(dequantise(levels, table)), -128);
    return { levels, error: psnr(SAMPLE_BLOCK.flat(), reconstructed.flat().map((v) => Math.round(v))), mse: mse(SAMPLE_BLOCK.flat(), reconstructed.flat()) };
  }, [quality]);
  const kept = result.levels.flat().filter((v) => v !== 0).length;
  return (
    <>
      <Slider label="Quality" value={quality} min={1} max={100} onChange={setQuality} />
      <CellGrid
        rows={8}
        cols={8}
        size="sm"
        cell={(r, c) => {
          const v = result.levels[r][c];
          return { text: v, tone: r === 0 && c === 0 ? 'amber' : v === 0 ? 'dim' : 'hi', fill: v === 0 ? 'none' : 'tint' };
        }}
      />
      <Stats>
        <Stat label="Non-zero levels" value={`${kept} of 64`} />
        <Stat label="PSNR" value={Number.isFinite(result.error) ? `${result.error.toFixed(1)} dB` : 'infinite'} sub={`MSE ${result.mse.toFixed(2)}`} />
      </Stats>
    </>
  );
}

const VIEW_W = 200;
const VIEW_H = 150;
const CUBE_CORNERS: Vec3[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
const CUBE_EDGES = CUBE_CORNERS.flatMap((a, i) => CUBE_CORNERS.flatMap((b, j) => (j > i && b.filter((v, k) => v !== a[k]).length === 1 ? [[i, j] as const] : [])));

function CubeDemo() {
  const [turn, setTurn] = useState(30);
  const [fov, setFov] = useState(60);
  const [distance, setDistance] = useState(6);
  const view = lookAt([0, 1.5, distance], [0, 0, 0], [0, 1, 0]);
  const model = rotationY((turn * Math.PI) / 180);
  const mvp = view ? matMul(matMul(perspective((fov * Math.PI) / 180, VIEW_W / VIEW_H, 0.5, 50), view), model) : null;
  const projected = mvp ? CUBE_CORNERS.map((c) => projectToScreen(mvp, c, VIEW_W, VIEW_H)) : [];
  const first = projected[0];
  return (
    <>
      <Slider label="Turn" value={turn} min={0} max={180} onChange={setTurn} format={(v) => `${v}°`} />
      <Slider label="Field of view" value={fov} min={20} max={120} onChange={setFov} format={(v) => `${v}°`} />
      <Slider label="Camera distance" value={distance} min={0.5} max={12} step={0.5} onChange={setDistance} />
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="Wireframe cube through the projection" style={{ width: '100%', maxWidth: 400, background: 'var(--panel)' }}>
        {CUBE_EDGES.map(([i, j]) => {
          const a = projected[i];
          const b = projected[j];
          if (!a?.screen || !b?.screen || a.behind || b.behind) return null;
          const visible = a.inFrustum && b.inFrustum;
          return <line key={`${i}-${j}`} x1={a.screen[0]} y1={a.screen[1]} x2={b.screen[0]} y2={b.screen[1]} stroke={visible ? 'var(--info)' : 'var(--dim)'} strokeWidth={1.5} />;
        })}
      </svg>
      <Stats>
        <Stat label="Corner 0, clip" value={first ? first.clip.map((v) => v.toFixed(2)).join(', ') : 'no camera direction'} sub="x, y, z, w" />
        <Stat label="Corner 0, NDC" value={first?.ndc ? first.ndc.map((v) => v.toFixed(2)).join(', ') : 'w = 0'} sub="after dividing by w" />
        <Stat label="Corners behind the camera" value={projected.filter((p) => p.behind).length} sub="edges to them are not drawn" />
      </Stats>
    </>
  );
}

const TRACE_W = 48;
const TRACE_H = 36;
const TRACE_SETTINGS: TraceSettings = { lighting: { ambient: 0.15, diffuse: 0.8, specular: 0.4, shininess: 24 }, shadows: true, maxBounces: 1, bias: 1e-4 };
const TRACE_OBJECTS: SceneObject[] = [
  { kind: 'plane', point: [0, -1, 0], normal: [0, 1, 0], material: { color: [0.6, 0.6, 0.6], reflectivity: 0 } },
  { kind: 'sphere', center: [-1.2, 0, -6], radius: 1, material: { color: [0.9, 0.3, 0.2], reflectivity: 0 } },
  { kind: 'sphere', center: [1.2, 0, -6], radius: 1, material: { color: [0.8, 0.8, 0.9], reflectivity: 0.6 } },
];

function TraceDemo() {
  const [bvh, setBvh] = useState(false);
  const [lightX, setLightX] = useState(3);
  const render = useMemo(() => {
    const camera = makeCamera([0, 1, 1], [0, 0, -6], [0, 1, 0], 1);
    if (!camera) return null;
    const stats = newTraceStats();
    const image = renderImage(makeScene(TRACE_OBJECTS, [lightX, 5, -2], { bvh }), camera, TRACE_W, TRACE_H, TRACE_SETTINGS, stats);
    const url = paintImage(TRACE_W, TRACE_H, (ctx) => {
      image.pixels.forEach((c, i) => {
        ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`; // allow-color: pixel data computed by the tracer, not a theme colour
        ctx.fillRect(i % TRACE_W, Math.floor(i / TRACE_W), 1, 1);
      });
    }, 1);
    return { url, tests: stats.objectTests, boxes: stats.boxTests };
  }, [bvh, lightX]);
  return (
    <>
      <Toggle label="Bounding volume hierarchy" value={bvh} onChange={setBvh} />
      <Slider label="Light x" value={lightX} min={-6} max={6} step={0.5} onChange={setLightX} />
      {render?.url && <img src={render.url} width={TRACE_W * 4} height={TRACE_H * 4} alt="Ray-traced spheres on a floor" style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }} />}
      <Stats>
        <Stat label="Ray-object tests" value={render?.tests ?? 0} sub="counted while tracing" />
        <Stat label="Ray-box tests" value={render?.boxes ?? 0} sub="0 without the hierarchy" />
      </Stats>
    </>
  );
}

export function DevKitTier3l() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 8 to 9 round, agent L</SectionTitle>
      <Section title="core/raster3d · a cube through model, view, projection, the divide by w and the viewport (OpenGL conventions); edges with a corner behind the camera are dropped, edges leaving the frustum go dim">
        <CubeDemo />
      </Section>
      <Section title="core/raytrace · two spheres and a floor traced at 48 by 36; the bounding volume hierarchy gives the same image with fewer counted tests">
        <TraceDemo />
      </Section>
      <Section title="core/signal · tone spectrum by the FFT, leakage with a fractional number of cycles, the Hann window, counted DFT vs FFT work">
        <SpectrumDemo />
      </Section>
      <Section title="core/dct · an 8 by 8 block through DCT, quantisation (libjpeg quality rule) and back; zeroed levels are dim, DC is amber">
        <DctDemo />
      </Section>
    </>
  );
}
