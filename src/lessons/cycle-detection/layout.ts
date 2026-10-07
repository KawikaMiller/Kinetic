import type { Pt } from '../../components/GraphView';

/** Id of the "null" box at the end of a list without a loop. */
export const NULL_ID = -1;

const PAD = 40;
const GAP = 58;
/** Room above the drawing for the S / F tags and a one-node loop's arc. */
const TOP = 46;
/** A plain list snakes onto a second row after this many nodes. */
const ROW = 9;
const ROW_GAP = 90;

export interface RhoLayout {
  at: Map<number, Pt>;
  width: number;
  height: number;
}

/**
 * Positions for a rho-shaped list: the tail of `mu` nodes in a row, then the loop of
 * `lambda` nodes on a circle whose leftmost point is node mu, going clockwise. Without a
 * loop, the mu + lambda nodes snake left to right then right to left, ending in a null box.
 */
export function rhoLayout(mu: number, lambda: number, loop: boolean): RhoLayout {
  const at = new Map<number, Pt>();
  if (!loop) {
    const ids = [...Array.from({ length: mu + lambda }, (_, i) => i), NULL_ID];
    const perRow = Math.min(ROW, ids.length);
    ids.forEach((id, k) => {
      const row = Math.floor(k / perRow);
      const col = row % 2 === 0 ? k % perRow : perRow - 1 - (k % perRow);
      at.set(id, { x: PAD + col * GAP, y: TOP + row * ROW_GAP });
    });
    const rows = Math.ceil(ids.length / perRow);
    return { at, width: PAD * 2 + (perRow - 1) * GAP, height: TOP + (rows - 1) * ROW_GAP + PAD };
  }
  const r = lambda === 1 ? 0 : Math.max(46, (lambda * GAP) / (2 * Math.PI));
  const cy = TOP + r;
  for (let i = 0; i < mu; i++) at.set(i, { x: PAD + i * GAP, y: cy });
  const cx = PAD + mu * GAP + r;
  for (let j = 0; j < lambda; j++) {
    const t = Math.PI + (j * 2 * Math.PI) / lambda;
    at.set(mu + j, { x: Math.round(cx + r * Math.cos(t)), y: Math.round(cy + r * Math.sin(t)) });
  }
  return { at, width: Math.round(cx + r + PAD), height: Math.round(cy + r + PAD) };
}
