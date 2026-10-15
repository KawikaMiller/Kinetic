import { describe, expect, it } from 'vitest';
import { DEFAULT_MATRIX, PRESETS as MATRICES, behaviourOf, eigenCoordinates, iterates, stretchAt } from './eigen';
import lesson from './index';
import { MAX_ITERATIONS, PRESETS, rankSolve, rankSteps, presetById } from './pagerank';
import { arrowCaption, eigenvalueText, rankCaption, residualText } from './text';

const NO_JUNK = /NaN|undefined|null|Infinity|\[object/;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: after three applications the component ratio is 1/27 = 0.037 and the stretch is 2.8 (heading to 3)', () => {
    const e1 = [Math.SQRT1_2, Math.SQRT1_2];
    const e2 = [Math.SQRT1_2, -Math.SQRT1_2];
    const v = iterates(DEFAULT_MATRIX, [1, 0], 3)[3];
    const c = eigenCoordinates(e1, e2, v)!;
    expect(c[1] / c[0]).toBeCloseTo(1 / 27, 12);
    // Hand-worked: (1,0) -> (2,1) -> (5,4) -> (14,13): lengths sqrt(5), sqrt(41), sqrt(365); the last stretch is sqrt(365/41) = 2.984.
    expect(stretchAt(DEFAULT_MATRIX, [1, 0], 3)).toBeCloseTo(Math.sqrt(365 / 41), 12);
    expect(lesson.tryThis[0]).toContain('reads 0.037');
    expect(lesson.tryThis[0]).toContain(`stretch factor is ${Math.sqrt(365 / 41).toFixed(3)}`);
  });

  it('try-this 2: the rotation has eigenvalues cos 40° ± i sin 40° of modulus 1, and the caption says the arrows keep turning', () => {
    const b = behaviourOf(MATRICES.find((m) => m.id === 'rotation')!.A);
    expect(b.kind).toBe('complex');
    if (b.kind !== 'complex') return;
    expect(b.re).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 12);
    expect(Math.abs(b.im)).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 12);
    expect(b.modulus).toBeCloseTo(1, 12);
    expect(arrowCaption(b, 1)).toContain('keep turning');
    expect(lesson.tryThis[1]).toContain('0.766 ± 0.643i with modulus 1.000');
    expect(arrowCaption(behaviourOf([[1, 1], [0, 1]]), 0)).toContain('1/k');
  });

  it('try-this 3: the example gives 0.4453, 0.0375, 0.0375, 0.4797 and B, C sit at (1 - d)/4', () => {
    const r = rankSolve(presetById('example').web, 0.85, 'spread')!;
    expect(r.map((x) => x.toFixed(4))).toEqual(['0.4453', '0.0375', '0.0375', '0.4797']);
    expect(lesson.tryThis[2]).toContain('A 0.4453, B 0.0375, C 0.0375, D 0.4797');
    expect(lesson.tryThis[2]).toContain('(1 − 0.85) ÷ 4 = 0.0375');
  });

  it('try-this 4: dropping at d = 1 on the chain gives totals 1, 0.667, 0.333, 0, and the caption says the ranks no longer sum to 1', () => {
    const w = presetById('chain').web;
    const steps = rankSteps(w, 1, 'drop', 5);
    expect(steps.map((s) => s.total.toFixed(3))).toEqual(['1.000', '0.667', '0.333', '0.000', '0.000', '0.000']);
    expect(rankCaption(w, 1, 'drop', steps[1], 1)).toContain('not 1');
    expect(rankCaption(w, 1, 'drop', steps[1], 1)).toContain('drops the rank it receives');
    expect(lesson.tryThis[3]).toContain('1.000, 0.667, 0.333, 0.000');
  });
});

describe('every caption reads cleanly across the control space', () => {
  it('walks every web x damping x dead-end mode x step: no junk, and a leak is named only when the total is below 1', () => {
    let count = 0;
    for (const p of PRESETS) {
      for (const d of [0, 0.3, 0.85, 1]) {
        for (const dead of ['drop', 'spread'] as const) {
          const steps = rankSteps(p.web, d, dead, MAX_ITERATIONS);
          steps.forEach((s, i) => {
            const text = rankCaption(p.web, d, dead, s, i);
            expect(text).not.toMatch(NO_JUNK);
            expect(text.includes('not 1')).toBe(s.total < 1 - 1e-9);
            count++;
          });
        }
      }
    }
    expect(count).toBe(PRESETS.length * 4 * 2 * (MAX_ITERATIONS + 1));
  });

  it('every kind of matrix has a caption at every step, and the eigenvalue text is never junk', () => {
    const matrices = [...MATRICES.map((m) => m.A), [[0, 0], [0, 0]] as [[number, number], [number, number]], [[-2, 0], [0, 1]] as [[number, number], [number, number]]];
    for (const A of matrices) {
      const b = behaviourOf(A);
      for (const k of [0, 1, 7, 60]) expect(arrowCaption(b, k)).not.toMatch(NO_JUNK);
      expect(eigenvalueText(b)).not.toMatch(NO_JUNK);
    }
    expect(arrowCaption(behaviourOf([[-2, 0], [0, 1]]), 3)).toContain('flips');
    expect(residualText(0, 1e-6)).toContain('an eigenvector');
    expect(residualText(0.3, 1e-6)).toContain('not an eigenvector');
  });
});

describe('hidden controls feed nothing', () => {
  it('on a web without dead ends the dead-end switch changes no rank, so showing it in both web scenes is honest', () => {
    for (const id of ['web6', 'example', 'trap'] as const) {
      const w = presetById(id).web;
      for (const d of [0.2, 0.85, 1]) {
        const a = rankSteps(w, d, 'drop', 30);
        const b = rankSteps(w, d, 'spread', 30);
        a.forEach((s, i) => s.r.forEach((x, j) => expect(x).toBeCloseTo(b[i].r[j], 12)));
      }
    }
  });
});
