import type { TamperTarget } from './thief';

/** What one press of "Flip it and let Bob open it" did. */
export interface Outcome {
  message: number;
  target: TamperTarget;
  bit: number;
  /** The bit actually flipped, in words (the slider's bit wraps inside the region). */
  where: string;
  opened: boolean;
}

/** The outcome counts as shown only while the controls still match it: a changed message, target or bit blanks the stat, the caption and the diagram together. */
export const shownOutcome = (outcome: Outcome | null, which: number, target: TamperTarget, bit: number): Outcome | null =>
  outcome && outcome.message === which && outcome.target === target && outcome.bit === bit ? outcome : null;

/** The diagram colour of message `index` (0-based): green when the flip was refused, red when Bob opened it, none otherwise. It follows the legend and the stat. */
export const messageTone = (shown: Outcome | null, index: number): 'ok' | 'bad' | undefined => (shown && shown.message === index + 1 ? (shown.opened ? 'bad' : 'ok') : undefined);
