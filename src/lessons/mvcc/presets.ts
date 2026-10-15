import type { Op } from './engine';

/** Updates the idle-in-transaction preset runs against one hot row. */
export const IDLE_UPDATES = 50;
/** Updates the bloat preset spreads over the three keys. */
export const BLOAT_UPDATES = 30;
const FIRST_VALUE = 41;

/** T1 opens a snapshot and goes quiet; autocommit then updates the hot row A over and over. */
export const idlePreset = (): Op[] => [
  { kind: 'begin' },
  { kind: 'select', who: 1 },
  ...Array.from({ length: IDLE_UPDATES }, (_, i): Op => ({ kind: 'update', who: 'auto', key: 'A', value: FIRST_VALUE + i })),
];

/** Autocommit updates cycle over A, B and C with nothing open, so every old version is dead at once. */
export const bloatPreset = (): Op[] =>
  Array.from({ length: BLOAT_UPDATES }, (_, i): Op => ({ kind: 'update', who: 'auto', key: (['A', 'B', 'C'] as const)[i % 3], value: FIRST_VALUE + i }));

/** Two readers, two answers: T1 reads, an autocommit update lands, T2 reads, T1 reads again. Nothing waits. */
export const readersPreset = (): Op[] => [
  { kind: 'begin' }, { kind: 'select', who: 1 },
  { kind: 'update', who: 'auto', key: 'A', value: 40 },
  { kind: 'begin' }, { kind: 'select', who: 2 }, { kind: 'select', who: 1 },
];

/** T1 updates A and stays open; T2 begins and tries to update A: it has to wait. */
export const writersPreset = (): Op[] => [
  { kind: 'begin' }, { kind: 'update', who: 1, key: 'A', value: 41 },
  { kind: 'begin' }, { kind: 'update', who: 2, key: 'A', value: 42 },
];

export const PRESETS = {
  idle: idlePreset, bloat: bloatPreset, readers: readersPreset, writers: writersPreset,
} as const;
export type PresetId = keyof typeof PRESETS;
