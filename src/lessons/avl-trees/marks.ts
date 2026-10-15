import type { TreeEdgeMark, TreeNodeMark } from '../../components/TreeSvg';
import type { AvlFrame } from './frames';

const EMPHASIS = 1.15;
const CHECKED_TINT = 22;

/** How a frame colours its nodes: out of balance, just rotated, being looked at, on the walk, checked and fine. */
export const frameNodeMark =
  (f: AvlFrame) =>
  (k: number): TreeNodeMark | null => {
    if (k === f.bad) return { tone: 'bad', fill: 'solid' };
    if (f.moved.includes(k)) return { tone: 'violet', fill: 'solid' };
    if (k === f.hi) return { tone: 'hi', fill: 'solid' };
    if (k === f.succ) return { tone: 'info', fill: 'tint' };
    if (f.path.includes(k)) return { tone: 'info', fill: 'tint' };
    if (f.checked.includes(k)) return { tone: 'ok', fill: 'tint', tint: CHECKED_TINT };
    return null;
  };

/** Edges along the walk down are drawn in the secondary colour. */
export const frameEdgeMark =
  (f: AvlFrame) =>
  (parent: number, child: number): TreeEdgeMark | null =>
    f.path.includes(parent) && f.path.includes(child) ? { tone: 'info' } : null;

export const frameScale =
  (f: AvlFrame) =>
  (k: number): number =>
    k === f.hi || k === f.bad ? EMPHASIS : 1;

export const AVL_LEGEND: { color: string; label: string; shape: 'dot' }[] = [
  { color: 'var(--hi)', label: 'being looked at', shape: 'dot' },
  { color: 'var(--info)', label: 'walk down', shape: 'dot' },
  { color: 'var(--ok)', label: 'checked, inside the rule', shape: 'dot' },
  { color: 'var(--bad)', label: 'out of balance', shape: 'dot' },
  { color: 'var(--violet)', label: 'moved by a rotation', shape: 'dot' },
];
