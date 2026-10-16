import { describe, expect, it } from 'vitest';
import { gradCheck, type Trainable } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import { MAZE_ROWS, OPEN_ROWS, approxWorld, createLinearValue, features, trainTd, type TdExample } from './approx';
import { MAX_POINTS, smooth, toPoints } from './curves';
import { greedyPolicy, liveStates, outcomes, policyValue, reachableUnder, valueIteration } from './mdp';
import { BROKEN_SEED, PRESETS, runPreset } from './presets';
import { gapTarget, greedyReturn, maxGap, recentGoalShare, sampleNext, train } from './qlearn';
import { COLS, DEFAULT_WORLD, ROWS, START_STATE, gammaRefusal, goalReachable, hasGoal, paint, stateOf, worldWarning, type World } from './world';

const GAMMA = 0.97;

/** An independent restatement of the dynamics, straight from the rules, to check the model's Bellman equation against. */
function bellmanResidual(w: World, V: readonly number[], gamma: number): number {
  const cell = (r: number, c: number) => w.rows[r][c];
  const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  let worst = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ('#GPC'.includes(cell(r, c))) continue;
      let best = -Infinity;
      for (let a = 0; a < 4; a++) {
        let q = 0;
        for (const [d, p] of [[a, 1 - w.slip], [(a + 1) % 4, w.slip / 2], [(a + 3) % 4, w.slip / 2]] as const) {
          let nr = r + dirs[d][0];
          let nc = c + dirs[d][1];
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || cell(nr, nc) === '#') {
            nr = r;
            nc = c;
          }
          const arrival = (nr !== r || nc !== c) ? { G: 1, P: -1, C: 0.3 }[cell(nr, nc) as 'G' | 'P' | 'C'] ?? 0 : 0;
          const terminal = 'GPC'.includes(cell(nr, nc));
          q += p * (-w.stepCost + arrival + (terminal ? 0 : gamma * V[nr * COLS + nc]));
        }
        best = Math.max(best, q);
      }
      worst = Math.max(worst, Math.abs(V[r * COLS + c] - best));
    }
  }
  return worst;
}

describe('the world', () => {
  it('refuses to paint the start or outside the grid and leaves the old world', () => {
    expect(paint(DEFAULT_WORLD, 4, 0, 'wall')).toMatchObject({ ok: false });
    expect(paint(DEFAULT_WORLD, 5, 0, 'wall')).toMatchObject({ ok: false });
    expect(paint(DEFAULT_WORLD, 0, -1, 'wall')).toMatchObject({ ok: false });
    const r = paint(DEFAULT_WORLD, 2, 2, 'wall');
    expect(r.ok && r.world.rows[2]).toBe('..#...');
    expect(DEFAULT_WORLD.rows[2]).toBe('......');
  });

  it('flags an unreachable goal and a missing goal in plain words, and the default world is fine', () => {
    expect(worldWarning(DEFAULT_WORLD)).toBeNull();
    const a = paint(DEFAULT_WORLD, 3, 0, 'wall');
    const b = a.ok ? paint(a.world, 4, 1, 'wall') : a;
    expect(b.ok && goalReachable(b.world)).toBe(false);
    expect(b.ok && worldWarning(b.world)).toBe('Unreachable goal: the agent cannot learn it.');
    const noGoal = paint(DEFAULT_WORLD, 0, 5, 'erase');
    expect(noGoal.ok && hasGoal(noGoal.world)).toBe(false);
    expect(noGoal.ok && worldWarning(noGoal.world)).toContain('No goal');
  });

  it('a cookie on the only corridor blocks the goal, because the cookie ends the episode', () => {
    const blocked = paint(DEFAULT_WORLD, 3, 0, 'cookie');
    expect(blocked.ok && goalReachable(blocked.world)).toBe(false);
  });

  it('gamma 1 with no step cost is refused, anything else is accepted', () => {
    expect(gammaRefusal(1, 0)).toContain('not allowed');
    expect(gammaRefusal(1, 0.01)).toBeNull();
    expect(gammaRefusal(0.99, 0)).toBeNull();
  });
});

