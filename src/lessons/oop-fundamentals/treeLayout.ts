// Where the Shape → Circle, Rect → Square boxes sit, and how big they are.
import type { Pt } from '../../core/geometry';
import { CLASSES, type ClassName } from './model';

export const TREE_W = 660;
export const CLASS_W = 150;
export const TITLE_H = 26;
export const METHOD_H = 18;
const PAD_BOTTOM = 8;

/** Centre of each class box. */
export const CLASS_AT: Record<ClassName, Pt> = {
  Shape: { x: 400, y: 70 },
  Circle: { x: 240, y: 200 },
  Rect: { x: 560, y: 200 },
  Square: { x: 560, y: 320 },
};

export const classHeight = (name: ClassName) => TITLE_H + Math.max(1, CLASSES.find((c) => c.name === name)!.own.length) * METHOD_H + PAD_BOTTOM;

/** The box's rect in scene coordinates, for arrows. */
export function classRect(name: ClassName) {
  const at = CLASS_AT[name];
  const h = classHeight(name);
  return { x: at.x - CLASS_W / 2, y: at.y - h / 2, w: CLASS_W, h };
}
