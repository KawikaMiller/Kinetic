import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { unscopedAbsolutes } from '../../core/lessonContentT3';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { approxCaption, exactCaption, exploreCaption, f2, learnCaption, worldCaption, worldSummary } from './captions';
import { approxFacts, exactFacts, exploreFacts, learnFacts, learnSettings, worldFacts } from './facts';
import lesson from './index';
import { PRESET_IDS, runPreset } from './presets';
import { PINNED_FIXED_EPSILON, PINNED_RL_SEEDS } from './pinned';
import { EPSILON_FLOOR, epsilonAt, greedyReturn, train } from './qlearn';
import { measureFixedEpsilon, measureRlSeeds } from './seeds';
import { APPROX_DEFAULT, EXACT_DEFAULT, EXPLORE_DEFAULT, LEARN_DEFAULT, SMOOTH_WINDOW, WORLD_BRUSH } from './settings';
import { DEFAULT_WORLD, isDefaultWorld, paint, worldWarning } from './world';

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('reinforcement-learning')).toHaveLength(5);
    expect(sharedSceneComponents('reinforcement-learning')).toEqual([]);
    expect(sceneElements('reinforcement-learning').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(WORLD_BRUSH).toBe('wall');
    expect(LEARN_DEFAULT).toEqual({ alpha: 0.3, gamma: 0.97, epsilon: 1, decay: true, seed: 1, perPress: 100 });
    expect(EXACT_DEFAULT).toEqual({ episodes: 3000 });
    expect(EXPLORE_DEFAULT).toEqual({ preset: 'greedy' });
    expect(APPROX_DEFAULT).toEqual({ maze: false, updates: 5000 });
    expect(DEFAULT_WORLD).toMatchObject({ slip: 0.1, stepCost: 0.04, bonus: 0 });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: walls at row 4 column 1 and row 5 column 2 cut the start off from the goal', () => {
    expect(worldFacts().warning).toBeNull();
    const a = paint(DEFAULT_WORLD, 3, 0, 'wall');
    const b = a.ok ? paint(a.world, 4, 1, 'wall') : a;
    expect(b.ok && worldWarning(b.world)).toBe('Unreachable goal: the agent cannot learn it.');
    expect(b.ok && expectCaption(worldCaption(b.world))).toContain('Unreachable goal: the agent cannot learn it.');
    expect(lesson.tryThis[0]).toContain('row 4, column 1 and row 5, column 2');
  });

  it('try-this 2: after 100 episodes the greedy policy heads for the cookie, and after 1,000 it is optimal', () => {
    const f = learnFacts();
    expect(f.many.greedy).toBeGreaterThan(f.one.greedy + 0.1);
    expect(f.many.greedy).toBeCloseTo(f.optimal, 1);
    expect(f.one.greedy).toBeCloseTo(0.199, 2);
    expect(f.one.goalShare).toBeLessThan(0.2);
    expect(lesson.tryThis[1]).toContain(`is worth ${f.one.greedy.toFixed(2)}`);
    expect(lesson.tryThis[1]).toContain(`${f.many.greedy.toFixed(2)}`);
  });

  it('try-this 3: value iteration converges, and the gap to it shrinks from 100 to 3,000 episodes', () => {
    const f = exactFacts();
    expect(f.gapNow).toBeLessThan(f.gapEarly);
    expect(f.solved.residual).toBeLessThan(1e-9);
    expect(lesson.tryThis[2]).toContain(`${f.solved.iterations} sweeps`);
    expect(lesson.tryThis[2]).toContain(`best possible return from the start is ${f.optimal.toFixed(2)}`);
  });

  it('try-this 4: greedy ends at the cookie, gamma 0.5 also but optimally, gamma 0.99 at the goal, the reward edit loops', () => {
    const f = exploreFacts();
    expect(f.open.route.destination).toBe('cookie');
    expect(f.open.greedy).toBeLessThan(f.open.optimal);
    expect(f.runs.myopic.route.destination).toBe('cookie');
    expect(f.runs.myopic.greedy).toBeCloseTo(f.runs.myopic.optimal, 2);
    expect(f.runs.farsighted.route.destination).toBe('goal');
    expect(f.runs.bonus.route.destination).toBe('loop');
    expect(lesson.tryThis[3]).toContain('ends at the cookie after 2 steps');
  });

  it('try-this 5: the open grid is fitted and the maze is not, at 5,000 updates', () => {
    const f = approxFacts();
    expect(f.open.rmse).toBeLessThan(0.03);
    expect(f.maze.rmse).toBeGreaterThan(0.08);
    expect(lesson.tryThis[4]).toContain(`${f.open.rmse.toFixed(2)} on the open grid and ${f.maze.rmse.toFixed(2)} on the walled maze`);
  });
});

