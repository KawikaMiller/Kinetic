import { TOKENS, decode, makeSetup, type DecodeRun } from './attn';
import { KV_HEADS_FULL, TOY_KV, heldTokens, ordinal, type Allocation, type KvConfig, type MemoryPlan } from './cost';
import { decimalBytes, distinctBytes } from './text';

export const LAYER_LIMITS = { min: 1, max: 96 } as const;
export const KV_HEAD_LIMITS = { min: 1, max: 64 } as const;
export const HEAD_DIM_LIMITS = { min: 16, max: 256 } as const;
export const BYTE_CHOICES = [1, 2, 4] as const;
export const SEQUENCE_LIMITS = { min: 1, max: 131_072 } as const;
export const BATCH_LIMITS = { min: 1, max: 512 } as const;
export const HEAD_SEED = 7;

export const PRESETS: Record<'toy' | 'full', KvConfig> = {
  toy: TOY_KV,
  full: { ...TOY_KV, kvHeads: KV_HEADS_FULL },
};

export interface CacheOpening {
  config: KvConfig;
  sequence: number;
  batch: number;
  allocation: Allocation;
  seed: number;
  forgetValues: boolean;
}

export const CACHE_OPENING: CacheOpening = { config: TOY_KV, sequence: 2048, batch: 16, allocation: 'exact', seed: HEAD_SEED, forgetValues: false };

export function presetOf(config: KvConfig): 'toy' | 'full' | null {
  const same = (a: KvConfig, b: KvConfig) => a.layers === b.layers && a.kvHeads === b.kvHeads && a.headDim === b.headDim && a.bytes === b.bytes;
  if (same(config, PRESETS.toy)) return 'toy';
  if (same(config, PRESETS.full)) return 'full';
  return null;
}

/** The scene-2 memory caption, computed from the plan. */
export function memoryCaption(plan: MemoryPlan, sequence: number, batch: number, allocation: Allocation): string {
  const held = heldTokens(allocation, sequence);
  const per = `Each request holds ${held.toLocaleString('en-US')} tokens of cache, ${decimalBytes(plan.perSequence)}.`;
  if (plan.firstWaiting !== null) {
    const [need, budget] = distinctBytes(plan.batchBytes, plan.budget);
    return `${per} A batch of ${batch.toLocaleString('en-US')} would need ${need} against a ${budget} cache budget: the ${ordinal(plan.firstWaiting)} request waits (${plan.fits.toLocaleString('en-US')} fit).`;
  }
  return `${per} A batch of ${batch.toLocaleString('en-US')} takes ${decimalBytes(plan.batchBytes)} of the ${decimalBytes(plan.budget)} budget, and ${plan.fits.toLocaleString('en-US')} requests would fit.`;
}

/** The cache-equality caption, computed from the decode run. */
export function equalityCaption(run: DecodeRun, forgetValues: boolean): string {
  const last = run.steps[run.steps.length - 1];
  if (run.firstDivergence === null) {
    return `Decoding ${TOKENS} tokens with the cache matches recomputing from scratch within 1e-9 at every step (largest difference ${run.maxDiff.toExponential(1)}), with ${last.cacheProjections} key and value projections instead of ${last.recomputeProjections}.`;
  }
  const first = run.steps[run.firstDivergence - 1];
  return `${forgetValues ? 'With the value vectors forgotten, the' : 'The'} cached output first differs at step ${run.firstDivergence}, by ${first.diff.toExponential(1)}; the largest difference over the ${TOKENS} steps is ${run.maxDiff.toExponential(1)}.`;
}

export const equalityRun = (seed: number, forgetValues: boolean) => decode(makeSetup(seed), { forgetValues });
