import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { CostField } from './CostField';
import { costCaption } from './captions';
import { DRAW_LIMIT, FEED_FORWARD_RATIO, LIMITS, costs, count, linear, quadratic, type CostInput } from './cost';
import { costOpening } from './openings';

const N_PRESETS = [1024, 8192, 131_072, 1_000_000];
const BLOCK = ['Attention', 'Add and layer norm', 'Feed-forward', 'Add and layer norm'] as const;

export function CostScene({ picker }: { picker: ReactNode }) {
  const [input, setInput] = useState<CostInput>(costOpening());
  const [fieldKey, setFieldKey] = useState(0);
  const c = costs(input);
  const drawn = Math.min(input.n, DRAW_LIMIT);
  const set = (patch: Partial<CostInput>) => setInput((i) => ({ ...i, ...patch }));

  return (
    <StageFrame
      height={540}
      intro={costCaption(input, c)}
      introKey={[input]}
      stats={
        <Stats>
          <Stat label="Weights per head, per layer" value={count(c.weightsPerHead)} sub="n²" />
          <Stat label="Q·Kᵀ per layer" value={count(c.scoreFlops)} sub="2 n² d floating-point operations" />
          <Stat label="Block parameters" value={count(c.parameters)} sub={`about 12 L d² (feed-forward ${FEED_FORWARD_RATIO}x wide)`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'n²: attention, the costly side', shape: 'line' },
            { color: 'var(--ok)', label: 'n: the linear parts', shape: 'line' },
            { color: 'var(--hi)', label: 'your n', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Context length" inline>
            {N_PRESETS.map((n) => (
              <ChipButton
                key={n}
                tone="hi"
                on={input.n === n}
                onClick={() => {
                  set({ n });
                  setFieldKey((k) => k + 1);
                }}
              >
                {n.toLocaleString('en-US')}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <CostField key={`n${fieldKey}`} label="n (tokens)" value={input.n} {...LIMITS.n} onValue={(n) => set({ n })} />
          <CostField label="d (width)" value={input.d} {...LIMITS.d} onValue={(d) => set({ d })} />
          <CostField label="heads" value={input.heads} {...LIMITS.heads} onValue={(heads) => set({ heads })} />
          <CostField label="layers L" value={input.layers} {...LIMITS.layers} onValue={(layers) => set({ layers })} />
        </>,
      ]}
    >
      <div className="at-stage stage-pad">
        <div className="at-row">
          <figure className="at-figure">
            <figcaption>
              Attention matrix of one head: {drawn} x {drawn} drawn of {input.n.toLocaleString('en-US')} x {input.n.toLocaleString('en-US')}
            </figcaption>
            <CellGrid rows={drawn} cols={drawn} size={drawn > 24 ? 'xs' : 'sm'} ariaLabel={`Attention matrix, ${drawn} by ${drawn} drawn`} cell={() => ({ tone: 'info', fill: 'tint', intensity: 0.25 })} />
          </figure>
          <figure className="at-figure">
            <figcaption>Cost against n, both axes logarithmic</figcaption>
            <Plot2D
              x={{ domain: [1, 1_000_000], log: true, label: 'n (tokens)', ticks: 4 }}
              y={{ domain: [1, 1e12], log: true, label: 'relative cost', ticks: 4 }}
              width={320}
              height={230}
              ariaLabel={`Cost against sequence length: quadratic attention against linear parts; n is ${input.n}`}
            >
              <Curve fn={quadratic} tone="bad" />
              <Curve fn={linear} tone="ok" />
              <VLine at={input.n} tone="hi" dashed />
            </Plot2D>
          </figure>
        </div>
        <figure className="at-figure">
          <figcaption>One transformer block (shown, not run)</figcaption>
          <ol className="at-block" aria-label="Transformer block, in order">
            {BLOCK.map((name, i) => (
              <li key={i} className={name.startsWith('Add') ? 'is-add' : ''}>{name}</li>
            ))}
          </ol>
          <span className="hint">Each Add is a residual connection: the block's input is added back to its output.</span>
        </figure>
        <ProvenanceRow>
          <Provenance kind="illustrative">the defaults n, d, heads and layers are made up; every figure is computed from the numbers you type</Provenance>
          <Provenance kind="from-memory">12 L d² (4 d² attention, 8 d² feed-forward at four times the width) is the usual rough count, ignoring embeddings and biases: verify against a model card</Provenance>
          <Provenance kind="not-run">the block diagram, and fused or flash attention that avoids storing the matrix: named, not simulated</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
