/** The state each scene opens in (pure, so a test can switch through all of them). */
import { DEFAULT_WEIGHTS, SEGMENT, type AlgoId, type TraceId, type Weights } from './abr';
import { CACHE, DEFAULT_SEED, ZIPF } from './cdn';
import { SLOW_SHARE, type LadderSize } from './ladder';

export const DEFAULT_TRACE_SEED = 1;

export interface PlayerState {
  trace: TraceId;
  /** Only the random-walk trace reads it. */
  seed: number;
  S: number;
  algo: AlgoId;
}
/** Opens on the drop with the rate-based player, which stalls once when the network falls. */
export const initialPlayer = (): PlayerState => ({ trace: 'drop', seed: DEFAULT_TRACE_SEED, S: SEGMENT.initial, algo: 'rate' });

export interface CompareState {
  trace: TraceId;
  seed: number;
  S: number;
  weights: Weights;
}
export const initialCompare = (): CompareState => ({ trace: 'drop', seed: DEFAULT_TRACE_SEED, S: SEGMENT.initial, weights: { ...DEFAULT_WEIGHTS } });

export interface CdnState {
  seed: number;
  alpha: number;
  cache: number;
  S: number;
}
export const initialCdn = (): CdnState => ({ seed: DEFAULT_SEED, alpha: ZIPF.initial, cache: CACHE.initial, S: SEGMENT.initial });

export interface LadderState {
  slow: number;
  /** The ladder whose thresholds the chart marks. */
  size: LadderSize;
}
export const initialLadder = (): LadderState => ({ slow: SLOW_SHARE.initial, size: 5 });