describe('the dynamics', () => {
  it('outcome probabilities sum to 1 in every cell for every action and slip', () => {
    for (const slip of [0, 0.1, 0.2, 0.3]) {
      const w = { ...DEFAULT_WORLD, slip };
      for (let s = 0; s < COLS * ROWS; s++) for (let a = 0; a < 4; a++) expect(outcomes(w, s, a).reduce((x, o) => x + o.p, 0)).toBeCloseTo(1, 12);
    }
  });

  it('sampled transitions match 80 / 10 / 10 within 0.01 over 100,000 steps at slip 20%', () => {
    const open = { ...DEFAULT_WORLD, rows: ['......', '......', '......', '......', '......'], slip: 0.2 };
    const rnd = mulberry32(5);
    const from = stateOf(2, 2);
    const counts = new Map<number, number>();
    for (let i = 0; i < 100000; i++) {
      const to = sampleNext(open, from, 0, rnd);
      counts.set(to, (counts.get(to) ?? 0) + 1);
    }
    expect((counts.get(stateOf(1, 2)) ?? 0) / 100000).toBeCloseTo(0.8, 2);
    expect((counts.get(stateOf(2, 3)) ?? 0) / 100000).toBeCloseTo(0.1, 2);
    expect((counts.get(stateOf(2, 1)) ?? 0) / 100000).toBeCloseTo(0.1, 2);
  });
});

describe('value iteration', () => {
  it('satisfies the Bellman optimality equation to 1e-9, checked by an independent restatement, for several worlds and gammas', () => {
    for (const slip of [0, 0.1, 0.3]) {
      for (const gamma of [0.5, 0.9, 0.97, 0.99]) {
        const w = { ...DEFAULT_WORLD, slip };
        const solved = valueIteration(w, gamma);
        expect(bellmanResidual(w, solved.V, gamma), `slip ${slip} gamma ${gamma}`).toBeLessThan(1e-9);
        expect(solved.residual).toBeLessThan(1e-9);
      }
    }
  });

  it('its greedy policy is worth exactly the optimal values', () => {
    const solved = valueIteration(DEFAULT_WORLD, GAMMA);
    const v = policyValue(DEFAULT_WORLD, GAMMA, greedyPolicy(solved.Q));
    for (let s = 0; s < solved.V.length; s++) expect(v[s]).toBeCloseTo(solved.V[s], 9);
  });

  it('prefers the cookie at gamma 0.5 and the goal at gamma 0.97', () => {
    const route = (g: number) => runPreset(DEFAULT_WORLD, g === 0.5 ? 'myopic' : 'farsighted').optimalRoute.destination;
    expect(route(0.5)).toBe('cookie');
    expect(route(0.99)).toBe('goal');
    const solved = valueIteration(DEFAULT_WORLD, GAMMA);
    expect(solved.V[START_STATE]).toBeGreaterThan(0.3);
  });
});

describe('Q-learning', () => {
  const solved = valueIteration(DEFAULT_WORLD, GAMMA);
  const optimal = solved.V[START_STATE];

  it('with a decaying epsilon reaches the optimal return (within 0.02) on at least 90% of 100 seeds in 3,000 episodes: the measured rate, not 19 of 20 on a lucky slice', () => {
    let reached = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const t = train(DEFAULT_WORLD, { alpha: 0.3, gamma: GAMMA, epsilon: 1, decay: true, seed }, 3000, gapTarget(DEFAULT_WORLD, solved));
      if (Math.abs(greedyReturn(DEFAULT_WORLD, GAMMA, t.Q) - optimal) < 0.02) reached++;
    }
    expect(reached).toBeGreaterThanOrEqual(90);
  });

  it('on a deterministic world its start value converges to Q* (within 0.02) and the gap shrinks', () => {
    const det = { ...DEFAULT_WORLD, slip: 0 };
    const exact = valueIteration(det, GAMMA);
    const t = train(det, { alpha: 0.5, gamma: GAMMA, epsilon: 1, decay: true, seed: 3 }, 6000, gapTarget(det, exact));
    expect(Math.abs(Math.max(...t.Q[START_STATE]) - exact.V[START_STATE])).toBeLessThan(0.02);
    expect(t.gap.at(-1)!).toBeLessThan(t.gap[0] + 1e-12);
    expect(greedyReturn(det, GAMMA, t.Q)).toBeCloseTo(exact.V[START_STATE], 2);
  });

  it('broken variant: epsilon 0 locks onto the cookie, on the named seed and on at least 38 of 40', () => {
    let stuck = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t = train(DEFAULT_WORLD, { alpha: 0.3, gamma: GAMMA, epsilon: 0, decay: false, seed }, 1000);
      if (greedyReturn(DEFAULT_WORLD, GAMMA, t.Q) < optimal - 0.02) stuck++;
    }
    expect(stuck).toBeGreaterThanOrEqual(38);
    const named = train(DEFAULT_WORLD, { alpha: 0.3, gamma: GAMMA, epsilon: 0, decay: false, seed: BROKEN_SEED }, 1000);
    expect(greedyReturn(DEFAULT_WORLD, GAMMA, named.Q)).toBeLessThan(optimal - 0.02);
    expect(recentGoalShare(named)).toBe(0);
  });

  it('measures the gap on the states the best policy visits, and cells it never visits keep a gap', () => {
    const states = reachableUnder(DEFAULT_WORLD, greedyPolicy(solved.Q));
    expect(states).toContain(START_STATE);
    expect(states.length).toBeLessThan(liveStates(DEFAULT_WORLD).length);
    const t = train(DEFAULT_WORLD, { alpha: 0.3, gamma: GAMMA, epsilon: 1, decay: true, seed: 1 }, 3000, { V: solved.V, states });
    expect(t.gap.at(-1)).toBe(maxGap(t.Q, solved.V, states));
    expect(t.gap.at(-1)!).toBeLessThan(0.1);
    expect(maxGap(t.Q, solved.V, liveStates(DEFAULT_WORLD))).toBeGreaterThan(0.3);
  });

  it('is the same run for the same settings, and a different run for a different seed', () => {
    const set = { alpha: 0.3, gamma: GAMMA, epsilon: 0.5, decay: true, seed: 2 };
    expect(train(DEFAULT_WORLD, set, 200).Q).toEqual(train(DEFAULT_WORLD, set, 200).Q);
    expect(train(DEFAULT_WORLD, { ...set, seed: 3 }, 200).Q).not.toEqual(train(DEFAULT_WORLD, set, 200).Q);
  });

  it('every episode ends at a terminal cell or at the 100-step cap', () => {
    const t = train(DEFAULT_WORLD, { alpha: 0.3, gamma: GAMMA, epsilon: 1, decay: false, seed: 4 }, 300);
    for (const s of t.steps) expect(s).toBeLessThanOrEqual(100);
    expect(t.returns).toHaveLength(300);
  });
});

