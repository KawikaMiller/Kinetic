import { describe, expect, it } from 'vitest';
import { eigen2x2, jacobiEigen } from '../../core/linalg';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { dot } from '../../core/vec';
import { ARROW_COUNT, DEFAULT_MATRIX, PRESETS as MATRICES, behaviourOf, cloud, eigenCoordinates, iterates, lineGap, rayleigh, residual, type Matrix2 } from './eigen';
import {
  MAX_PAGES, PRESETS, addLink, addPage, deadEndsOf, googleMatrix, linkMatrix, presetById, rankSolve, rankSteps, ringPositions, trapMass, trapsOf, type Web,
} from './pagerank';

const randomMatrix = (rnd: Rnd): Matrix2 => [[rnd() * 6 - 3, rnd() * 6 - 3], [rnd() * 6 - 3, rnd() * 6 - 3]];

function randomWeb(rnd: Rnd, deadEnds: boolean): Web {
  const n = randInt(2, 8, rnd);
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) if (a !== b && rnd() < 0.35) edges.push([a, b]);
    if (!deadEnds && !edges.some(([x]) => x === a)) edges.push([a, (a + 1) % n]);
  }
  return { names: Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)), at: ringPositions(n), edges };
}

describe('eigen2x2 against the definition', () => {
  it('A v = lambda v to 1e-9 on 1,000 seeded matrices with real eigenvalues, and complex and defective cases are flagged', () => {
    const rnd = mulberry32(1);
    let real = 0;
    let complex = 0;
    for (let t = 0; t < 2000; t++) {
      const A = randomMatrix(rnd);
      const e = eigen2x2(A);
      if (!e) continue;
      if (e.kind === 'real') {
        real++;
        e.values.forEach((lambda, i) => {
          const v = e.vectors[i];
          expect(Math.hypot(A[0][0] * v[0] + A[0][1] * v[1] - lambda * v[0], A[1][0] * v[0] + A[1][1] * v[1] - lambda * v[1])).toBeLessThan(1e-9);
        });
      } else complex++;
    }
    expect(real).toBeGreaterThan(1000);
    expect(complex).toBeGreaterThan(100);
    expect(behaviourOf(MATRICES.find((m) => m.id === 'rotation')!.A).kind).toBe('complex');
    expect(behaviourOf([[1, 1], [0, 1]]).kind).toBe('shear');
  });

  it('agrees with jacobiEigen on symmetric matrices', () => {
    const rnd = mulberry32(2);
    for (let t = 0; t < 500; t++) {
      const a = rnd() * 6 - 3;
      const b = rnd() * 6 - 3;
      const c = rnd() * 6 - 3;
      const e = eigen2x2([[a, b], [b, c]])!;
      const j = jacobiEigen([[a, b], [b, c]]);
      if (e.kind !== 'real') throw new Error('a symmetric matrix has real eigenvalues');
      expect([...e.values].sort((x, y) => y - x).map((x) => x.toFixed(9))).toEqual(j.values.map((x) => x.toFixed(9)));
    }
  });
});

