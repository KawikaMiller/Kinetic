import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { AVG_SEQ, BLOCK_TOKENS, MAX_SEQ, WEIGHT_BYTES, DEVICE_MEM, heldTokens, planMemory, type Allocation, type KvConfig } from './cost';
import {
  BATCH_LIMITS, BYTE_CHOICES, CACHE_OPENING, HEAD_DIM_LIMITS, KV_HEAD_LIMITS, LAYER_LIMITS, PRESETS, SEQUENCE_LIMITS, equalityCaption, equalityRun,
  memoryCaption, presetOf,
} from './cache';
import { LengthField } from './LengthField';
import { decimalBytes } from './text';

const GRID_COLS = 40;
const GRID_ROWS = 12;
const OWNER_TONES: readonly Tone[] = ['info', 'violet', 'sky', 'orange', 'amber', 'pink'];

const ALLOCATIONS: { value: Allocation; label: string }[] = [
  { value: 'exact', label: 'exactly the tokens used' },
  { value: 'reserve', label: `reserve ${MAX_SEQ.toLocaleString('en-US')} each` },
  { value: 'blocks', label: `${BLOCK_TOKENS}-token blocks` },
];
const BYTE_OPTIONS = BYTE_CHOICES.map((b) => ({ value: b as number, label: `${b} byte${b === 1 ? '' : 's'}` }));