describe('the presets', () => {
  it('each preset is judged against value iteration on its own reward, and the reward edit makes the loop the optimum', () => {
    const greedy = runPreset(DEFAULT_WORLD, 'greedy');
    expect(greedy.route.destination).toBe('cookie');
    expect(greedy.greedy).toBeLessThan(greedy.optimal - 0.1);
    const high = runPreset(DEFAULT_WORLD, 'highEps');
    expect(high.greedy).toBeCloseTo(high.optimal, 1);
    expect(high.training.returns.slice(-100).reduce((a, b) => a + b, 0) / 100).toBeLessThan(greedy.optimal - 0.5);
    const bonus = runPreset(DEFAULT_WORLD, 'bonus');
    expect(bonus.optimalRoute.destination).toBe('loop');
    expect(bonus.route.destination).toBe('loop');
    expect(bonus.optimal).toBeGreaterThan(runPreset(DEFAULT_WORLD, 'farsighted').optimal);
    expect(bonus.goalShare).toBe(0);
    expect(PRESETS.greedy.settings.epsilon).toBe(0);
  });
});

describe('the linear approximator', () => {
  it('is fitted by a Trainable whose gradient passes gradCheck, and a wrong gradient fails it', () => {
    const model = createLinearValue();
    model.params.splice(0, 3, 0.3, -0.2, 0.5);
    const batch: TdExample[] = [4, 9, 17, 22].map((s, i) => ({ x: features(s), y: 0.1 * (i + 1) }));
    expect(gradCheck(model, batch).maxRelError).toBeLessThan(1e-6);
    const wrong: Trainable<readonly TdExample[]> = { params: model.params, loss: model.loss, gradient: (b) => model.gradient(b).map((g) => g * 0.5) };
    expect(gradCheck(wrong, batch).maxRelError).toBeGreaterThan(1e-2);
  });

  it('error on the open grid falls below 0.02 and on the walled maze stays above 0.08', () => {
    const open = trainTd(approxWorld(OPEN_ROWS), 40000);
    const maze = trainTd(approxWorld(MAZE_ROWS), 40000);
    expect(open.rmse).toBeLessThan(0.02);
    expect(maze.rmse).toBeGreaterThan(0.08);
    expect(trainTd(approxWorld(OPEN_ROWS), 0).rmse).toBeGreaterThan(open.rmse);
    expect(trainTd(approxWorld(MAZE_ROWS), 0).weights).toEqual([0, 0, 0]);
  });
});

describe('curves', () => {
  it('a moving average matches a direct mean and a long series is thinned to its last point', () => {
    const xs = Array.from({ length: 50 }, (_, i) => (i * 7) % 11);
    const sm = smooth(xs, 5);
    for (let i = 4; i < 50; i++) expect(sm[i]).toBeCloseTo(xs.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5, 12);
    expect(sm[0]).toBe(xs[0]);
    const pts = toPoints(Array.from({ length: 20000 }, (_, i) => i));
    expect(pts.length).toBeLessThanOrEqual(MAX_POINTS + 1);
    expect(pts.at(-1)).toEqual([20000, 19999]);
  });
});
