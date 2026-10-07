import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  COMPOSE_PRESETS, ENTRY_MAX, IDENTITY, PRESETS, UNIT_SQUARE, applyH, applyM, collapse, columns, cssMatches, cssMatrix,
  cssMatrixArgs, det2, gridSegments, homogeneous, inverse2, isSingular, movesOrigin, parseCssMatrix, parseEntry, sameMatrix,
  thenApply, type M2, type P2,
} from './model';

const close = (p: readonly number[], q: readonly number[], digits = 12) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i], digits));

/** Independent reference: signed polygon area by the shoelace formula (counter-clockwise = positive). */
function shoelace(pts: readonly P2[]): number {
  let s = 0;
  pts.forEach(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  });
  return s / 2;
}

const rnd = mulberry32(30);
const randomM = (): M2 => [[(rnd() - 0.5) * 6, (rnd() - 0.5) * 6], [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6]];

describe('applyM on the presets, against hand-worked results', () => {
  const h = Math.sqrt(3) / 2;
  const cases: [keyof typeof PRESETS, P2, P2][] = [
    ['rotate', [1, 0], [h, 0.5]],
    ['rotate', [0, 1], [-0.5, h]],
    ['rotate', [2, 2], [2 * h - 1, 1 + 2 * h]],
    ['scale', [1.5, -1], [3, -2]],
    ['stretch', [1, 1], [2, 1]],
    ['shear', [1, 1], [2, 1]],
    ['shear', [0, 2], [2, 2]],
    ['reflect', [1, 2], [-1, 2]],
    ['project', [3, 4], [3, 0]],
    ['singular', [1, 0], [1, 0.5]],
    ['singular', [0, 1], [2, 1]],
    ['singular', [2, -1], [0, 0]],
  ];
  it.each(cases)('%s sends %j to %j', (id, v, want) => close(applyM(PRESETS[id].m, v), want));

  it('the columns are where î and ĵ land', () => {
    for (const p of Object.values(PRESETS)) {
      const [i, j] = columns(p.m);
      close(i, applyM(p.m, [1, 0]));
      close(j, applyM(p.m, [0, 1]));
    }
  });
});

describe('the determinant', () => {
  it('equals the signed area of the transformed unit square (shoelace), on presets and 500 random matrices', () => {
    const all = [...Object.values(PRESETS).map((p) => p.m), ...Array.from({ length: 500 }, randomM)];
    for (const m of all) {
      expect(det2(m)).toBeCloseTo(shoelace(UNIT_SQUARE.map((p) => applyM(m, p))), 12);
    }
  });

  it('scales every area by det: the F’s area too, sign and all', () => {
    const F = [[0.2, 0.2], [0.55, 0.2], [0.55, 1], [1.05, 1], [1.05, 1.3], [0.55, 1.3], [0.55, 1.7], [1.25, 1.7], [1.25, 2], [0.2, 2]] as P2[];
    for (let i = 0; i < 100; i++) {
      const m = randomM();
      expect(shoelace(F.map((p) => applyM(m, p)))).toBeCloseTo(det2(m) * shoelace(F), 10);
    }
  });

  it('is 1 for rotate and shear, 4 for scale ×2, −1 for reflect (a flip), 0 for the two collapsing presets', () => {
    expect(det2(PRESETS.rotate.m)).toBeCloseTo(1, 15);
    expect(det2(PRESETS.shear.m)).toBe(1);
    expect(det2(PRESETS.scale.m)).toBe(4);
    expect(det2(PRESETS.reflect.m)).toBe(-1);
    expect(det2(PRESETS.project.m)).toBe(0);
    expect(det2(PRESETS.singular.m)).toBe(0);
  });
});

describe('the inverse', () => {
  it('inverse(M)·M = I within 1e-12 for random non-singular M', () => {
    let checked = 0;
    for (let i = 0; i < 1000; i++) {
      const m = randomM();
      if (Math.abs(det2(m)) < 0.05) continue;
      const inv = inverse2(m)!;
      const prod = thenApply(m, inv); // m first, then inv: inv·m
      close(prod.flat(), IDENTITY.flat(), 12);
      checked++;
    }
    expect(checked).toBeGreaterThan(900);
  });

  it('is null for det = 0: the project and singular presets, a zero matrix, and proportional columns', () => {
    for (const m of [PRESETS.project.m, PRESETS.singular.m, [[0, 0], [0, 0]], [[1.5, -3], [-0.5, 1]], [[0.2, 0.6], [0.4, 1.2]]] as M2[]) {
      expect(isSingular(m)).toBe(true);
      expect(inverse2(m)).toBeNull();
    }
  });

  it('names what a singular matrix collapses the plane to', () => {
    expect(collapse(PRESETS.rotate.m)).toBe('none');
    expect(collapse(PRESETS.project.m)).toBe('line');
    expect(collapse(PRESETS.singular.m)).toBe('line');
    expect(collapse([[0, 0], [0, 0]])).toBe('point');
  });
});

