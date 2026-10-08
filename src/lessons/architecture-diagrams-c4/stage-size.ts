import { minWidthForText } from '../../core/scale';
import { VIEW_W } from './layout';

export { VIEW_W };

/** Smallest scene text: the 11px second line of a box and the 11px arrow labels. */
const SMALLEST_TEXT_PX = 11;
/** The stage's side padding around the drawing. */
const STAGE_PAD_X = 44;

/** Narrowest width at which the drawing keeps its text at 8px or more; below it the stage scrolls sideways. */
export const MIN_WIDTH = minWidthForText(VIEW_W, SMALLEST_TEXT_PX, { padX: STAGE_PAD_X });
