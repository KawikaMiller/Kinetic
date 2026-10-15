import { hash32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';
import { flipHeight, type Entry, type Flips, type Rig } from './model';

/** The opening list: 16 keys, five apart, so an absent target is easy to name. */
export const DEFAULT_KEYS: number[] = Array.from({ length: 16 }, (_, i) => (i + 1) * 5);
/** Seeds the towers of the opening list (coins at p = 1/2). */
export const LIST_SEED = 35;
export const DEFAULT_P = 0.5;
export const P_OPTIONS = [0.5, 0.25] as const;

export const defaultEntries = (): Entry[] => {
  const rnd = mulberry32(LIST_SEED);
  return DEFAULT_KEYS.map((key) => ({ key, height: flipHeight(rnd, DEFAULT_P).height }));
};

/** The scene-1 opening search: the biggest key, where the plain list is slowest. */
export const DEFAULT_TARGET = 80;
/** Scene 2's opening insert: an absent key between 30 and 35. */
export const DEFAULT_INSERT_KEY = 33;
/** Seed of the coin flips of scene 2 and 4's inserts. */
export const DEFAULT_COIN_SEED = 35;

/** The coin flips of the `index`-th insert of a session: a seeded stream of their own, so a replay is exact. */
export const coinFlips = (seed: number, index: number, p: number, rig: Rig): Flips => flipHeight(mulberry32(hash32(`${seed}:${index}`)), p, rig);

export const RIG_OPTIONS: { value: Rig; label: string }[] = [
  { value: 'fair', label: 'Fair (seeded)' },
  { value: 'tails', label: 'Rigged: all tails' },
  { value: 'heads', label: 'Rigged: all heads' },
];
export const RIG_NOTE: Record<Rig, string | null> = { fair: null, tails: 'all tails', heads: 'all heads' };

/** What the drawn scenes hold: more than this is refused. */
export const DRAWN_LIMIT = 64;

/** Sizes of the Monte Carlo (n from 16 to 4,096) and its fixed seeds 1..20. */
export const MC_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
export const MC_SEEDS = 20;
export const MC_FOCUS_N = 1024;