describe('captions follow the controls', () => {
  it('the learn caption names the episodes, epsilon and greedy return, with and without decay', () => {
    for (const decay of [true, false]) {
      for (const episodes of [0, 1, 10, 100]) {
        const set = learnSettings({ decay, epsilon: 0.5 });
        const t = train(DEFAULT_WORLD, set, episodes);
        const c = expectCaption(learnCaption(set, episodes, t, greedyReturn(DEFAULT_WORLD, set.gamma, t.Q), SMOOTH_WINDOW, DEFAULT_WORLD));
        if (episodes === 0) expect(c).toContain('Nothing learned yet');
        else expect(c).toContain(`After ${episodes === 1 ? '1 episode' : `${episodes} episodes`}`);
      }
    }
  });

  it('the exact caption asks for the computation until it is done, then prints the sweeps', () => {
    const f = exactFacts();
    expect(expectCaption(exactCaption(false, f.solved, 3000, f.gapNow, f.gapEarly, f.target.states.length))).toContain('Press Compute');
    expect(expectCaption(exactCaption(true, f.solved, 3000, f.gapNow, f.gapEarly, f.target.states.length))).toContain(`${f.solved.iterations} sweeps`);
  });

  it('the explore caption states the destination the greedy route reaches, for every preset', () => {
    for (const id of PRESET_IDS) {
      const run = runPreset(DEFAULT_WORLD, id);
      const c = expectCaption(exploreCaption(run));
      const word = { goal: 'ends at the goal', cookie: 'ends at the cookie', pit: 'ends at a pit', loop: 'loops (still moving after' }[run.route.destination];
      expect(c).toContain(word);
      expect(c.includes('maximises the reward as written')).toBe(run.preset.bonus && run.route.destination === 'loop');
    }
  });

  it('the approx caption says what the error is for each world and update count', () => {
    for (const maze of [false, true]) {
      expect(expectCaption(approxCaption(maze, 0, 0.5, 0.5))).toContain('weights are 0');
      expect(expectCaption(approxCaption(maze, 5000, 0.12, 0.5))).toContain(maze ? 'walled maze' : 'open grid');
    }
  });

  it('the world caption counts what is painted', () => {
    const r = paint(DEFAULT_WORLD, 2, 2, 'wall');
    expect(r.ok && expectCaption(worldCaption(r.world))).toContain('7 walls');
    expect(expectCaption(worldCaption({ ...DEFAULT_WORLD, slip: 0 }))).toContain('Every move goes where it points.');
    expect(expectCaption(worldCaption(DEFAULT_WORLD))).toContain('as intended 90% of the time and slips to each side 5%');
  });
});

describe('nothing hidden feeds a number', () => {
  const slippery = { ...DEFAULT_WORLD, slip: 0.3, stepCost: 0.1 };

  it('the exact scene trains with the learn scene\'s fixed settings, so the same episodes give the same table', () => {
    const f = exactFacts();
    const again = train(DEFAULT_WORLD, learnSettings(), EXACT_DEFAULT.episodes);
    expect(again.Q).toEqual(f.training.Q);
  });

  it('M6: the slip and step cost painted in "The world" change what Learn, Exact and Explore print, so their strip must name the world', () => {
    const base = learnFacts();
    const run = (w: typeof DEFAULT_WORLD) => greedyReturn(w, LEARN_DEFAULT.gamma, train(w, learnSettings(), 10 * LEARN_DEFAULT.perPress).Q);
    expect(run(slippery)).not.toBeCloseTo(base.many.greedy, 1);
    expect(runPreset(slippery, 'greedy').greedy).not.toBeCloseTo(runPreset(DEFAULT_WORLD, 'greedy').greedy, 1);
    expect(isDefaultWorld(DEFAULT_WORLD)).toBe(true);
    expect(isDefaultWorld(slippery)).toBe(false);
    expect(isDefaultWorld({ ...DEFAULT_WORLD, bonus: 0.2 })).toBe(false);
    const painted = paint(DEFAULT_WORLD, 2, 2, 'wall');
    expect(painted.ok && isDefaultWorld(painted.world)).toBe(false);
    expect(worldSummary(DEFAULT_WORLD)).toContain('the default (slip 10%, step cost 0.04, 6 walls');
    expect(worldSummary(slippery)).toContain('edited (slip 30%, step cost 0.10');
    for (const i of [1, 2, 3]) expect(lesson.tryThis[i]).toContain('Reset the world');
  });

  it('the approximation scene brings its own world, so a world edit never reaches it', () => {
    expect(approxFacts().maze.rmse).toBeGreaterThan(approxFacts().open.rmse);
  });
});