describe('composition', () => {
  it('rotate-then-stretch is not stretch-then-rotate (A·B ≠ B·A on the compose default)', () => {
    const r = PRESETS.rotate.m;
    const s = PRESETS.stretch.m;
    const rotateThenStretch = thenApply(r, s); // S·R
    const stretchThenRotate = thenApply(s, r); // R·S
    expect(sameMatrix(rotateThenStretch, stretchThenRotate)).toBe(false);
    // Hand-worked S·R: the rotated x row doubles.
    close(rotateThenStretch.flat(), [Math.sqrt(3), -1, 0.5, Math.sqrt(3) / 2]);
    // A point really ends up in different places.
    // î really ends up in different places: (√3, 0.5) one way, (√3, 1) the other.
    close(applyM(rotateThenStretch, [1, 0]), [Math.sqrt(3), 0.5]);
    close(applyM(stretchThenRotate, [1, 0]), [Math.sqrt(3), 1]);
  });

  it('applying the product equals applying one matrix then the other, for random pairs', () => {
    for (let i = 0; i < 200; i++) {
      const a = randomM();
      const b = randomM();
      const p: P2 = [rnd() * 4 - 2, rnd() * 4 - 2];
      close(applyM(thenApply(a, b), p), applyM(b, applyM(a, p)), 10);
    }
  });

  it('uniform scaling commutes with every compose preset; stretch and reflect commute (both diagonal)', () => {
    for (const id of COMPOSE_PRESETS) {
      expect(sameMatrix(thenApply(PRESETS.scale.m, PRESETS[id].m), thenApply(PRESETS[id].m, PRESETS.scale.m))).toBe(true);
    }
    expect(sameMatrix(thenApply(PRESETS.stretch.m, PRESETS.reflect.m), thenApply(PRESETS.reflect.m, PRESETS.stretch.m))).toBe(true);
    expect(sameMatrix(thenApply(PRESETS.shear.m, PRESETS.rotate.m), thenApply(PRESETS.rotate.m, PRESETS.shear.m))).toBe(false);
  });
});

describe('gridSegments', () => {
  it('maps each grid line’s ends through M (so a collapsing M squashes the grid onto a line)', () => {
    const segs = gridSegments(PRESETS.project.m);
    expect(segs).toHaveLength(18);
    expect(segs.every((s) => s.from[1] === 0 && s.to[1] === 0)).toBe(true);
  });
});

describe('parseEntry', () => {
  it.each([
    ['1.5', 1.5], ['-2', -2], ['−0.5', -0.5], [' 3 ', 3], ['.25', 0.25], ['0', 0], ['-0', 0], ['2.', 2], ['0.866', 0.866],
  ])('accepts %j as %d', (typed, value) => expect(parseEntry(typed)).toEqual({ ok: true, value }));

  it.each(['', '   ', 'abc', '1e400', '1e2', '+5', '1/2', '1,5', '1, 2', '<b>1</b>', '🙂', 'Infinity', 'NaN', '--1', '.', '-'])(
    'refuses %j with a sentence, never a silent 0',
    (typed) => {
      const r = parseEntry(typed);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    },
  );

  it('refuses out-of-range and absurdly long numbers instead of clamping or rounding them', () => {
    expect(parseEntry('3.01')).toEqual({ ok: false, error: `Keep it between −${ENTRY_MAX} and ${ENTRY_MAX}.` });
    expect(parseEntry('-1')).toEqual({ ok: true, value: -1 });
    expect(parseEntry('12345678901234567890123').ok).toBe(false);
    expect(parseEntry('0.000000000001').ok).toBe(false);
  });
});

describe('homogeneous 3×3', () => {
  it('translation, which no 2×2 can do, is a matrix product in 3×3', () => {
    const h = homogeneous(IDENTITY, [2, -1]);
    close(applyH(h, [0, 0]), [2, -1]);
    close(applyH(h, [1, 1]), [3, 0]);
    expect(movesOrigin(h)).toBe(true);
    // Every 2×2 keeps the origin fixed.
    for (let i = 0; i < 50; i++) close(applyM(randomM(), [0, 0]), [0, 0]);
    expect(movesOrigin(homogeneous(PRESETS.rotate.m, [0, 0]))).toBe(false);
  });

  it('rotate 30° then translate (2, 1): hand-worked', () => {
    const h = homogeneous(PRESETS.rotate.m, [2, 1]);
    close(applyH(h, [1, 0]), [2 + Math.sqrt(3) / 2, 1.5]);
    close(applyH(h, [0, 2]), [1, 1 + Math.sqrt(3)]);
  });

  it('writes CSS matrix(a, b, c, d, e, f) column by column, translation in px', () => {
    const h = homogeneous(PRESETS.rotate.m, [2, -1]);
    expect(cssMatrix(h)).toBe('matrix(0.866, 0.5, -0.5, 0.866, 48, -24)');
    expect(cssMatrix(homogeneous(PRESETS.shear.m, [0, 0]))).toBe('matrix(1, 0, 1, 1, 0, 0)');
    // CSS maps (x, y) → (a·x + c·y + e, b·x + d·y + f): the same point as applyH, in px.
    const [a, b, c, d, e, f] = cssMatrixArgs(h, 1);
    const p: P2 = [0.7, -1.3];
    close([a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f], applyH(h, p));
  });

  it('CSS rotate(30deg) is the same six numbers as our rotate-30° matrix', () => {
    const t = Math.PI / 6;
    close(cssMatrixArgs(homogeneous(PRESETS.rotate.m, [0, 0])), [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]);
  });

  it('parses the browser’s computed matrix string and compares it with ours', () => {
    const ours = cssMatrixArgs(homogeneous(PRESETS.rotate.m, [2, -1]));
    expect(cssMatches(ours, parseCssMatrix('matrix(0.866025, 0.5, -0.5, 0.866025, 48, -24)'))).toBe(true);
    expect(cssMatches(ours, parseCssMatrix('matrix(1, 0, 0, 1, 48, -24)'))).toBe(false);
    expect(parseCssMatrix('none')).toBeNull();
    expect(parseCssMatrix('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)')).toBeNull();
  });
});
