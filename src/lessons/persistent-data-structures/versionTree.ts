import { childrenOf, type Store } from './model';

/** Geometry of the version tree in scene 4; the height follows the data so a long chain never spills out of its box. */
export const VERSION_TREE = { width: 360, top: 26, levelGap: 36, radius: 15, pad: 30 } as const;

/** Levels of the version tree (a lone v0 is 1), counted from the parent links. */
export function versionDepth(s: Store): number {
  const go = (id: number): number => 1 + Math.max(0, ...childrenOf(s, id).map(go));
  return go(0);
}

/** Pixel height for `depth` levels: the top margin, the gaps between levels, then the last node and the bottom padding. */
export const versionTreeHeight = (depth: number): number => VERSION_TREE.top + VERSION_TREE.levelGap * (depth - 1) + VERSION_TREE.radius + VERSION_TREE.pad;
