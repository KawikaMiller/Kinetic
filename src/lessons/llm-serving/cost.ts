/**
 * The toy device and the pure cost model of llm-serving. Every constant is an illustrative round number
 * chosen for the page: it is not any real model, accelerator or product. Everything on screen is a pure
 * function of these constants and the learner's controls (AC-0/T4 #34).
 *
 * Left out on purpose, and said on screen: the n^2 attention term of prefill (attention-transformers owns it).
 */

export const LAYERS = 24;
export const KV_HEADS = 4;
export const KV_HEADS_FULL = 16;
export const HEAD_DIM = 64;
export const KV_BYTES = 2;
/** A toy configuration's parameter count, not a real model's. */
export const PARAMS = 1e9;
export const WEIGHT_BITS = 16;
export const DEVICE_MEM = 24e9;
/** Bytes per second the toy device streams from memory. */
export const BANDWIDTH = 1e12;
/** Floating-point operations per second the toy device computes. */
export const FLOPS = 1e14;
/** One multiply-add per parameter per token. */
export const FLOPS_PER_TOKEN = 2 * PARAMS;
/** Requests may reach this length: what a reserve-the-maximum allocator sets aside for every request. */
export const MAX_SEQ = 4096;
/** The average length the block-wise comparison assumes. */
export const AVG_SEQ = 600;
export const BLOCK_TOKENS = 16;

/** Weight memory by the one-line formula `parameters x bits / 8` (shared in spirit with fine-tuning-quantization, written out in both). */
export const weightBytes = (params: number, bits: number): number => (params * bits) / 8;
export const WEIGHT_BYTES = weightBytes(PARAMS, WEIGHT_BITS);

/** Arithmetic intensity at which compute and memory take equally long: FLOPs per byte. */
export const RIDGE_INTENSITY = FLOPS / BANDWIDTH;

export interface KvConfig {
  layers: number;
  kvHeads: number;
  headDim: number;
  bytes: number;
}
export const TOY_KV: KvConfig = { layers: LAYERS, kvHeads: KV_HEADS, headDim: HEAD_DIM, bytes: KV_BYTES };

/** The 2 is K and V. */
export const kvBytesPerToken = (c: KvConfig): number => 2 * c.layers * c.kvHeads * c.headDim * c.bytes;
export const kvBytes = (c: KvConfig, sequence: number, batch: number): number => kvBytesPerToken(c) * sequence * batch;

export type Regime = 'compute-bound' | 'memory-bound' | 'balanced';

export interface Timing {
  seconds: number;
  computeSeconds: number;
  memorySeconds: number;
  regime: Regime;
}

const TIE = 1e-12;

function timing(computeSeconds: number, memorySeconds: number): Timing {
  const regime: Regime = Math.abs(computeSeconds - memorySeconds) <= TIE * Math.max(computeSeconds, memorySeconds)
    ? 'balanced'
    : computeSeconds > memorySeconds ? 'compute-bound' : 'memory-bound';
  return { seconds: Math.max(computeSeconds, memorySeconds), computeSeconds, memorySeconds, regime };
}

/** Prefill of `tokens` tokens: max(compute for all tokens, one read of the weights). The regime is derived, never scripted. */
export function prefillTiming(tokens: number): Timing {
  return timing((tokens * FLOPS_PER_TOKEN) / FLOPS, WEIGHT_BYTES / BANDWIDTH);
}

/** One decode step for `batch` sequences holding `contextTokens` tokens of cache in total. */
export function decodeTiming(batch: number, contextTokens: number, kvPerToken = kvBytesPerToken(TOY_KV)): Timing {
  return timing((batch * FLOPS_PER_TOKEN) / FLOPS, (WEIGHT_BYTES + contextTokens * kvPerToken) / BANDWIDTH);
}

/** The prompt length where prefill's two terms are equal (the ridge). */
export const RIDGE_TOKENS = WEIGHT_BYTES / BANDWIDTH / (FLOPS_PER_TOKEN / FLOPS);