describe('applying a matrix again and again', () => {
  it('for [[2, 1], [1, 2]] the ratio of the second to the first eigen-component is (1/3)^k times its start, to 1e-9', () => {
    const e1 = [Math.SQRT1_2, Math.SQRT1_2];
    const e2 = [Math.SQRT1_2, -Math.SQRT1_2];
    const rnd = mulberry32(5);
    for (let t = 0; t < 50; t++) {
      const start = [rnd() * 2 - 1, rnd() * 2 - 1];
      const steps = iterates(DEFAULT_MATRIX, start, 12);
      const c0 = eigenCoordinates(e1, e2, steps[0])!;
      steps.forEach((v, k) => {
        const c = eigenCoordinates(e1, e2, v)!;
        expect(c[1] / c[0]).toBeCloseTo((c0[1] / c0[0]) * (1 / 3) ** k, 9);
      });
    }
  });

  it('the residual is 0 on an eigenvector and positive elsewhere, and a zero vector or zero matrix gives 0 without NaN', () => {
    expect(residual(DEFAULT_MATRIX, [1, 1])).toBeLessThan(1e-12);
    expect(residual(DEFAULT_MATRIX, [1, -1])).toBeLessThan(1e-12);
    expect(residual(DEFAULT_MATRIX, [1, 0])).toBeGreaterThan(0.5);
    expect(rayleigh(DEFAULT_MATRIX, [1, 1])).toBeCloseTo(3, 12);
    expect(residual(DEFAULT_MATRIX, [0, 0])).toBe(0);
    expect(behaviourOf([[0, 0], [0, 0]]).kind).toBe('zero');
    const stuck = iterates([[0, 0], [0, 0]], [1, 0], 5);
    expect(stuck.flat().every(Number.isFinite)).toBe(true);
  });

  it('each kind of matrix behaves as named after 200 steps: converges to the dominant line, rotates, creeps (shear), does nothing, alternates', () => {
    const lines = (A: Matrix2, k: number) => cloud().map((s) => iterates(A, s, k)[k]);
    // converges
    const conv = lines(DEFAULT_MATRIX, 200);
    conv.forEach((v, i) => {
      if (i % 6 !== 3) expect(lineGap(v, [1, 1])).toBeLessThan(1e-6);
    });
    // rotation: direction keeps turning by 40 degrees each step
    const rot = MATRICES.find((m) => m.id === 'rotation')!.A;
    const b = iterates(rot, [1, 0], 201);
    expect(lineGap(b[201], b[200])).toBeCloseTo(40, 6);
    // shear: error shrinks like 1/k, not geometrically
    const shear: Matrix2 = [[1, 1], [0, 1]];
    const err = (k: number) => lineGap(iterates(shear, [0, 1], k)[k], [1, 0]);
    expect(err(100) / err(1000)).toBeGreaterThan(8);
    expect(err(100) / err(1000)).toBeLessThan(12);
    expect(err(1000)).toBeGreaterThan(1e-4);
    // equal stretch: nothing changes
    const eq = iterates([[2, 0], [0, 2]], [0.6, 0.8], 10);
    eq.forEach((v) => expect(v).toEqual(eq[0]));
    // flip: the arrow alternates, the same every second step
    const flip = iterates([[2, 0], [0, -2]], [0.6, 0.8], 10);
    flip[2].forEach((x, i) => expect(x).toBeCloseTo(flip[0][i], 12));
    expect(lineGap(flip[1], flip[0])).toBeGreaterThan(1);
    expect(behaviourOf([[2, 0], [0, -2]]).kind).toBe('ties');
    expect(behaviourOf([[2, 0], [0, 2]]).kind).toBe('all');
    expect(ARROW_COUNT).toBe(12);
  });
});

