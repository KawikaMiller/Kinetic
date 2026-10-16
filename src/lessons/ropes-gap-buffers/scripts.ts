import { mulberry32 } from '../../core/random';
import { arrayCreate, arrayDelete, arrayInsert, arrayTouches, gapCreate, gapDelete, gapInsert, gapMoveTo, gapTouches } from './structures';

export type ScriptId = 'typical' | 'replace';

/** The file the two editing scripts run on: far larger than the drawn text, so far jumps cost visibly. Model only. */
export const SCRIPT_TEXT_LENGTH = 2000;
export const SCRIPT_SEED = 33;
const TYPICAL_KEYS = 150;
const MAX_SHORT_MOVE = 5;
const REPLACEMENTS = 40;

export interface ScriptInfo {
  id: ScriptId;
  label: string;
  what: string;
}

export const SCRIPTS: ScriptInfo[] = [
  { id: 'typical', label: 'Typical editing', what: `${TYPICAL_KEYS} keystrokes in a ${SCRIPT_TEXT_LENGTH}-character file: mostly typing, with cursor moves of up to ${MAX_SHORT_MOVE}` },
  { id: 'replace', label: 'Search and replace across the file', what: `${REPLACEMENTS} replacements, each one a jump to a random place followed by a one-character edit` },
];

export interface ScriptCost {
  gap: number;
  array: number;
  /** Characters the gap travelled in all, for the sentence under the chips. */
  gapMoves: number;
  /** The longest single jump, in characters. */
  longestJump: number;
}

/** The same seeded edits on a gap buffer and on an array, counted in touches (a character moved, written or copied). */
export function scriptCost(id: ScriptId, seed = SCRIPT_SEED): ScriptCost {
  const rnd = mulberry32(seed);
  const base = Array.from({ length: SCRIPT_TEXT_LENGTH }, () => 'abcdefghij'[Math.floor(rnd() * 10)]);
  const gap = gapCreate(base, SCRIPT_TEXT_LENGTH + 16);
  const arr = arrayCreate(base);
  let len = SCRIPT_TEXT_LENGTH;
  let cursor = Math.floor(len / 2);
  gapMoveTo(gap, cursor);
  let longestJump = Math.abs(cursor - SCRIPT_TEXT_LENGTH);
  if (id === 'typical') {
    for (let i = 0; i < TYPICAL_KEYS; i++) {
      if (rnd() < 0.8) {
        gapInsert(gap, cursor, ['q']);
        arrayInsert(arr, cursor, ['q']);
        cursor++;
        len++;
      } else {
        const to = Math.min(len, Math.max(0, cursor + Math.floor(rnd() * (2 * MAX_SHORT_MOVE + 1)) - MAX_SHORT_MOVE));
        longestJump = Math.max(longestJump, Math.abs(to - cursor));
        gapMoveTo(gap, to);
        cursor = to;
      }
    }
  } else {
    for (let i = 0; i < REPLACEMENTS; i++) {
      const at = Math.floor(rnd() * len);
      longestJump = Math.max(longestJump, Math.abs(at - cursor));
      gapDelete(gap, at, at + 1);
      gapInsert(gap, at, ['r']);
      arrayDelete(arr, at, at + 1);
      arrayInsert(arr, at, ['r']);
      cursor = at + 1;
    }
  }
  return { gap: gapTouches(gap), array: arrayTouches(arr), gapMoves: gap.moves, longestJump };
}
