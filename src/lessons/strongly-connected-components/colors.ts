import { cssVar } from '../../core/palette';
import { plainTone } from '../../core/tone';

/** The colour of component c: a plain hue, never a status colour (they repeat after four). */
export const compColor = (c: number): string => cssVar(plainTone(c));
