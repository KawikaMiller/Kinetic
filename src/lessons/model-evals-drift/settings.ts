/** Opening states of the five scenes (pure data, tested against the try-this entries). */
import type { GateRule } from './gate';
import type { Metric } from './falseAlarm';
import type { Kind } from './world';
import { DEFAULT_STREAM_SEED } from './world';

export const SCENES = ['drift', 'delay', 'false', 'gate', 'leak'] as const;
export type SceneId = (typeof SCENES)[number];

export const DRIFT_DEFAULT = { kind: 'covariate' as Kind, day: 20, sizePct: 80, seed: DEFAULT_STREAM_SEED, shownDay: 25 } as const;
/** The drift scene has no label-delay control: labels are treated as available the same day. */
export const DRIFT_LABEL_DELAY = 0;
export const DELAY_DEFAULT = { kind: 'concept' as Kind, delay: 7, seed: DEFAULT_STREAM_SEED } as const;
/** The delay scene's shift is fixed: it starts on this day at this size. */
export const DELAY_SHIFT = { day: 20, sizePct: 60 } as const;
export const FALSE_DEFAULT = { metric: 'ks' as Metric, threshold: 0.08 } as const;
export const GATE_DEFAULT = { sizeIndex: 2, rule: 'overall' as GateRule } as const;
export const LEAK_DEFAULT = { leaked: false } as const;

export const SIZE_STEPS = [0, 20, 40, 60, 80, 100];
export const DAY_FIRST = 2;
export const DAY_LAST = 39;
export const DELAY_MAX = 14;
