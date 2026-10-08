import type { Config } from './model';

/** Whole-config presets: each sets every field, so a chip lights up only while the settings still match it. */
export const PRESETS: { id: string; label: string; cfg: Config }[] = [
  { id: 'default', label: '5% bug, rolling', cfg: { strategy: 'rolling', bugRate: 0.05, surgePct: 25, unavailablePct: 25, bakeTicks: 8, analysis: true, schema: 'compatible', drain: true, seed: 1 } },
  { id: 'short-bake', label: 'Canary, 3% bug, 1 min bake', cfg: { strategy: 'canary', bugRate: 0.03, surgePct: 25, unavailablePct: 25, bakeTicks: 1, analysis: true, schema: 'compatible', drain: true, seed: 4 } },
  { id: 'breaking', label: 'Breaking migration', cfg: { strategy: 'rolling', bugRate: 0, surgePct: 25, unavailablePct: 25, bakeTicks: 8, analysis: true, schema: 'breaking', drain: true, seed: 1 } },
  { id: 'clean', label: 'Clean v2, no bug', cfg: { strategy: 'canary', bugRate: 0, surgePct: 25, unavailablePct: 25, bakeTicks: 8, analysis: true, schema: 'compatible', drain: true, seed: 1 } },
];
