/** The state each scene opens in (pure, so a test can switch through all of them and check none leaks into another). */
import { DEFAULT_STATIONS } from './dcf';
import { DEFAULT_A, DEFAULT_C, FRAME_RANGE, RANGE, type Pt } from './hidden';
import { COUNT_RANGE } from './rates';

export const DEFAULT_BACKOFF_SEED = 1;
export const DEFAULT_CONTENTION_SEED = 1;

export interface BackoffState {
  seed: number;
  ackLost: boolean;
}
export const initialBackoff = (): BackoffState => ({ seed: DEFAULT_BACKOFF_SEED, ackLost: false });

export interface ContentionState {
  stations: number;
  seed: number;
}
export const initialContention = (): ContentionState => ({ stations: DEFAULT_STATIONS, seed: DEFAULT_CONTENTION_SEED });

export interface HiddenState {
  a: Pt;
  c: Pt;
  range: number;
  frame: number;
  rtsCts: boolean;
}
export const initialHidden = (): HiddenState => ({ a: DEFAULT_A, c: DEFAULT_C, range: RANGE.default, frame: FRAME_RANGE.default, rtsCts: false });

export interface RatesState {
  count: number;
  slow: boolean[];
}
export const DEFAULT_COUNT = 3;
export const initialRates = (): RatesState => ({ count: DEFAULT_COUNT, slow: Array.from({ length: COUNT_RANGE.max }, (_, i) => i === DEFAULT_COUNT - 1) });

export const setSlow = (s: RatesState, i: number, slow: boolean): RatesState => ({ ...s, slow: s.slow.map((v, k) => (k === i ? slow : v)) });
