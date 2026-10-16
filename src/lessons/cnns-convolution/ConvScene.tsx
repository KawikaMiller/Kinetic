import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { decimal } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { KernelFields } from './KernelFields';
import { ImageGrid, MapGrid } from './MapGrid';
import { slideFrames } from './frames';
import {
  IMAGE_PRESETS, KERNEL_PRESETS, KERNEL_SIZE, NOISE_LEVELS, PADS, STRIDES, convolve, kernelOf, outputSize, paintCell, presetImage, windowSteps,
  type ConvOptions, type ImagePresetId, type Kernel, type KernelPresetId,
} from './convolve';
import { convOpening } from './openings';

const SLIDE_MS = 500;

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ConvScene({ picker }: { picker: ReactNode }) {
  const open = convOpening();
  const [image, setImage] = useState(open.image);
  const [preset, setPreset] = useState<ImagePresetId | null>(open.preset);
  const [noise, setNoise] = useState<number>(open.noise);
  const [kernel, setKernel] = useState<Kernel>(open.kernel);
  const [kernelKey, setKernelKey] = useState(0);
  const [kernelPreset, setKernelPreset] = useState<KernelPresetId | null>(open.kernelPreset);
  const [options, setOptions] = useState<ConvOptions>(open.options);

  const map = useMemo(() => convolve(image, kernel, options), [image, kernel, options]);
  const steps = useMemo(() => windowSteps(image, kernel, options), [image, kernel, options]);
  const frames = useMemo(() => slideFrames(steps, image.length, KERNEL_SIZE, options, map.length), [steps, image.length, options, map.length]);
  const player = usePlayer(frames, { interval: SLIDE_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const step = at >= 0 ? steps[at] : null;
  const side = map.length;
  const formulaSide = outputSize(image.length, KERNEL_SIZE, options.pad, options.stride);

  const loadImage = (id: ImagePresetId, level = noise) => {
    setPreset(id);
    setImage(presetImage(id, level));
  };
  const loadKernel = (id: KernelPresetId) => {
    setKernelPreset(id);
    setKernel(kernelOf(id));
    setKernelKey((k) => k + 1);
  };
  const setOption = (patch: Partial<ConvOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const windowCells = step
    ? Array.from({ length: KERNEL_SIZE * KERNEL_SIZE }, (_, i) => ({ r: step.top + Math.floor(i / KERNEL_SIZE), c: step.left + (i % KERNEL_SIZE), tone: 'hi' as const }))
    : [];

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Output size" value={`${side} x ${side}`} sub={`formula: floor((${image.length} + 2·${options.pad} − ${KERNEL_SIZE}) / ${options.stride}) + 1 = ${formulaSide}`} />
          <Stat label="This window" value={step ? decimal(step.value, 2) : 'none yet'} sub={step ? `sum of the nine products${options.relu ? ', after ReLU' : ''}` : 'press play or step'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the window being multiplied', shape: 'square' },
            { color: 'var(--violet)', label: 'the kernel', shape: 'square' },
            { color: 'var(--ok)', label: 'positive response (a sign, not a verdict)', shape: 'square' },
            { color: 'var(--bad)', label: 'negative response', shape: 'square' },
            { color: 'var(--dim)', label: 'zero, or padding', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Image" inline>
            {IMAGE_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="muted" on={preset === p.id} onClick={() => loadImage(p.id)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          {preset === 'noise' && (
            <Segmented label="Lit pixels" options={NOISE_LEVELS.map((v) => ({ value: v, label: pct(v) }))} value={noise} onChange={(v) => { setNoise(v); loadImage('noise', v); }} />
          )}
        </>,
        <>
          <ControlGroup label="Kernel" inline>
            {KERNEL_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="violet" on={kernelPreset === p.id} onClick={() => loadKernel(p.id)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Stride" options={STRIDES.map((v) => ({ value: v, label: String(v) }))} value={options.stride} onChange={(stride) => setOption({ stride })} />
          <Segmented label="Padding" options={PADS.map((v) => ({ value: v, label: v === 0 ? '0 (valid)' : '1 (same)' }))} value={options.pad} onChange={(pad) => setOption({ pad })} />
          <Toggle label="ReLU" value={options.relu} onChange={(relu) => setOption({ relu })} off="Off" on="On" />
          <Toggle label="Kernel" value={options.flip} onChange={(flip) => setOption({ flip })} off="Not flipped (deep learning)" on="Flipped (true convolution)" />
        </>,
      ]}
    >
      <div className="cn-stage stage-pad">
        <div className="cn-row">
          <figure className="cn-figure">
            <figcaption>Image: click a cell to paint (0, 0.5, 1){options.pad ? '; dashed ring is padding' : ''}</figcaption>
            <ImageGrid
              image={image}
              pad={options.pad}
              size="md"
              highlight={windowCells}
              ariaLabel="Image: click a cell to cycle its brightness"
              onPaint={(y, x) => {
                setPreset(null);
                setImage((im) => paintCell(im, y, x));
              }}
            />
          </figure>
          <figure className="cn-figure">
            <figcaption>Kernel, and its products with the window</figcaption>
            <KernelFields key={kernelKey} initial={kernel} onChange={(k) => { setKernel(k); setKernelPreset(null); }} />
            {step ? (
              <MapGrid map={step.products} size="sm" digits={2} ariaLabel="The nine products for this window" />
            ) : (
              <Hint tone="muted">The nine products appear here as the window slides.</Hint>
            )}
          </figure>
          <figure className="cn-figure">
            <figcaption>Feature map: {side} x {side}</figcaption>
            <MapGrid
              map={map}
              size="md"
              ariaLabel="Feature map"
              shown={(r, c) => r * side + c <= at}
              highlight={step ? [{ r: step.oy, c: step.ox, tone: 'hi' }] : []}
            />
          </figure>
        </div>
        <ProvenanceRow>
          <Provenance kind="real">the products, sums and output size are computed here from core/linalg conv2d</Provenance>
          <Provenance kind="toy">an 8 x 8 grayscale picture and one 3 x 3 kernel</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