export interface RequestRun {
  prefill: Timing;
  /** Time to first token: the prefill produces the first token. */
  ttft: number;
  /** Sum over the decode steps of the step time. */
  decodeSeconds: number;
  totalSeconds: number;
  /** Mean time per later token, or null when there is no later token (one output token). */
  tpot: number | null;
  /** The regime of the decode step at batch 1 for the last step. */
  decodeRegime: Regime;
  promptShareOfTokens: number;
  promptShareOfTime: number;
}

/** One request alone on the device: a prefill of n tokens, then m - 1 decode steps whose context grows from n by one each step. */
export function runRequest(n: number, m: number): RequestRun {
  const prefill = prefillTiming(n);
  let decodeSeconds = 0;
  for (let j = 2; j <= m; j += 1) decodeSeconds += decodeTiming(1, n + j - 1).seconds;
  const totalSeconds = prefill.seconds + decodeSeconds;
  return {
    prefill,
    ttft: prefill.seconds,
    decodeSeconds,
    totalSeconds,
    tpot: m > 1 ? decodeSeconds / (m - 1) : null,
    decodeRegime: decodeTiming(1, n + m - 1).regime,
    promptShareOfTokens: n / (n + m),
    promptShareOfTime: prefill.seconds / totalSeconds,
  };
}

export type Allocation = 'exact' | 'reserve' | 'blocks';

/** Tokens of cache one request holds under an allocation rule when its sequence is `sequence` tokens long. */
export function heldTokens(allocation: Allocation, sequence: number): number {
  if (allocation === 'reserve') return Math.max(MAX_SEQ, sequence);
  if (allocation === 'blocks') return Math.ceil(sequence / BLOCK_TOKENS) * BLOCK_TOKENS;
  return sequence;
}

export interface MemoryPlan {
  perToken: number;
  perSequence: number;
  batchBytes: number;
  budget: number;
  /** Sequences that fit in the budget under the allocation rule. */
  fits: number;
  /** Cache bytes of the whole batch as a share of the budget. */
  share: number;
  /** Which request is the first to wait, or null when the whole batch fits. */
  firstWaiting: number | null;
}

export function planMemory(c: KvConfig, sequence: number, batch: number, allocation: Allocation, deviceMem = DEVICE_MEM): MemoryPlan {
  const perToken = kvBytesPerToken(c);
  const held = heldTokens(allocation, sequence);
  const perSequence = perToken * held;
  const budget = Math.max(0, deviceMem - WEIGHT_BYTES);
  const fits = Math.floor(budget / perSequence);
  return {
    perToken,
    perSequence,
    batchBytes: perSequence * batch,
    budget,
    fits,
    share: (perSequence * batch) / budget,
    firstWaiting: batch > fits ? fits + 1 : null,
  };
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Throughput of one decode step: tokens per second when `batch` sequences each emit one token. */
export function decodeTokensPerSecond(batch: number, contextPerSequence: number): number {
  return batch / decodeTiming(batch, batch * contextPerSequence).seconds;
}

export interface StepShape {
  step: Timing;
  tokensPerSecond: number;
  /** The same step at a batch of 1 with the same context per sequence. */
  single: Timing;
  singleTokensPerSecond: number;
  /** Step time over the single step's, and tokens per second over the single step's. */
  timeRatio: number;
  throughputRatio: number;
}

/** One decode step for `batch` sequences of `contextPerSequence` tokens each, against a batch of 1: the shape behind "more sequences per step". */
export function stepShape(batch: number, contextPerSequence: number): StepShape {
  const step = decodeTiming(batch, batch * contextPerSequence);
  const single = decodeTiming(1, contextPerSequence);
  const tokensPerSecond = decodeTokensPerSecond(batch, contextPerSequence);
  const singleTokensPerSecond = decodeTokensPerSecond(1, contextPerSequence);
  return { step, tokensPerSecond, single, singleTokensPerSecond, timeRatio: step.seconds / single.seconds, throughputRatio: tokensPerSecond / singleTokensPerSecond };
}
