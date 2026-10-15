import { useState } from 'react';
import { DEFAULT_K, DEFAULT_QUERY, DEFAULT_SEED, type Point } from './data';
import { DEFAULT_EF_CONSTRUCTION, DEFAULT_EF_SEARCH, DEFAULT_M } from './hnsw';
import { DEFAULT_NLIST, DEFAULT_NPROBE } from './ivf';

export interface Settings {
  k: number;
  query: Point;
  seed: number;
  nlist: number;
  nprobe: number;
  m: number;
  efConstruction: number;
  efSearch: number;
}

export const DEFAULT_SETTINGS: Settings = {
  k: DEFAULT_K,
  query: DEFAULT_QUERY,
  seed: DEFAULT_SEED,
  nlist: DEFAULT_NLIST,
  nprobe: DEFAULT_NPROBE,
  m: DEFAULT_M,
  efConstruction: DEFAULT_EF_CONSTRUCTION,
  efSearch: DEFAULT_EF_SEARCH,
};

/** The settings the scenes share: the query, k and the two indexes' knobs, so the last scene can compare what the others set. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  return [s, (patch) => setS((old) => ({ ...old, ...patch }))];
}
