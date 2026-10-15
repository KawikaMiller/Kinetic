import { clamp } from '../../core/math';
import { minWidthForText } from '../../core/scale';
import { heightOf, sizeOf, type Tree } from './model';

const COLUMN_PX = 30;
export const SIDE_PAD = 30;
const MIN_WIDTH = 330;
const MAX_WIDTH = 960;
export const TOP = 30;
const BOTTOM = 40;
const TARGET_DEPTH_PX = 300;
const MIN_GAP = 14;
const MAX_GAP = 48;
export const RADIUS = 13;
/** Smallest text drawn: the balance-factor badge. */
export const BADGE_TEXT_PX = 10;
const STAGE_PAD_X = 36;

/** Size of the drawing for a tree: one column per node, levels squeezed to fit a chain on screen. */
export function treeBox(t: Tree): { width: number; height: number; gap: number } {
  const n = sizeOf(t);
  const depth = Math.max(0, heightOf(t) - 1);
  const gap = clamp(TARGET_DEPTH_PX / Math.max(1, depth), MIN_GAP, MAX_GAP);
  return { width: clamp(n * COLUMN_PX + 2 * SIDE_PAD, MIN_WIDTH, MAX_WIDTH), height: TOP + depth * gap + BOTTOM, gap };
}

/** The narrowest stage width at which every tree shown keeps its badges at 8px or more. */
export const stageMinWidth = (...trees: Tree[]): number =>
  Math.max(...trees.map((t) => minWidthForText(treeBox(t).width, BADGE_TEXT_PX, { padX: STAGE_PAD_X })));
