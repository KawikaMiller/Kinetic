import {
  DEFAULT_BANDWIDTH, DEFAULT_BITS, DEFAULT_D, DEFAULT_HIDE, DEFAULT_N, DEFAULT_PRED, DEFAULT_TRIPS, type HideParams, type Predicate, type RegisterBits, type TailMode,
} from './model';

/** What each scene opens on, as pure functions the tests walk (a scene must never open on another scene's state). */

export interface LanesOpening {
  n: number;
  bits: RegisterBits;
  tail: TailMode;
  bandwidth: number;
}
export const lanesOpening = (): LanesOpening => ({ n: DEFAULT_N, bits: DEFAULT_BITS, tail: 'scalar', bandwidth: DEFAULT_BANDWIDTH });

export interface DependenceOpening {
  d: number;
  lanes: number;
}
export const dependenceOpening = (): DependenceOpening => ({ d: DEFAULT_D, lanes: 4 });

export type WarpMode = 'branch' | 'loop';
export interface WarpOpening {
  mode: WarpMode;
  pred: Predicate;
  trips: readonly number[];
}
export const warpOpening = (): WarpOpening => ({ mode: 'branch', pred: DEFAULT_PRED, trips: DEFAULT_TRIPS });

export const hidingOpening = (): HideParams => ({ ...DEFAULT_HIDE });

export const SCENE_OPENINGS = {
  lanes: lanesOpening,
  dependence: dependenceOpening,
  warp: warpOpening,
  hiding: hidingOpening,
} as const;
