import type { OpId, ScanKind, ScanMode } from './patterns';

/** What each scene opens on, as pure functions the tests walk. */

export const DEFAULT_LIST = [3, 1, 4, 1, 5, 9, 2, 6] as const;
export const DEFAULT_P = 4;

export interface MapOpening {
  values: number[];
  p: number;
}
export const mapOpening = (): MapOpening => ({ values: [1, 2, 3, 4, 5, 6, 7, 8], p: DEFAULT_P });

export interface ReduceOpening {
  values: number[];
  op: OpId;
  arrival: boolean;
  p: number;
}
export const reduceOpening = (): ReduceOpening => ({ values: [...DEFAULT_LIST], op: 'plus', arrival: false, p: DEFAULT_P });

export type UseCase = 'none' | 'compaction' | 'offsets';
export interface ScanOpening {
  values: number[];
  op: OpId;
  kind: ScanKind;
  mode: ScanMode;
  p: number;
  useCase: UseCase;
}
export const scanOpening = (): ScanOpening => ({ values: [...DEFAULT_LIST], op: 'plus', kind: 'hillis-steele', mode: 'inclusive', p: DEFAULT_P, useCase: 'none' });

export const SCENE_OPENINGS = { map: mapOpening, reduce: reduceOpening, scan: scanOpening } as const;