/** Scene 2: how big the KV cache is, how many requests it admits, and why a cache gives the same answer. */
export function CacheScene({ picker }: { picker: ReactNode }) {
  const [config, setConfig] = useState<KvConfig>(CACHE_OPENING.config);
  const [sequence, setSequence] = useState(CACHE_OPENING.sequence);
  const [batch, setBatch] = useState(CACHE_OPENING.batch);
  const [allocation, setAllocation] = useState<Allocation>(CACHE_OPENING.allocation);
  const [seed, setSeed] = useState(CACHE_OPENING.seed);
  const [forget, setForget] = useState(CACHE_OPENING.forgetValues);

  const plan = planMemory(config, sequence, batch, allocation);
  const run = useMemo(() => equalityRun(seed, forget), [seed, forget]);
  const preset = presetOf(config);
  const held = heldTokens(allocation, sequence);
  const overflow = plan.firstWaiting !== null;
  const rows = Math.min(batch, GRID_ROWS);
  const usedCells = Math.max(1, Math.ceil((GRID_COLS * sequence) / held));
  const tokensPerCell = Math.ceil(held / GRID_COLS);
  const kvShown = Math.min(plan.batchBytes, plan.budget);
  const last = run.steps[run.steps.length - 1];
  const set = (patch: Partial<KvConfig>) => setConfig((c) => ({ ...c, ...patch }));

  return (
    <StageFrame
      height={700}
      minWidth={420}
      intro={`${memoryCaption(plan, sequence, batch, allocation)} ${equalityCaption(run, forget)}`}
      introKey={`cache|${config.layers}|${config.kvHeads}|${config.headDim}|${config.bytes}|${sequence}|${batch}|${allocation}|${seed}|${forget}`}
      stats={
        <Stats>
          <Stat label="Cache per token" value={decimalBytes(plan.perToken)} sub="2 x layers x KV heads x head dim x bytes" />
          <Stat label="Fits in the budget" value={plan.fits.toLocaleString('en-US')} color={overflow ? 'var(--bad)' : 'var(--ok)'} sub={`requests of ${held.toLocaleString('en-US')} tokens held`} />
          <Stat label="Key/value projections" value={`${last.cacheProjections} against ${last.recomputeProjections}`} sub={`${last.cacheProjections} with the cache, ${last.recomputeProjections} recomputing every prefix`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'weights', shape: 'square' },
            { color: 'var(--muted)', label: 'cache in use', shape: 'square' },
            { color: 'var(--ok)', label: 'free', shape: 'square' },
            { color: 'var(--bad)', label: 'a cache that does not fit', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" on={preset === 'toy'} onClick={() => setConfig(PRESETS.toy)}>toy-24: {PRESETS.toy.kvHeads} KV heads</ChipButton>
          <ChipButton tone="info" on={preset === 'full'} onClick={() => setConfig(PRESETS.full)}>full multi-head: {PRESETS.full.kvHeads} KV heads</ChipButton>
          <Segmented label="Cache element" value={config.bytes} onChange={(bytes) => set({ bytes })} options={BYTE_OPTIONS} />
        </>,
        <>
          <Slider label="Layers" value={config.layers} min={LAYER_LIMITS.min} max={LAYER_LIMITS.max} onChange={(layers) => set({ layers })} />
          <Slider label="KV heads" value={config.kvHeads} min={KV_HEAD_LIMITS.min} max={KV_HEAD_LIMITS.max} onChange={(kvHeads) => set({ kvHeads })} />
          <Slider label="Head dimension" value={config.headDim} min={HEAD_DIM_LIMITS.min} max={HEAD_DIM_LIMITS.max} step={16} onChange={(headDim) => set({ headDim })} />
        </>,
        <>
          <LengthField label="Sequence tokens" value={sequence} min={SEQUENCE_LIMITS.min} max={SEQUENCE_LIMITS.max} onValue={setSequence} />
          <LengthField label="Batch (requests)" value={batch} min={BATCH_LIMITS.min} max={BATCH_LIMITS.max} onValue={setBatch} />
          <Segmented label="Allocation" value={allocation} onChange={setAllocation} options={ALLOCATIONS} />
        </>,
        <>
          <SeedField label="Head seed" seed={seed} onSeed={setSeed} />
          <Toggle label="Cache" value={forget} onChange={setForget} off="keeps every key and value" on="forgets the new values" />
        </>,
      ]}
    >
      <div className="llm-stage stage-pad">
        <div className="llm-wide">
          <div className="llm-bar-label">
            <span>Device memory, {decimalBytes(DEVICE_MEM)}</span>
            <b>weights {decimalBytes(WEIGHT_BYTES)} · cache {decimalBytes(plan.batchBytes)} · budget {decimalBytes(plan.budget)}</b>
          </div>
          <Bar
            segments={[
              { value: WEIGHT_BYTES, tone: 'sky' },
              { value: kvShown, tone: overflow ? 'bad' : 'muted' },
              { value: Math.max(0, plan.budget - kvShown), tone: 'ok' },
            ]}
            max={DEVICE_MEM}
            height={16}
            ariaLabel={`Device memory: ${decimalBytes(plan.batchBytes)} of cache against a budget of ${decimalBytes(plan.budget)}`}
          />
        </div>
        <div className="llm-grid-wrap">
          <WideRegion minWidth={420} label="The cache of each sequence: scroll sideways to see all of it">
            <CellGrid
              rows={rows}
              cols={GRID_COLS}
              size="xs"
              cell={(r, c) => (c < usedCells ? { tone: OWNER_TONES[r % OWNER_TONES.length], fill: 'solid' } : { tone: 'dim', fill: 'outline' })}
              rowLabels={Array.from({ length: rows }, (_, i) => `#${i + 1}`)}
              ariaLabel={`The cache of ${rows} of ${batch} sequences, one row each`}
            />
          </WideRegion>
          <Hint tone="muted">
            One row per request, showing {rows} of {batch.toLocaleString('en-US')}. Each cell stands for about {tokensPerCell.toLocaleString('en-US')} tokens; a filled cell is cache in use, an empty outlined one is set aside but unused
            {allocation === 'exact' ? ' (none: this allocation holds only what is used)' : ''}.
          </Hint>
        </div>
        <div className="llm-row">
          <div className="llm-panel">
            <h3 className="section-title">Reserve the maximum or grow in blocks</h3>
            <table className="llm-table">
              <thead><tr><th scope="col">requests that average {AVG_SEQ} tokens and may reach {MAX_SEQ.toLocaleString('en-US')}</th><th scope="col">fit</th></tr></thead>
              <tbody>
                {(['reserve', 'blocks'] as const).map((a) => (
                  <tr key={a}>
                    <th scope="row">{a === 'reserve' ? `reserve ${MAX_SEQ.toLocaleString('en-US')} tokens each` : `hold ${BLOCK_TOKENS}-token blocks as they grow`}</th>
                    <td className={a === 'reserve' ? 'llm-bad' : 'llm-ok'}>{planMemory(config, AVG_SEQ, 1, a).fits.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Hint tone="muted">Holding only the blocks a request has used turns wasted reservation into batch size.</Hint>
          </div>
          <div className="llm-panel">
            <h3 className="section-title">The same answer, cached or recomputed</h3>
            <table className="llm-table">
              <thead><tr><th scope="col">step</th><th scope="col">recompute projections</th><th scope="col">cache projections</th><th scope="col">largest difference</th></tr></thead>
              <tbody>
                {run.steps.map((s) => (
                  <tr key={s.step}>
                    <th scope="row">{s.step}</th>
                    <td>{s.recomputeProjections}</td>
                    <td>{s.cacheProjections}</td>
                    <td className={s.diff > 1e-9 ? 'llm-bad' : 'llm-ok'}>{s.diff.toExponential(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Hint tone="muted">A tiny seeded single-head causal attention decodes six tokens both ways. Equal means within 1e-9. This page does not run a language model.</Hint>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative">the toy device and configurations are round numbers for the page, not any product&apos;s</Provenance>
          <Provenance kind="toy" seed={seed}>one tiny attention head with {run.steps.length} tokens: it shows the equality, not any model&apos;s behaviour</Provenance>
          <Provenance kind="from-memory">grouped-query attention (fewer KV heads) and block-wise paged cache allocation are published ideas named from memory; verify against the vLLM paper (2023) and the grouped-query attention paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
