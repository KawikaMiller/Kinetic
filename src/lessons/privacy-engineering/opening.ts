import type { Strategy } from './copies';
import type { AgeLevel, ZipLevel } from './kanon';
import type { FieldId, Treatment } from './logline';
import { FIELD_ORDER } from './logline';

export type SceneId = 'records' | 'kanon' | 'noise' | 'logs';
export const OPENING_SCENE: SceneId = 'records';

export interface RecordsState {
  strategy: Strategy;
  day: number;
  legalHold: boolean;
  minimise: boolean;
}

export interface KanonState {
  zip: ZipLevel;
  age: AgeLevel;
  /** Rows in groups smaller than this are suppressed (1 suppresses nothing). */
  suppressBelow: number;
}

export interface NoiseState {
  /** The epsilon the next question will use. */
  epsilon: number;
  /** The epsilon of every question asked so far, in order. */
  asked: number[];
}

export interface LogsState {
  choice: Record<FieldId, Treatment>;
}

export const SUPPRESS_RANGE = { min: 1, max: 6 } as const;

/** Every scene's opening state as a pure function (a fresh copy each time), so a test can switch through them and see none leaks into another. */
export const initialRecords = (): RecordsState => ({ strategy: 'primary', day: 0, legalHold: false, minimise: false });
export const initialKanon = (): KanonState => ({ zip: 5, age: 'exact', suppressBelow: 1 });
export const initialNoise = (): NoiseState => ({ epsilon: 1, asked: [] });
export const initialLogs = (): LogsState => ({ choice: Object.fromEntries(FIELD_ORDER.map((f) => [f, 'keep'])) as Record<FieldId, Treatment> });