describe('PageRank', () => {
  it('the example A, B, C -> D, D -> A at d = 0.85 gives 0.4453, 0.0375, 0.0375, 0.4797, with B = C = (1 - d)/n exactly', () => {
    const w = presetById('example').web;
    const r = rankSolve(w, 0.85, 'spread')!;
    expect(r.map((x) => x.toFixed(4))).toEqual(['0.4453', '0.0375', '0.0375', '0.4797']);
    expect(r[1]).toBeCloseTo(0.15 / 4, 12);
    expect(r[2]).toBeCloseTo(0.15 / 4, 12);
    expect(r.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    const steps = rankSteps(w, 0.85, 'spread', 200);
    steps[200].r.forEach((x, i) => expect(x).toBeCloseTo(r[i], 12));
  });

  it('power iteration equals the direct solve on 1,000 seeded webs with no dead ends, and the dead-end-fixed solve on 1,000 with them', () => {
    const rnd = mulberry32(8);
    let withDead = 0;
    for (let t = 0; t < 2000; t++) {
      const dead = t >= 1000;
      const w = randomWeb(rnd, dead);
      if (dead && deadEndsOf(w).length > 0) withDead++;
      const d = 0.3 + 0.65 * rnd();
      const direct = rankSolve(w, d, 'spread')!;
      const iterated = rankSteps(w, d, 'spread', 400)[400].r;
      iterated.forEach((x, i) => expect(x).toBeCloseTo(direct[i], 9));
      expect(direct.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
      if (!dead) expect(rankSolve(w, d, 'drop')!.map((x, i) => x - direct[i]).every((x) => Math.abs(x) < 1e-12)).toBe(true);
    }
    expect(withDead).toBeGreaterThan(500);
  });

  it('the Google matrix has dominant eigenvalue 1: its fixed point satisfies G r = r to 1e-9', () => {
    const rnd = mulberry32(9);
    for (let t = 0; t < 300; t++) {
      const w = randomWeb(rnd, true);
      const d = 0.2 + 0.75 * rnd();
      const G = googleMatrix(w, d);
      const r = rankSolve(w, d, 'spread')!;
      const gr = G.map((row) => dot(row, r));
      gr.forEach((x, i) => expect(Math.abs(x - r[i])).toBeLessThan(1e-9));
      G[0].forEach((_, j) => expect(G.reduce((s, row) => s + row[j], 0)).toBeCloseTo(1, 12));
    }
  });

  it('the L1 change shrinks by at most d per step (the bound), on 500 seeded webs', () => {
    const rnd = mulberry32(10);
    for (let t = 0; t < 500; t++) {
      const w = randomWeb(rnd, t % 2 === 0);
      const d = 0.2 + 0.78 * rnd();
      const dead = t % 3 === 0 ? 'drop' : 'spread';
      const steps = rankSteps(w, d, dead, 40);
      for (let k = 2; k < steps.length; k++) expect(steps[k].change).toBeLessThanOrEqual(d * steps[k - 1].change + 1e-12);
    }
  });

  it('dropped dead ends: the total is below 1, and at d = 1 the chain a -> b -> c loses everything in 3 steps', () => {
    const chain = presetById('chain').web;
    const steps = rankSteps(chain, 1, 'drop', 5);
    expect(steps.map((s) => s.total.toFixed(4))).toEqual(['1.0000', '0.6667', '0.3333', '0.0000', '0.0000', '0.0000']);
    const dead = presetById('deadend').web;
    const kept = rankSteps(dead, 0.85, 'drop', 200)[200];
    expect(kept.total).toBeLessThan(1);
    kept.r.forEach((x, i) => expect(x).toBeCloseTo(rankSolve(dead, 0.85, 'drop')![i], 9));
    expect(rankSteps(dead, 0.85, 'spread', 200)[200].total).toBeCloseTo(1, 9);
    expect(rankSolve(chain, 1, 'spread')).toBeNull();
  });

  it('a spider trap swallows the rank at d = 1, and damping with spread restores a sensible ranking', () => {
    const trap = presetById('trap').web;
    expect(trapsOf(trap)).toEqual([[1, 2]]);
    const end = rankSteps(trap, 1, 'spread', 300)[300];
    expect(trapMass(trap, end.r)).toBeGreaterThan(0.999999);
    const damped = rankSteps(trap, 0.85, 'spread', 300)[300];
    expect(damped.total).toBeCloseTo(1, 9);
    expect(trapMass(trap, damped.r)).toBeLessThan(0.9);
    expect(damped.r[0]).toBeGreaterThan(0.15 / 4 - 1e-12);
  });

  it('rank flows, it is not a count: a page with one link from a high-rank page beats one with three links from low-rank pages', () => {
    // H and X link to each other; L1, L2, L3 each link to Y, and Y links to H.
    const w: Web = { names: ['H', 'X', 'Y', 'L1', 'L2', 'L3'], at: ringPositions(6), edges: [[0, 1], [1, 0], [3, 2], [4, 2], [5, 2], [2, 0]] };
    const r = rankSolve(w, 0.85, 'spread')!;
    expect(r[1]).toBeGreaterThan(r[2]);
    expect(w.edges.filter(([, b]) => b === 1)).toHaveLength(1);
    expect(w.edges.filter(([, b]) => b === 2)).toHaveLength(3);
  });

  it('the M matrix columns are stochastic (spread) or have a zero column (drop)', () => {
    for (const p of PRESETS) {
      const M = linkMatrix(p.web, 'spread');
      M[0].forEach((_, j) => expect(M.reduce((s, row) => s + row[j], 0)).toBeCloseTo(1, 12));
      const D = linkMatrix(p.web, 'drop');
      deadEndsOf(p.web).forEach((j) => expect(D.every((row) => row[j] === 0)).toBe(true));
    }
  });

  it('editing refuses self-links and duplicates, and stops at 8 pages', () => {
    const w = presetById('web6').web;
    expect(addLink(w, 1, 1)).toMatchObject({ ok: false });
    expect(addLink(w, 0, 1)).toMatchObject({ ok: false });
    const ok = addLink(w, 1, 0);
    expect(ok.ok).toBe(true);
    let grown: Web = w;
    for (let i = 0; i < 5; i++) {
      const r = addPage(grown);
      if (r.ok) grown = r.value;
    }
    expect(grown.names).toHaveLength(MAX_PAGES);
    expect(addPage(grown)).toMatchObject({ ok: false });
  });
});

describe('the preset webs are what their labels say', () => {
  it('the 6-page web has no dead end and no trap; the trap, dead-end and chain webs have theirs', () => {
    const web6 = presetById('web6').web;
    expect(deadEndsOf(web6)).toEqual([]);
    expect(trapsOf(web6)).toEqual([]);
    expect(deadEndsOf(presetById('deadend').web)).toEqual([5]);
    expect(deadEndsOf(presetById('chain').web)).toEqual([2]);
    expect(trapsOf(presetById('trap').web)).toEqual([[1, 2]]);
  });
});
