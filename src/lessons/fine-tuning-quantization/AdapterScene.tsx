import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { bytes, pctText } from '../../core/format';
import { adapterCaption, memoryCaption } from './captions';
import { BoundedIntField } from '../../components/BoundedIntField';
import {
  DEFAULT_DIM, DEFAULT_RANK, DIM_LIMITS, FRACTION_HUNDREDTHS, PARAMS_BILLIONS, PARAMS_DEFAULT, TRAIN_BYTES_PER_PARAM, adapterParams, adapterShare, crossoverRank, fullParams, maxRank,
  memoryLines,
} from './memory';

const gb = (x: number) => bytes(x, { base: 1000, dp: 2 });
const SVG_SIDE = 150;
const MIN_STRIP = 3;

/** To-scale picture: the frozen matrix and the two thin factors whose product is added to it. */
function Blocks({ dIn, dOut, r }: { dIn: number; dOut: number; r: number }) {
  const scale = SVG_SIDE / Math.max(dIn, dOut);
  const w = dIn * scale;
  const h = dOut * scale;
  const strip = Math.max(MIN_STRIP, r * scale);
  const width = w + 24 + strip + 22 + w;
  return (
    <svg viewBox={`0 0 ${width} ${h + strip + 8}`} width={Math.min(width, 420)} role="img" aria-label={`The frozen ${dOut} by ${dIn} matrix and an adapter: B is ${dOut} by ${r}, A is ${r} by ${dIn}`}>
      <rect x={0} y={0} width={w} height={h} fill="color-mix(in srgb, var(--dim) 30%, transparent)" stroke="var(--dim)" />
      <text x={w / 2} y={h / 2} textAnchor="middle" fontSize={11} fill="var(--muted)">frozen W</text>
      <text x={w + 10} y={h / 2} fontSize={14} fill="var(--muted)">+</text>
      <rect x={w + 24} y={0} width={strip} height={h} fill="var(--hi)" fillOpacity={0.55} stroke="var(--hi)" />
      <text x={w + 24 + strip + 4} y={h / 2} fontSize={11} fill="var(--muted)">B</text>
      <rect x={w + 24 + strip + 22} y={0} width={w} height={strip} fill="var(--hi)" fillOpacity={0.55} stroke="var(--hi)" />
      <text x={w + 24 + strip + 22 + w / 2} y={strip + 12} textAnchor="middle" fontSize={11} fill="var(--muted)">A</text>
    </svg>
  );
}

