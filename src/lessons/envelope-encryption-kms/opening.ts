export type SceneId = 'hierarchy' | 'rotation' | 'shred' | 'workload';

/** Every scene opens here; the vault is rebuilt from the same seed records, with fresh random keys. */
export const OPENING = {
  scene: 'hierarchy' as SceneId,
  tenant: 'acme' as const,
  rotation: { exponent: 4, kib: 8 },
  workload: { rate: 400, size: 512, perKey: 100, cache: true },
};