describe('epsilon (M5)', () => {
  it('epsilon 0 with decay on is the fixed-0 run, not a 0.05 explorer', () => {
    const decayed = train(DEFAULT_WORLD, learnSettings({ epsilon: 0, decay: true }), 500);
    const fixed = train(DEFAULT_WORLD, learnSettings({ epsilon: 0, decay: false }), 500);
    expect(decayed.Q).toEqual(fixed.Q);
    expect(decayed.epsilonNow).toBe(0);
    expect(f2(epsilonAt(learnSettings({ epsilon: 0, decay: true }), 400))).toBe('0.00');
  });

  it('a decaying epsilon never rises, never exceeds its start and never drops below the floor unless it started below it', () => {
    for (const start of [0, 0.02, 0.05, 0.3, 1]) {
      let last = Infinity;
      for (let e = 0; e <= 6000; e += 100) {
        const v = epsilonAt(learnSettings({ epsilon: start, decay: true }), e);
        expect(v).toBeLessThanOrEqual(last);
        expect(v).toBeLessThanOrEqual(start);
        expect(v).toBeGreaterThanOrEqual(Math.min(start, EPSILON_FLOOR));
        last = v;
      }
    }
  });
});

describe('a policy that never ends (gamma 1, minor 2)', () => {
  it('reports minus infinity instead of an iteration-cap number, and a normal run stays finite', () => {
    const w = DEFAULT_WORLD;
    const t = train(w, learnSettings({ gamma: 1, alpha: 0.5, epsilon: 0.5, decay: false }), 1);
    expect(greedyReturn(w, 1, t.Q)).toBe(-Infinity);
    expect(f2(greedyReturn(w, 1, t.Q))).toBe('-infinity');
    const ok = train(w, learnSettings(), 1000);
    expect(Number.isFinite(greedyReturn(w, LEARN_DEFAULT.gamma, ok.Q))).toBe(true);
  });
});

describe('the measured claims (M4, M7), recomputed', () => {
  it('quiz 1: a fixed epsilon of 0.1, 0.3 or 0.5 ends at the cookie on at least 39 of 40 seeds and 0.7 reaches the goal on all', () => {
    for (const pinned of PINNED_FIXED_EPSILON) expect(measureFixedEpsilon(pinned.epsilon, pinned.seeds, pinned.episodes)).toEqual(pinned);
    for (const eps of [0.1, 0.3, 0.5]) {
      const row = PINNED_FIXED_EPSILON.find((f) => f.epsilon === eps)!;
      expect(row.cookie).toBeGreaterThanOrEqual(39);
      expect(row.goal).toBe(0);
    }
    expect(PINNED_FIXED_EPSILON.find((f) => f.epsilon === 0.7)!.goal).toBe(40);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).not.toMatch(/^Epsilon above 0/);
    expect(lesson.quiz[0].why).toContain('0.1, 0.3 or 0.5 still ends at the cookie');
  });

  it('M7: the printed figures equal a fresh 200-seed measurement, and the real rate is about nine in ten, not 19 of 20', () => {
    expect(measureRlSeeds(PINNED_RL_SEEDS.seeds, PINNED_RL_SEEDS.episodes)).toEqual(PINNED_RL_SEEDS);
    expect(PINNED_RL_SEEDS.nearOptimal / PINNED_RL_SEEDS.seeds).toBeGreaterThan(0.9);
    expect(PINNED_RL_SEEDS.sameOnRoute).toBeLessThan(PINNED_RL_SEEDS.nearOptimal);
  });

  it('the reward-edit caption says "no loop" when the bonus tile is walled off (computed, not typed)', () => {
    const walled = paint(DEFAULT_WORLD, 3, 0, 'wall');
    expect(walled.ok).toBe(true);
    if (!walled.ok) return;
    const run = runPreset(walled.world, 'bonus');
    expect(run.route.destination).not.toBe('loop');
    const c = expectCaption(exploreCaption(run));
    expect(c).toContain('did not trap the agent');
    expect(c).not.toContain('The loop is not a bug');
  });
});

describe('lesson content', () => {
  it('has five try-this entries, five questions, and passes the content lint', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(unscopedAbsolutes(lesson.keyIdeas.join(' '))).toEqual([]);
    for (const q of lesson.quiz) expect(unscopedAbsolutes(q.why), q.why).toEqual([]);
  });
});
