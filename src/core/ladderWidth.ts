/**
 * The narrowest container at which a SequenceDiagram's NOTE text (11px, under the arrows) stays at MIN_TEXT_PX or more.
 * SequenceDiagram sizes its own scroll width from the 12px labels, so with notes it can render them at 7.3px on a phone.
 * Wrapping the diagram in a WideRegion at this width gives the diagram that room. The wider of the two layouts it may
 * pick (notes on one line, or wrapped) decides, so whichever one is chosen at that width is readable. Pure.
 */
import { minWidthForText } from './scale';
import { sequenceLayout, type SeqActor, type SeqMessage } from './sequenceLayout';

/** The note font size in kit.css (`.seq-note`). */
export const SEQ_NOTE_PX = 11;

export function ladderMinWidth(actors: readonly SeqActor[], messages: readonly SeqMessage[], width?: number): number {
  const roomy = sequenceLayout(actors, messages, width, { wrapNotes: false });
  const compact = sequenceLayout(actors, messages, width);
  const hasNotes = messages.some((m) => m.note);
  const widest = Math.max(roomy.width, compact.width);
  return Math.max(roomy.minWidth, compact.minWidth, hasNotes ? minWidthForText(widest, SEQ_NOTE_PX) : 0);
}
