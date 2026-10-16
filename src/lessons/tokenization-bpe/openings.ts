/** Each scene's opening state, as a pure function of nothing, so a test can switch through every scene. */
import type { Mode, Pair } from './bpe';
import { ILLUSTRATIVE_WINDOWS, PARAGRAPH } from './corpus';

export const mergeOpening = () => ({ path: [] as Pair[] });
export const vocabOpening = () => ({ merges: 60, text: 'the newest tokenizer splits rare words into pieces' });
export const bytesOpening = () => ({ mode: 'chars' as Mode, text: 'café' });
export const costOpening = () => ({
  doc: PARAGRAPH.split('. ')[0] + '.',
  window: ILLUSTRATIVE_WINDOWS[1] as number,
  word: 'strawberry',
  number: '2024202520262027',
});
