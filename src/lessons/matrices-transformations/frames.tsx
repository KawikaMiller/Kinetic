import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { PRESETS, collapse, columns, det2, isSingular, movesOrigin, sameMatrix, thenApply, type M2, type M3, type P2, type PresetId } from './model';

/** A number as the readouts show it: rounded, trailing zeros dropped, a real minus sign. */
export function num(v: number, dp = 3): string {
  const r = Number(v.toFixed(dp));
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** A determinant or area factor in significant figures, so 0.0001 never reads as "0". */
export function sig(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const body = a < 1e-4 || a >= 1e5 ? a.toExponential(2).replace('e-', 'e−').replace('e+', 'e') : String(Number(a.toPrecision(4)));
  return v < 0 ? `−${body}` : body;
}

/** A coordinate: dp decimals, but never a false 0 for a tiny nonzero value. */
const coord = (v: number, dp: number) => (v !== 0 && Math.abs(v) < 10 ** -dp ? sig(v) : num(v, dp));

export const pt = ([x, y]: P2, dp = 3) => `(${coord(x, dp)}, ${coord(y, dp)})`;

/** What the matrix does, from its determinant. True for whatever matrix is on screen. */
export function transformCaption(m: M2): ReactNode {
  const [i, j] = columns(m);
  const lands = <>î lands on {pt(i)} and ĵ on {pt(j)}: the matrix's two columns.</>;
  const d = det2(m);
  if (isSingular(m)) {
    const where = collapse(m) === 'point' ? 'a single point, the origin' : 'a line';
    return <>{lands} det = 0: the whole plane collapses onto {where}. Many points now land on the same spot, so nothing can undo it: <span className="hl bad">no inverse</span>.</>;
  }
  if (d < 0) {
    return <>{lands} det = {sig(d)}: areas scale by {sig(Math.abs(d))}, and the minus sign means the plane was <span className="hl orange">flipped</span>: the F is mirrored.</>;
  }
  const area = Math.abs(d - 1) < 1e-9 ? <>areas are unchanged</> : <>every area is scaled by {sig(d)}</>;
  return <>{lands} det = {sig(d)}: {area}, and the F still reads the right way round.</>;
}

export interface ComposeFrame extends Frame {
  /** How many of the two transforms have been applied so far (0, 1 or 2). */
  stage: 0 | 1 | 2;
}

const label = (id: PresetId) => PRESETS[id].label.toLowerCase();

/** Three frames: both start from the same F, take one step, then the other. */
export function composeFrames(a: PresetId, b: PresetId): ComposeFrame[] {
  const ba = thenApply(PRESETS[a].m, PRESETS[b].m);
  const ab = thenApply(PRESETS[b].m, PRESETS[a].m);
  const same = sameMatrix(ba, ab);
  return [
    { stage: 0, say: <>Both sides start from the same F. Left: A ({label(a)}) first, then B ({label(b)}). Right: the other way round.</> },
    { stage: 1, say: <>Step 1: the left side applied A ({label(a)}); the right side applied B ({label(b)}).</> },
    {
      stage: 2,
      say: same
        ? <>Step 2: each applied the other one. B·A = A·B here: these two <span className="hl">commute</span>, so the order happens not to matter. That's the exception.</>
        : <>Step 2: each applied the other one. B·A ≠ A·B: the two F's <span className="hl">end up in different places</span>. Order matters, and matrix products read right to left.</>,
      hold: 2,
    },
  ];
}

/** The matrix each side has applied by a given stage. */
export function composeStageMatrix(first: PresetId, second: PresetId, stage: 0 | 1 | 2): M2 {
  if (stage === 0) return PRESETS.identity.m;
  if (stage === 1) return PRESETS[first].m;
  return thenApply(PRESETS[first].m, PRESETS[second].m);
}

export function homogeneousCaption(h: M3): ReactNode {
  const t: P2 = [h[0][2], h[1][2]];
  if (!movesOrigin(h)) {
    return <>No translation yet: the origin stays put, as it must under any 2×2. Slide tx or ty: the third column moves everything, origin included.</>;
  }
  return <>Translate by {pt(t, 1)}: that's the third column. The point (x, y) rides along as (x, y, 1), so the 1 picks up the shift, which no 2×2 can do (it always sends (0, 0) to (0, 0)).</>;
}
