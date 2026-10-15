import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATRIX, MATRIX_STEP, PRESETS as MATRICES, RESIDUAL_TOLERANCE, SNAP_DEGREES, behaviourOf, eigenLines, residual, snapToEigenLine, type Matrix2,
} from './eigen';
import lesson from './index';
import { PRESETS, deadEndsOf, presetById, rankSteps, trapMass } from './pagerank';
import { SCENES, SCENE_SETUP, startMatrix } from './scenes';
import { DEAD_END_CONVENTIONS, rankCaption } from './text';

describe('switching scenes opens each scene on its own start', () => {
  it('scene 2 opens on the rotation (complex eigenvalues), scene 1 on the symmetric matrix, and the two web scenes on different webs', () => {
    const { apply, nothing, surfer, leaks } = SCENE_SETUP;
    if (apply.kind !== 'arrows' || nothing.kind !== 'arrows' || surfer.kind !== 'web' || leaks.kind !== 'web') throw new Error('unexpected scene kinds');
    expect(startMatrix(apply.mode)).toEqual(DEFAULT_MATRIX);
    expect(behaviourOf(startMatrix(apply.mode)).kind).toBe('converges');
    expect(behaviourOf(startMatrix(nothing.mode)).kind).toBe('complex');
    expect(surfer.initial).toBe('web6');
    expect(leaks.initial).toBe('chain');
    expect(surfer.presetIds).toContain(surfer.initial);
    expect(leaks.presetIds).toContain(leaks.initial);
  });

  it('every scene has a setup, and Stage mounts each one under its own key so state cannot carry across a switch', () => {
    expect(SCENES.map((s) => s.value).sort()).toEqual(Object.keys(SCENE_SETUP).sort());
    // The repo has no DOM renderer, so the key is pinned in source: without it React reuses ArrowScene / RankScene and keeps the old state.
    const stage = readFileSync(new URL('./Stage.tsx', import.meta.url), 'utf8');
    expect(stage.match(/key=\{scene\}/g)).toHaveLength(2);
  });
});

describe('the sliders show exactly what the matrix holds', () => {
  it('every preset entry sits on the 0.1 slider grid, so nudging one slider changes only that entry', () => {
    for (const p of MATRICES) p.A.forEach((row) => row.forEach((x) => expect(Math.abs(x * 10 - Math.round(x * 10))).toBeLessThan(1e-12)));
  });

  it('after nudging one slider of the rotation the displayed matrix is the one whose eigenvalues are reported', () => {
    const rot = MATRICES.find((m) => m.id === 'rotation')!.A;
    const nudged: Matrix2 = [[rot[0][0] + MATRIX_STEP, rot[0][1]], [rot[1][0], rot[1][1]]];
    // Displayed [[0.9, -0.6], [0.6, 0.8]]: trace 1.7, det 0.72 + 0.36 = 1.08, so lambda = 0.85 +- i sqrt(1.08 - 0.7225).
    const b = behaviourOf(nudged);
    if (b.kind !== 'complex') throw new Error('complex expected');
    expect(b.re).toBeCloseTo(0.85, 12);
    expect(Math.abs(b.im)).toBeCloseTo(Math.sqrt(1.08 - 0.7225), 12);
  });
});

