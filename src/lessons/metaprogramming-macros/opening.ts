import type { Strategy } from './expand';
import type { MistakeId } from './phases';

export type SceneId = 'macro' | 'reflection' | 'phases';

export interface MacroPreset {
  id: string;
  label: string;
  definition: string;
  call: string;
  strategy: Strategy;
}

export const MACRO_PRESETS: MacroPreset[] = [
  { id: 'square', label: 'SQUARE(a + 1)', definition: 'macro SQUARE(x) = x * x', call: 'SQUARE(a + 1)', strategy: 'text' },
  { id: 'counter', label: 'SQUARE(next())', definition: 'macro SQUARE(x) = x * x', call: 'SQUARE(next())', strategy: 'tree' },
  { id: 'once', label: 'bind it once', definition: 'macro SQUARE(x) = let t = x in t * t', call: 'SQUARE(next())', strategy: 'tree' },
  { id: 'capture', label: 'a helper called tmp', definition: 'macro M(x) = let tmp = 10 in x + tmp', call: 'M(tmp)', strategy: 'tree' },
  { id: 'recursive', label: 'expands into itself', definition: 'macro R(x) = R(x) + 1', call: 'R(a)', strategy: 'tree' },
];

/** What each scene opens on. */
export const OPENING = {
  scene: 'macro' as SceneId,
  macro: { preset: 'square', a: 4 },
  reflection: { added: [] as string[] },
  phases: { mistake: 'misspelled' as MistakeId },
};