/** Scene 1: a small trained adapter beside a big frozen matrix. */
export function AdapterScene({ picker }: { picker: ReactNode }) {
  const [dIn, setDIn] = useState(DEFAULT_DIM);
  const [dOut, setDOut] = useState(DEFAULT_DIM);
  const [rank, setRank] = useState(DEFAULT_RANK);
  const [billions, setBillions] = useState(PARAMS_DEFAULT / 1e9);
  const [hundredths, setHundredths] = useState<number>(FRACTION_HUNDREDTHS.default);

  const top = maxRank(dIn, dOut);
  const cross = crossoverRank(dIn, dOut);
  const params = billions * 1e9;
  const fraction = hundredths / 10_000;
  const lines = memoryLines(params, fraction);
  const bigger = adapterParams(dIn, dOut, rank) > fullParams(dIn, dOut);
  const clampRankTo = (a: number, b: number) => setRank((r) => Math.min(r, maxRank(a, b)));
  const shareAt = (r: number) => adapterShare(dIn, dOut, r) * 100;

  return (
    <StageFrame
      height={640}
      minWidth={380}
      intro={`${adapterCaption(dIn, dOut, rank)} ${memoryCaption(params, fraction)}`}
      introKey={`adapter|${dIn}|${dOut}|${rank}|${billions}|${hundredths}`}
      stats={
        <Stats>
          <Stat label="Adapter parameters" value={adapterParams(dIn, dOut, rank).toLocaleString('en-US')} color={bigger ? 'var(--bad)' : 'var(--ok)'} sub={`r (d_in + d_out) = ${rank.toLocaleString('en-US')} x ${(dIn + dOut).toLocaleString('en-US')}`} />
          <Stat label="Matrix parameters" value={fullParams(dIn, dOut).toLocaleString('en-US')} sub="d_in x d_out, frozen" />
          <Stat label="Adapter share" value={pctText(adapterShare(dIn, dOut, rank), adapterShare(dIn, dOut, rank) < 0.001 ? 3 : 2)} color={bigger ? 'var(--bad)' : 'var(--ok)'} sub={bigger ? 'bigger than the matrix' : 'of the matrix'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'the frozen matrix (not trained)', shape: 'square' },
            { color: 'var(--hi)', label: 'the adapter: B and A, trained', shape: 'square' },
            { color: 'var(--ok)', label: 'the cheap side', shape: 'square' },
            { color: 'var(--bad)', label: 'the costly side', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <BoundedIntField label="d_in" value={dIn} min={DIM_LIMITS.min} max={DIM_LIMITS.max} onValue={(v) => { setDIn(v); clampRankTo(v, dOut); }} />
          <BoundedIntField label="d_out" value={dOut} min={DIM_LIMITS.min} max={DIM_LIMITS.max} onValue={(v) => { setDOut(v); clampRankTo(dIn, v); }} />
          <BoundedIntField label="rank r" value={rank} min={1} max={top} onValue={setRank} />
        </>,
        <>
          <Slider label="Rank r" value={rank} min={1} max={top} onChange={setRank} />
          <Slider label="Model parameters" value={billions} min={PARAMS_BILLIONS.min} max={PARAMS_BILLIONS.max} step={PARAMS_BILLIONS.step} format={(v) => `${v.toFixed(1)} billion`} onChange={setBillions} />
          <Slider label="Adapter fraction f" value={hundredths} min={FRACTION_HUNDREDTHS.min} max={FRACTION_HUNDREDTHS.max} format={(v) => `${(v / 100).toFixed(2)}%`} onChange={setHundredths} />
        </>,
      ]}
    >
      <div className="ftq-stage stage-pad">
        <Blocks dIn={dIn} dOut={dOut} r={rank} />
        <div className="ftq-row">
          <figure className="ftq-figure">
            <figcaption>Adapter parameters as a share of the matrix, against the rank: the line crosses 100% at rank {cross.toLocaleString('en-US', { maximumFractionDigits: 1 })}</figcaption>
            <Plot2D x={{ domain: [1, Math.max(2, top)], label: 'rank r', ticks: 4 }} y={{ domain: [0, Math.max(120, shareAt(top) * 1.05)], label: '% of matrix', ticks: 4 }} width={330} height={190} ariaLabel={`Adapter share against rank: ${pctText(adapterShare(dIn, dOut, rank), 2)} at rank ${rank}`}>
              <HLine at={100} tone="bad" label="same size as the matrix" />
              <Curve fn={(x) => shareAt(x)} tone="hi" />
              {cross <= top && <VLine at={cross} tone="ok" dashed label={`rank ${cross.toLocaleString('en-US', { maximumFractionDigits: 1 })}`} />}
              <Points data={[{ x: rank, y: shareAt(rank), tone: 'hi' }]} r={5} />
            </Plot2D>
          </figure>
          <div className="ftq-panel">
            <h3 className="section-title">Whole-model memory, before activations</h3>
            <div className="ftq-bar-label"><span>train everything: {TRAIN_BYTES_PER_PARAM} x P</span><b>{gb(lines.full)}</b></div>
            <Bar value={lines.full} max={lines.full} tone="bad" height={10} ariaLabel={`Full fine-tuning ${gb(lines.full)}`} />
            <div className="ftq-bar-label"><span>16-bit frozen base + adapters</span><b>{gb(lines.lora)}</b></div>
            <Bar value={lines.lora} max={lines.full} tone="ok" height={10} ariaLabel={`LoRA ${gb(lines.lora)}`} />
            <div className="ftq-bar-label"><span>4-bit base + adapters</span><b>{gb(lines.quantised)}</b></div>
            <Bar value={lines.quantised} max={lines.full} tone="ok" height={10} ariaLabel={`Quantised base with adapters ${gb(lines.quantised)}`} />
            <Hint tone="muted">P and f are numbers you move, not a claim about any model. Activations and quantisation scales are excluded.</Hint>
          </div>
        </div>
        <Hint tone="muted" className="ftq-note">A low-rank adapter is not a smaller copy of the model: the original matrix stays frozen and only the two thin factors are trained, then their product is added to it.</Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">the parameter count and adapter fraction are sliders you move, not any model&apos;s</Provenance>
          <Provenance kind="from-memory">about 16 bytes per trained parameter (repeated from the training-vs-inference lesson), LoRA and its 4-bit relative QLoRA are named from memory; verify against the LoRA paper (Hu et al., 2021) and the QLoRA paper (Dettmers et al., 2023)</Provenance>
          <ClaimLabel kind="research">fine-tuning updates are often reported to be well approximated by low-rank ones (the LoRA paper, from memory)</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
