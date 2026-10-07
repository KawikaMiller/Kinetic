import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { arrayFrames, listFrames } from './frames';
import { NULL_ID, rhoLayout } from './layout';
import { duplicateArray, findDuplicate, floyd, hashSetWalk, LAMBDA_MAX, meetSteps, MU_MAX, proof, rho } from './model';

const combos = Array.from({ length: MU_MAX + 1 }, (_, mu) => Array.from({ length: LAMBDA_MAX }, (_, l) => ({ mu, lambda: l + 1 }))).flat();

describe("Floyd's algorithm", () => {
  it('for every μ 0–8 and λ 1–10: meets within μ + λ slow steps, phase 2 returns μ, phase 3 returns λ', () => {
    for (const { mu, lambda } of combos) {
      const next = rho(mu, lambda);
      const run = floyd((i) => next[i]);
      expect(run.meet).not.toBeNull();
      expect(meetSteps(run)).toBeLessThanOrEqual(mu + lambda);
      expect(run.start).toBe(mu);
      expect(run.phase2.length - 1).toBe(mu);
      expect(run.loop).toHaveLength(lambda);
      const pr = proof(run, mu);
      expect(pr.holds).toBe(true);
      expect(pr.a).toBeLessThanOrEqual(lambda);
      expect(run.meet).toBe(mu + (pr.a % lambda));
      // The meeting point is the start exactly when μ is a multiple of λ.
      expect(run.meet === mu).toBe(mu % lambda === 0);
    }
  });

  it('says "no cycle" exactly when the list ends in null', () => {
    for (const { mu, lambda } of combos) {
      for (const loop of [true, false]) {
        const next = rho(mu, lambda, loop);
        expect(next.includes(null)).toBe(!loop);
        expect(floyd((i) => next[i]).meet === null).toBe(!loop);
      }
    }
  });

  it('finds a duplicate on 1,000 seeded arrays, checked against counting', () => {
    const rnd = mulberry32(41);
    for (let t = 0; t < 1000; t++) {
      const n = randInt(2, 40, rnd);
      // Half: the lesson's arrays (one duplicate). Half: any values 1 … n (maybe several repeats).
      const values = t % 2 === 0 ? duplicateArray(n, rnd).values : Array.from({ length: n + 1 }, () => randInt(1, n, rnd));
      const { dup } = findDuplicate(values);
      expect(values.filter((v) => v === dup).length).toBeGreaterThanOrEqual(2);
      expect(hashSetWalk(values).dup).toBe(dup);
      if (t % 2 === 0) {
        const counts = new Map<number, number>();
        values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
        expect([...counts].filter(([, c]) => c > 1).map(([v]) => v)).toEqual([dup]);
      }
    }
  });
});

describe('frames', () => {
  it('the proof overlay numbers come from the run, for every μ and λ', () => {
    for (const { mu, lambda } of combos) {
      const frames = listFrames(mu, lambda, true);
      const run = floyd((i) => rho(mu, lambda)[i]);
      const pr = proof(run, mu);
      const why = frames.find((f) => f.proof)!;
      const text = captionText(why.say);
      expect(text).toContain(`k = ${pr.k} steps, which is μ + a = ${mu} + ${pr.a}`);
      expect(text).toContain(`2k = ${2 * pr.k}`);
      expect(text).toContain(`${pr.laps} × λ = ${pr.laps} × ${lambda}`);
    }
  });

  it('captions stay true: meeting vs start, the closing gap, and the found μ and λ', () => {
    for (const { mu, lambda } of combos) {
      const frames = listFrames(mu, lambda, true);
      const texts = frames.map((f) => captionText(f.say));
      const meetText = texts.find((t) => t.startsWith('They meet at node'))!;
      expect(meetText.includes('meeting isn\'t the start')).toBe(mu % lambda !== 0);
      // The gap read out inside the loop drops by exactly one per step.
      const gaps = texts.flatMap((t) => [...t.matchAll(/Fast is (\d+) steps? behind/g)].map((m) => Number(m[1])));
      gaps.slice(1).forEach((g, i) => expect(g).toBe(gaps[i] - 1));
      expect(texts.at(-1)).toContain(`μ = ${mu} nodes, then a loop of λ = ${lambda}`);
      expect(frames.at(-1)!.start).toBe(mu);
      // Pointer step counters: fast took twice slow's steps in phase 1.
      const meetFrame = frames.find((f) => f.meet !== null)!;
      expect(meetFrame.fastSteps).toBe(2 * meetFrame.slowSteps);
    }
  });

  it('a list without a loop ends on "no cycle" with fast at null', () => {
    for (const { mu, lambda } of combos) {
      const frames = listFrames(mu, lambda, false);
      expect(captionText(frames.at(-1)!.say)).toMatch(/^No cycle/);
      expect(frames.at(-1)!.fast).toBeNull();
      expect(frames.some((f) => f.meet !== null)).toBe(false);
    }
  });

  it('the duplicate scene ends on the right value, with the counting check from the array', () => {
    const rnd = mulberry32(42);
    for (let t = 0; t < 100; t++) {
      const { values, dup } = duplicateArray(randInt(5, 12, rnd), rnd);
      const frames = arrayFrames(values);
      expect(frames.at(-1)!.start).toBe(dup);
      expect(captionText(frames.at(-1)!.say)).toContain(`Counting check: ${dup} appears 2 times`);
      expect(captionText(frames.at(-1)!.say)).toContain(`stores ${hashSetWalk(values).stored} indices`);
    }
  });
});

describe('rho layout', () => {
  it('never puts two nodes on top of each other', () => {
    for (const { mu, lambda } of combos) {
      for (const loop of [true, false]) {
        const { at, width, height } = rhoLayout(mu, lambda, loop);
        const pts = [...at.entries()];
        expect(pts).toHaveLength(mu + lambda + (loop ? 0 : 1));
        if (!loop) expect(at.has(NULL_ID)).toBe(true);
        for (let i = 0; i < pts.length; i++) {
          const [, p] = pts[i];
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(width);
          expect(p.y).toBeLessThan(height);
          for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(p.x - pts[j][1].x, p.y - pts[j][1].y)).toBeGreaterThanOrEqual(48);
        }
      }
    }
  });
});
