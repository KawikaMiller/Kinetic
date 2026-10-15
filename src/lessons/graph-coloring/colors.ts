import { cssVar, type TokenName } from '../../core/palette';

/** Twelve plain hues for colours 1 to 12 (a graph has at most 12 nodes): categorical tones and track hues, never the status colours. */
const COLOUR_TOKENS: readonly TokenName[] = ['orange', 'amber', 'pink', 'sky', 'violet', 'trkHw', 'trkMath', 'trkLang', 'trkWeb', 'trkMl', 'trkLead', 'trkCraft'];

/** The CSS colour of colour number `c` (counting from 1). */
export const colourVar = (c: number): string => cssVar(COLOUR_TOKENS[(c - 1) % COLOUR_TOKENS.length]);
