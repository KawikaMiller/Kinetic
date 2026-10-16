import type { Tone } from '../../core/tone';
import type { MesiState } from './mesi';

/** The fixed MESI colour map: Modified is the costly, only up-to-date copy; Exclusive the clean sole copy. */
export const STATE_TONE: Record<MesiState, Tone> = { M: 'bad', E: 'ok', S: 'info', I: 'dim' };