describe('eigen-lines are drawn for every case that has one', () => {
  const parallel = (A: Matrix2, v: readonly number[]) => {
    const Av = [A[0][0] * v[0] + A[0][1] * v[1], A[1][0] * v[0] + A[1][1] * v[1]];
    return Math.abs(Av[0] * v[1] - Av[1] * v[0]);
  };

  it('the shear gets exactly one line, along x, and it is a real eigen-direction', () => {
    const shear = MATRICES.find((m) => m.id === 'shear')!.A;
    const lines = eigenLines(shear);
    expect(lines).toHaveLength(1);
    expect(Math.abs(lines[0].direction[1])).toBeLessThan(1e-12);
    expect(parallel(shear, lines[0].direction)).toBeLessThan(1e-12);
  });

  it('counts per preset: two for symmetric and flip, one for shear, none for rotation and equal stretch; every line is an eigen-direction', () => {
    const counts = Object.fromEntries(MATRICES.map((m) => [m.id, eigenLines(m.A).length]));
    expect(counts).toEqual({ symmetric: 2, rotation: 0, shear: 1, equal: 0, flip: 2 });
    for (const m of MATRICES) for (const l of eigenLines(m.A)) expect(parallel(m.A, l.direction)).toBeLessThan(1e-12);
  });

  it('a drop within the snap angle gives a residual below the tolerance, one outside does not, and a negative-side drop snaps to the negative side', () => {
    const lines = eigenLines(DEFAULT_MATRIX);
    const base = Math.atan2(lines[0].direction[1], lines[0].direction[0]);
    const at = (deg: number): [number, number] => [0.9 * Math.cos(base + (deg * Math.PI) / 180), 0.9 * Math.sin(base + (deg * Math.PI) / 180)];
    const near = snapToEigenLine(at(SNAP_DEGREES - 0.5), lines);
    expect(residual(DEFAULT_MATRIX, near)).toBeLessThan(RESIDUAL_TOLERANCE);
    expect(Math.hypot(near[0], near[1])).toBeCloseTo(0.9, 12);
    expect(residual(DEFAULT_MATRIX, snapToEigenLine(at(SNAP_DEGREES + 2), lines))).toBeGreaterThan(RESIDUAL_TOLERANCE);
    const backwards = snapToEigenLine([-0.5, -0.5001], lines);
    expect(residual(DEFAULT_MATRIX, backwards)).toBeLessThan(RESIDUAL_TOLERANCE);
    expect(backwards[0]).toBeLessThan(0);
  });
});

describe('the two dead-end conventions, by total rank', () => {
  const sum = (v: readonly number[]) => v.reduce((s, x) => s + x, 0);

  it('Spread conserves the total of 1 at every step, every web, every damping', () => {
    for (const p of PRESETS) {
      for (const d of [0, 0.3, 0.5, 0.85, 0.99, 1]) {
        for (const s of rankSteps(p.web, d, 'spread', 60)) expect(sum(s.r)).toBeCloseTo(1, 9);
      }
    }
  });

  it('Drop leaks at every d below 1 on a web with a dead end, by what the dead end received, and conserves 1 without one', () => {
    for (const id of ['deadend', 'chain'] as const) {
      const w = presetById(id).web;
      const dead = deadEndsOf(w);
      for (const d of [0.3, 0.5, 0.85, 0.99]) {
        const steps = rankSteps(w, d, 'drop', 30);
        steps.slice(1).forEach((s, t) => {
          expect(s.total).toBeLessThan(1 - 1e-6);
          // Independent oracle: the next total is d (total - rank held by dead ends) + (1 - d), the teleport adding (1 - d)/n to each of n pages.
          const held = sum(dead.map((i) => steps[t].r[i]));
          expect(s.total).toBeCloseTo(d * (steps[t].total - held) + (1 - d), 9);
        });
      }
    }
    for (const id of ['web6', 'example', 'trap'] as const) {
      for (const s of rankSteps(presetById(id).web, 0.85, 'drop', 30)) expect(s.total).toBeCloseTo(1, 9);
    }
  });

  it('the key idea names Spread as the one that restores 1, and the on-screen hint names both conventions and the standard one', () => {
    expect(lesson.keyIdeas[3]).toMatch(/spreading it uniformly/);
    expect(lesson.keyIdeas[3]).toMatch(/Dropping/);
    expect(DEAD_END_CONVENTIONS).toMatch(/Drop:.*Spread \(the standard treatment\)/);
  });

  it('a trap holds all the rank at d = 1; with no rank left the caption says so instead of naming a largest page', () => {
    const trap = presetById('trap').web;
    expect(trapMass(trap, rankSteps(trap, 1, 'spread', 200)[200].r)).toBeCloseTo(1, 9);
    const chain = presetById('chain').web;
    const gone = rankSteps(chain, 1, 'drop', 5);
    expect(rankCaption(chain, 1, 'drop', gone[4], 4)).toContain('no rank is left');
    expect(rankCaption(chain, 1, 'drop', gone[4], 4)).not.toContain('the largest');
    expect(rankCaption(chain, 1, 'drop', gone[1], 1)).toContain('the largest');
  });
});
