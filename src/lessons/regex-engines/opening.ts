import type { RunMode } from './engines';

export type SceneId = 'build' | 'run' | 'which' | 'backtrack';
export type WhichRule = 'first' | 'longest';

export interface Preset {
  pattern: string;
  subject: string;
}

/** The presets of the construction and simulation scenes. */
export const PRESETS: Preset[] = [
  { pattern: 'a(b|c)*d', subject: 'abcbd' },
  { pattern: '(ab)+', subject: 'ababab' },
  { pattern: 'a?b*', subject: 'abbb' },
  { pattern: 'colou?r', subject: 'colour' },
  { pattern: '[ab]*a[ab][ab][ab]', subject: 'abbabab' },
];

/** The backtracking scene adds a nested repeat and a back-reference. */
export const NESTED_REPEAT: Preset = { pattern: '(a*)*b', subject: 'a'.repeat(12) };
export const BACKREFERENCE: Preset = { pattern: '(a|b)\\1', subject: 'aa' };
export const BACKTRACK_PRESETS: Preset[] = [PRESETS[0], PRESETS[1], PRESETS[3], NESTED_REPEAT, BACKREFERENCE];

/** What each scene opens on. */
export const OPENING = {
  scene: 'build' as SceneId,
  build: PRESETS[0],
  run: { ...PRESETS[0], mode: 'full' as RunMode },
  which: { pattern: 'a|ab', subject: 'ab', rule: 'first' as WhichRule },
  backtrack: NESTED_REPEAT,
};
