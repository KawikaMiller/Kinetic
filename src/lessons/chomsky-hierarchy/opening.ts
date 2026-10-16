import type { CardId } from './languages';
import type { PumpLanguageId, PumpMode } from './pumping';

export type SceneId = 'rings' | 'pumping' | 'minimise';

/** What each scene opens on. */
export const OPENING = {
  scene: 'rings' as SceneId,
  rings: { tester: { card: 'anbn' as CardId, input: 'aaabbb' } },
  pumping: { language: 'anbn' as PumpLanguageId, mode: 'regular' as PumpMode, p: 4, shape: 'anbn', n: 4 },
  minimise: { example: 'mod3' },
};

/** The most characters the Test a string field takes. */
export const MAX_TEST_INPUT = 12;
