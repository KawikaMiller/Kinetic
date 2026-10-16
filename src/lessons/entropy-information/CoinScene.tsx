import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bars, Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { BLOCK_LENGTHS, COIN_DEFAULT, COIN_PRESETS, COIN_STEP, blockBitsPerFlip } from './model';
import { binaryEntropy } from '../../core/entropy';
import { bits2, bits4, bitsOrUnbounded, coinCaption, coinReadout, coinSum } from './text';

const PLOT_X = { domain: [0, 1] as const, label: 'p (chance of heads)', ticks: 5 };
const PLOT_Y = { domain: [0, 1.05] as const, label: 'bits', ticks: 5 };
const BLOCK_X = { domain: [0.5, BLOCK_LENGTHS.length + 0.5] as const, label: 'flips coded together (k)', tickValues: BLOCK_LENGTHS };
const BLOCK_Y = { domain: [0, 1.05] as const, label: 'bits per flip', ticks: 5 };
const BAR_HALF_WIDTH = 0.34;
/** Dragging snaps p to the slider's own resolution. */
const snap = (x: number) => Math.round(x / COIN_STEP) * COIN_STEP;

export function CoinScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState(COIN_DEFAULT);
  const r = coinReadout(p);
  const blocks = BLOCK_LENGTHS.map((k) => ({ k, bits: blockBitsPerFlip(p, k) }));

  return (
    <StageFrame
      height={420}
      intro={coinCaption(p)}
      introKey={[p]}
      stats={
        <Stats>
          <Stat label="Surprise of heads" value={bitsOrUnbounded(r.heads, 2)} color="var(--hi)" sub="−log2 p" />
          <Stat label="Surprise of tails" value={bitsOrUnbounded(r.tails, 2)} color="var(--hi)" sub="−log2 (1 − p)" />
          <Stat label="Entropy H(p)" value={`${bits4(r.h)} bits`} color="var(--violet)" sub={coinSum(r)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'H(p), bits per flip', shape: 'line' },
            { color: 'var(--hi)', label: 'the p you picked', shape: 'dot' },
            { color: 'var(--info)', label: 'bits per flip of a block code' },
            { color: 'var(--bad)', label: 'bits above the entropy floor' },
            { color: 'var(--violet)', label: 'entropy floor', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="p (heads)" value={p} min={0} max={1} step={COIN_STEP} format={bits2} onChange={(v) => setP(snap(v))} />
        </>,
        <>
          <ControlGroup label="Try" inline>
            {COIN_PRESETS.map((v) => (
              <ChipButton key={v} tone="info" on={p === v} onClick={() => setP(v)}>
                p = {bits2(v)}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint>Drag the dot, use the slider, or pick a coin. Entropy is 0 at p = 0 and p = 1 because 0 log 0 is taken as 0.</Hint>
        </>,
      ]}
    >
      <div className="ent-stage stage-pad">
        <div className="ent-plot">
          <Plot2D x={PLOT_X} y={PLOT_Y} ariaLabel={`Entropy of a coin as a function of p; p is ${bits2(p)} and the entropy ${bits4(r.h)} bits`}>
            <Curve fn={binaryEntropy} tone="info" />
            <Points
              data={[{ x: p, y: r.h, tone: 'hi' }]}
              onDrag={(_, [x]) => setP(snap(Math.min(1, Math.max(0, x))))}
              pointLabel={() => 'coin bias p'}
            />
          </Plot2D>
        </div>
        <div className="ent-plot">
          <Plot2D x={BLOCK_X} y={BLOCK_Y} ariaLabel={`Bits per flip when ${BLOCK_LENGTHS.join(', ')} flips are coded together: ${blocks.map((b) => bits4(b.bits)).join(', ')}`}>
            <Bars bars={blocks.map((b) => ({ x0: b.k - BAR_HALF_WIDTH, x1: b.k + BAR_HALF_WIDTH, y: b.bits }))} tone="info" />
            <Bars bars={blocks.map((b) => ({ x0: b.k - BAR_HALF_WIDTH, x1: b.k + BAR_HALF_WIDTH, y: Math.max(b.bits, r.h) }))} tone="bad" base={r.h} />
            <HLine at={r.h} label={`H = ${bits4(r.h)}`} tone="violet" dashed />
          </Plot2D>
          <ul className="ent-list" aria-label="Bits per flip by block length">
            {blocks.map((b) => (
              <li key={b.k}>
                {b.k} {b.k === 1 ? 'flip' : 'flips'} at a time: <b>{bits4(b.bits)}</b> bits per flip, {bits4(Math.max(0, b.bits - r.h))} above the floor
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">entropy and the block codes are computed live; each block code is a real Huffman code over the outcomes of k flips (<Link to="/lesson/huffman-coding">Huffman coding</Link>)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
