import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { bytes, pctText } from '../../core/format';
import { BITS_LABELS, quantCaption } from './captions';
import { PARAMS_DEFAULT, bitsWithScales, weightBytes } from './memory';
import {
  DEFAULT_QUANT_SEED, OUTLIER_AT, SIZE, TENSOR, bitsPerWeight, makeInputs, makeWeights, outputError, quantise, weightErrors, type Scheme,
} from './quant';

const gb = (x: number) => bytes(x, { base: 1000, dp: 3 });
const GROUP_OF_MODEL = 128;
/** A weight counts as damaged when it moved by more than this share of the matrix's median magnitude. */
const DAMAGE_SHARE = 0.5;

type SchemeKey = 'tensor' | 'group4' | 'group8';
const SCHEMES: Record<SchemeKey, Scheme> = { tensor: TENSOR, group4: { kind: 'group', size: 4 }, group8: { kind: 'group', size: 8 } };
const SCHEME_OPTIONS: { value: SchemeKey; label: string }[] = [
  { value: 'tensor', label: 'per-tensor (one scale)' },
  { value: 'group4', label: 'per-group of 4' },
  { value: 'group8', label: 'per-group of 8' },
];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Scene 3: snap a seeded weight matrix to a coarser integer grid and measure one toy layer's output error. */
export function QuantScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_QUANT_SEED);
  const [outlier, setOutlier] = useState(true);
  const [bits, setBits] = useState(8);
  const [schemeKey, setSchemeKey] = useState<SchemeKey>('tensor');
  const scheme = SCHEMES[schemeKey];

  const w = useMemo(() => makeWeights(seed, outlier), [seed, outlier]);
  const inputs = useMemo(() => makeInputs(seed), [seed]);
  const q = useMemo(() => quantise(w, bits, scheme), [w, bits, scheme]);
  const err = useMemo(() => outputError(w, q.dequantised, inputs), [w, q, inputs]);
  const errors = useMemo(() => weightErrors(w, q.dequantised), [w, q]);
  const typical = median(w.flat().map(Math.abs));
  const isOutlier = (r: number, c: number) => outlier && r === OUTLIER_AT.row && c === OUTLIER_AT.col;
  const ordinary = SIZE * SIZE - (outlier ? 1 : 0);
  const zeroed = q.codes.flatMap((row, r) => row.map((code, c) => (code === 0 && !isOutlier(r, c) ? 1 : 0))).reduce<number>((a, b) => a + b, 0);
  const peak = Math.max(...w.flat().map(Math.abs));
  const groupSize = scheme.kind === 'tensor' ? SIZE * SIZE : scheme.size;
  const perWeight = bitsPerWeight(bits, scheme);

  return (
    <StageFrame
      height={720}
      minWidth={380}
      intro={quantCaption(bits, scheme, outlier, err, zeroed, ordinary)}
      introKey={`quant|${seed}|${outlier}|${bits}|${schemeKey}`}
      stats={
        <Stats>
          <Stat label="Relative output error of one toy layer" value={pctText(err.rms, 1)} color={err.rms > 0.25 ? 'var(--bad)' : 'var(--ok)'} sub="RMS over 8 rows, 200 seeded inputs: not accuracy" />
          <Stat label="Ordinary weights rounded to zero" value={`${zeroed} of ${ordinary}`} color={zeroed > ordinary / 2 ? 'var(--bad)' : undefined} sub={`${bits}-bit codes, ${scheme.kind === 'tensor' ? 'one scale' : `${q.scales.length} scales`}`} />
          <Stat label="Bits per weight" value={perWeight.toFixed(2)} sub={`${bits} plus a 16-bit scale per ${groupSize} weights`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'the outlier: it sets the scale of its group', shape: 'square' },
            { color: 'var(--bad)', label: 'a weight that moved by more than half a typical weight', shape: 'square' },
            { color: 'var(--ok)', label: 'a weight that stayed close', shape: 'square' },
            { color: 'var(--info)', label: 'weight size (before)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Bits" value={bits} onChange={setBits} options={BITS_LABELS} />
          <Segmented label="Scheme" value={schemeKey} onChange={setSchemeKey} options={SCHEME_OPTIONS} />
        </>,
        <>
          <Toggle label="Outlier" value={outlier} onChange={setOutlier} off="none" on="one weight x 20" />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ftq-stage stage-pad">
        <div className="ftq-row">
          <figure className="ftq-figure">
            <figcaption>Before: the seeded weights</figcaption>
            <CellGrid
              rows={SIZE}
              cols={SIZE}
              size="md"
              cell={(r, c) => ({ tone: isOutlier(r, c) ? 'violet' : 'info', fill: 'tint', intensity: Math.min(1, Math.abs(w[r][c]) / peak + 0.1), text: w[r][c].toFixed(1) })}
              ariaLabel="The seeded weight matrix before quantisation"
            />
          </figure>
          <figure className="ftq-figure">
            <figcaption>After: each weight snapped to its {bits}-bit grid, coloured by how far it moved</figcaption>
            <CellGrid
              rows={SIZE}
              cols={SIZE}
              size="md"
              cell={(r, c) => {
                const moved = Math.sqrt(errors[r][c]) / typical;
                return {
                  tone: isOutlier(r, c) ? 'violet' : moved > DAMAGE_SHARE ? 'bad' : 'ok',
                  fill: 'tint',
                  intensity: Math.min(1, 0.15 + moved),
                  text: q.dequantised[r][c].toFixed(1),
                };
              }}
              ariaLabel={`The matrix after ${bits}-bit ${scheme.kind === 'tensor' ? 'per-tensor' : 'per-group'} quantisation`}
            />
          </figure>
        </div>
        <div className="ftq-wide">
          {err.perRow.map((e, i) => (
            <div key={i} className="ftq-rowbar">
              <span>row {i + 1}</span>
              <Bar value={Math.min(e, 1)} max={1} tone={e > 0.25 ? 'bad' : 'ok'} height={8} ariaLabel={`Row ${i + 1} relative output error ${pctText(e, 1)}`} />
              <b>{pctText(e, 1)}</b>
            </div>
          ))}
        </div>
        <div className="ftq-panel">
          <h3 className="section-title">Memory for a model of {PARAMS_DEFAULT / 1e9} billion parameters: P x bits / 8</h3>
          <table className="ftq-table">
            <tbody>
              <tr><th scope="row">16 bits</th><td>{gb(weightBytes(PARAMS_DEFAULT, 16))}</td></tr>
              <tr><th scope="row">{bits} bits</th><td>{gb(weightBytes(PARAMS_DEFAULT, bits))}</td></tr>
              <tr><th scope="row">{bits} bits, groups of {GROUP_OF_MODEL}, 16-bit scales</th><td>{gb(weightBytes(PARAMS_DEFAULT, bitsWithScales(bits, GROUP_OF_MODEL)))}</td></tr>
            </tbody>
          </table>
        </div>
        <Hint tone="muted" className="ftq-note">
          One outlier sets the scale for everyone in its group, so it damages exactly the weights that share its scale. The meter is the relative output error of one toy layer on seeded inputs; it says nothing about a real model&apos;s quality.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>one 8 x 8 toy layer: this page measures no real model</Provenance>
          <Provenance kind="illustrative">the 7 billion in the memory table is a slider value from the first scene, not any model&apos;s</Provenance>
          <Provenance kind="from-memory">GPTQ and AWQ (post-training methods), quantisation-aware training, quantised KV caches, outliers in real transformer activations and LoRA&apos;s alpha / r scaling are named, not modelled; verify against the papers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
