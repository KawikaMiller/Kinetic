import { mulberry32 } from '../../core/random';
import { DEFAULT_N, DEFAULT_SEED, DOMAIN, type Pt } from './data';
import { HD_MIN_DIM } from './highDim';
import { DEFAULT_QUERY, type QueryMode } from './query';

export type SceneId = 'problem' | 'kd' | 'quad' | 'geohash' | 'choose';

export const SCENE_IDS: readonly SceneId[] = ['problem', 'kd', 'quad', 'geohash', 'choose'];

/** The k-d scene's size choices; the tree is drawn only while it stays readable. */
export const KD_SIZES = [15, 31, 127, 300] as const;
export const KD_DRAWN_LIMIT = 31;
export const QUAD_CAPACITY = 4;
export const QUAD_K = 3;
export const QUAD_START_POINTS = 60;
export const GEOHASH_VECTOR = { lat: 57.64911, lon: 10.40744, precision: 5 } as const;

/** Where each scene opens. Pure, so a test can switch through every scene and check each try-this against its own state. */
export interface Opening {
  problem: { seed: number; n: number; mode: QueryMode; q: readonly [number, number] };
  kd: { seed: number; n: number; mode: QueryMode; k: number };
  quad: { seed: number; capacity: number; preset: 'uniform' | 'clustered' | 'coincident'; mode: QueryMode };
  geohash: { lat: number; lon: number; precision: number; neighbours: boolean; preset: 'vector' | 'spain' | 'boundary' };
  choose: { dims: number };
}

export function openingState(): Opening {
  return {
    problem: { seed: DEFAULT_SEED, n: DEFAULT_N, mode: 'range', q: DEFAULT_QUERY.q },
    kd: { seed: DEFAULT_SEED, n: KD_SIZES[1], mode: 'nn', k: 1 },
    quad: { seed: DEFAULT_SEED, capacity: QUAD_CAPACITY, preset: 'uniform', mode: 'nn' },
    geohash: { lat: GEOHASH_VECTOR.lat, lon: GEOHASH_VECTOR.lon, precision: GEOHASH_VECTOR.precision, neighbours: false, preset: 'vector' },
    choose: { dims: HD_MIN_DIM },
  };
}

/** The quadtree scene's three data sets. */
export function quadPreset(preset: Opening['quad']['preset'], seed: number): Pt[] {
  if (preset === 'uniform') {
    const rnd = mulberry32(seed);
    return Array.from({ length: QUAD_START_POINTS }, () => [Math.round(rnd() * DOMAIN * 100) / 100, Math.round(rnd() * DOMAIN * 100) / 100]);
  }
  if (preset === 'clustered') {
    return Array.from({ length: QUAD_START_POINTS }, (_, i) => {
      const home = i % 2 === 0 ? [22, 70] : [74, 28];
      return [home[0] + (i % 8) * 0.8, home[1] + Math.floor(i / 8) * 0.8];
    });
  }
  return Array.from({ length: 8 }, () => [DOMAIN / 3, (DOMAIN * 2) / 3]);
}
