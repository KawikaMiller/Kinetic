// Scene geometry: environments in the first two columns (global, then calls and
// blocks), function objects in the third. Each box's place is fixed by its preset.
import type { Pt } from '../../core/geometry';
import { heapRect, type Rect } from '../../components/memory';
import type { Place } from './model';

export const SCENE_W = 660;
/** Wide enough that "makeCounter() #1" and its "captured" tag don't collide. */
export const BOX_W = 204;
const COL_X = [12, 232, 452] as const;
const TOP = 40;
const ROW_PITCH = 100;
const BOTTOM_PAD = 20;

export const placeAt = (p: Place): Pt => ({ x: COL_X[p.col], y: TOP + p.row * ROW_PITCH });
export const boxRect = (p: Place, fieldCount: number): Rect => heapRect(placeAt(p), BOX_W, fieldCount);

/** Where the timer queue sits: under the global environment. */
export const TIMER_PLACE: Place = { col: 0, row: 1 };

/** Scene height that fits every row a preset uses. */
export const sceneHeight = (maxRow: number) => TOP + (maxRow + 1) * ROW_PITCH + BOTTOM_PAD;
