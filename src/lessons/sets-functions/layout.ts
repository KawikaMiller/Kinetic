// Scene geometry for the Venn diagram and the mapping diagram. Pure, no React.
import type { Pt } from '../../core/geometry';
import type { Membership, SetName } from './model';

export const VENN = { width: 540, height: 330 };

export interface Circle {
  set: SetName;
  cx: number;
  cy: number;
  r: number;
  /** Where the set's name sits. */
  label: Pt;
}

export function vennCircles(three: boolean): Circle[] {
  return three
    ? [
        { set: 'A', cx: 215, cy: 138, r: 104, label: { x: 110, y: 44 } },
        { set: 'B', cx: 325, cy: 138, r: 104, label: { x: 430, y: 44 } },
        { set: 'C', cx: 270, cy: 228, r: 98, label: { x: 270, y: 322 } },
      ]
    : [
        { set: 'A', cx: 210, cy: 170, r: 118, label: { x: 110, y: 44 } },
        { set: 'B', cx: 330, cy: 170, r: 118, label: { x: 430, y: 44 } },
      ];
}

const inside = (c: Circle, p: Pt) => (p.x - c.cx) ** 2 + (p.y - c.cy) ** 2 <= c.r ** 2;

/** Which of the drawn sets a point falls in. Sets that aren't drawn keep `keep`'s membership. */
export function membershipAt(p: Pt, circles: Circle[], keep: Membership): Membership {
  const m = { ...keep };
  for (const c of circles) m[c.set] = inside(c, p);
  return m;
}

const key = (m: Membership, three: boolean) => `${m.A ? 'A' : ''}${m.B ? 'B' : ''}${three && m.C ? 'C' : ''}`;

/** A point inside each region (by the sets it's in), where its elements are laid out. */
const ANCHORS: Record<'two' | 'three', Record<string, Pt>> = {
  two: { A: { x: 145, y: 160 }, AB: { x: 270, y: 170 }, B: { x: 395, y: 160 }, '': { x: 70, y: 306 } },
  three: {
    A: { x: 168, y: 100 }, B: { x: 372, y: 100 }, C: { x: 270, y: 282 }, AB: { x: 270, y: 70 },
    AC: { x: 208, y: 208 }, BC: { x: 332, y: 208 }, ABC: { x: 270, y: 162 }, '': { x: 70, y: 306 },
  },
};

const ROW_GAP = 24;
const COL_GAP = 66;

/** Positions for every element: stacked in a column (two wide when crowded) around its region's anchor. */
export function placeElements(els: { name: string; m: Membership }[], three: boolean): Record<string, Pt> {
  const groups = new Map<string, string[]>();
  for (const e of els) {
    const k = key(e.m, three);
    groups.set(k, [...(groups.get(k) ?? []), e.name]);
  }
  const at: Record<string, Pt> = {};
  for (const [k, names] of groups) {
    const anchor = ANCHORS[three ? 'three' : 'two'][k];
    const outside = k === '';
    const cols = outside ? names.length : names.length > 3 ? 2 : 1;
    const rows = Math.ceil(names.length / cols);
    names.forEach((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      at[name] = {
        x: anchor.x + (outside ? col * COL_GAP : (col - (cols - 1) / 2) * COL_GAP),
        y: anchor.y + (outside ? 0 : (row - (rows - 1) / 2) * ROW_GAP),
      };
    });
  }
  return at;
}

export const chipWidth = (label: string) => Math.max(34, label.length * 7.4 + 16);

// ── Mapping diagram ──────────────────────────────────────────────────

export const MAP = { width: 540, height: 320, domainX: 150, codomainX: 390, top: 36, bottom: 300 };

/** Evenly spaced dots down a column. */
export function columnY(i: number, n: number): number {
  if (n <= 1) return (MAP.top + MAP.bottom) / 2;
  const gap = Math.min(44, (MAP.bottom - MAP.top) / (n - 1));
  const span = gap * (n - 1);
  const start = (MAP.top + MAP.bottom - span) / 2;
  return start + i * gap;
}
