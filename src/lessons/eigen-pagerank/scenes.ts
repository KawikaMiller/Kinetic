/** What each of the lesson's four scenes opens on, pure, so a test can check that switching scenes lands on the right start. */
import { DEFAULT_MATRIX, PRESETS as MATRICES, type Matrix2 } from './eigen';
import type { PresetId } from './pagerank';

export type Scene = 'apply' | 'nothing' | 'surfer' | 'leaks';

export type ArrowMode = 'apply' | 'nothing';

export const SCENES: { value: Scene; label: string }[] = [
  { value: 'apply', label: 'Apply it again and again' },
  { value: 'nothing', label: 'When nothing lines up' },
  { value: 'surfer', label: 'PageRank as a random surfer' },
  { value: 'leaks', label: 'Where it leaks' },
];

export type SceneSetup =
  | { kind: 'arrows'; mode: ArrowMode }
  | { kind: 'web'; presetIds: readonly PresetId[]; initial: PresetId };

export const SCENE_SETUP: Record<Scene, SceneSetup> = {
  apply: { kind: 'arrows', mode: 'apply' },
  nothing: { kind: 'arrows', mode: 'nothing' },
  surfer: { kind: 'web', presetIds: ['web6', 'example'], initial: 'web6' },
  leaks: { kind: 'web', presetIds: ['chain', 'trap', 'deadend'], initial: 'chain' },
};

/** The matrix an arrow scene opens on. */
export const startMatrix = (mode: ArrowMode): Matrix2 => (mode === 'apply' ? DEFAULT_MATRIX : MATRICES.find((m) => m.id === 'rotation')!.A);
