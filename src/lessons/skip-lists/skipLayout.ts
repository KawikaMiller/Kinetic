import { minWidthForText } from '../../core/scale';
import { HEAD, type Pos, type Snapshot } from './model';

export const COL = 46;
export const CELL_W = 32;
export const CELL_H = 20;
export const ROW = 26;
const PAD_X = 14;
const PAD_TOP = 30;
export const FOOT = 40;
/** Smallest text drawn: the key labels. */
export const KEY_TEXT_PX = 11;
const STAGE_PAD_X = 36;

/** Where everything sits for a snapshot: columns (head, towers, nil), rows (levels), and the drawing's size. */
export function layout(snap: Snapshot) {
  const n = snap.towers.length;
  const cols = new Map<number, number>(snap.towers.map((t, i) => [t.key, i + 1]));
  const width = 2 * PAD_X + CELL_W + (n + 1) * COL;
  const height = PAD_TOP + snap.levels * ROW + FOOT;
  const x = (col: number) => PAD_X + CELL_W / 2 + col * COL;
  const y = (level: number) => PAD_TOP + (snap.levels - 1 - level) * ROW + CELL_H / 2;
  const colOf = (pos: Pos | null) => (pos === HEAD ? 0 : pos === null ? n + 1 : (cols.get(pos) as number));
  return { n, width, height, x, y, colOf };
}

/** The narrowest stage width at which the key labels keep to 8px or more. */
export const drawingMinWidth = (snap: Snapshot): number => minWidthForText(layout(snap).width, KEY_TEXT_PX, { padX: STAGE_PAD_X });
