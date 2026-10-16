/** The numbers the try-this entries, captions and quiz explanations quote, each computed from the model. */
import { greedyPolicy, liveStates, valueIteration } from './mdp';
import { PRESETS, runPreset } from './presets';
import { gapTarget, greedyReturn, maxGap, recentGoalShare, train, type QSettings } from './qlearn';
import { APPROX_DEFAULT, EXACT_DEFAULT, EXPLORE_DEFAULT, LEARN_DEFAULT } from './settings';
import { MAZE_ROWS, OPEN_ROWS, approxWorld, trainTd } from './approx';
import { DEFAULT_WORLD, START_STATE, worldWarning } from './world';

export const learnSettings = (over: Partial<QSettings> = {}): QSettings => ({
  alpha: LEARN_DEFAULT.alpha, gamma: LEARN_DEFAULT.gamma, epsilon: LEARN_DEFAULT.epsilon, decay: LEARN_DEFAULT.decay, seed: LEARN_DEFAULT.seed, ...over,
});

export function worldFacts() {
  const solved = valueIteration(DEFAULT_WORLD, LEARN_DEFAULT.gamma);
  const policy = greedyPolicy(solved.Q);
  return { optimal: solved.V[START_STATE], startAction: policy[START_STATE], warning: worldWarning(DEFAULT_WORLD) };
}

export function learnFacts() {
  const solved = valueIteration(DEFAULT_WORLD, LEARN_DEFAULT.gamma);
  const at = (episodes: number) => {
    const t = train(DEFAULT_WORLD, learnSettings(), episodes);
    return { training: t, greedy: greedyReturn(DEFAULT_WORLD, LEARN_DEFAULT.gamma, t.Q), goalShare: recentGoalShare(t) };
  };
  return { optimal: solved.V[START_STATE], one: at(LEARN_DEFAULT.perPress), many: at(10 * LEARN_DEFAULT.perPress) };
}

export function exactFacts() {
  const solved = valueIteration(DEFAULT_WORLD, LEARN_DEFAULT.gamma);
  const t = train(DEFAULT_WORLD, learnSettings(), EXACT_DEFAULT.episodes, gapTarget(DEFAULT_WORLD, solved));
  const early = train(DEFAULT_WORLD, learnSettings(), 100, gapTarget(DEFAULT_WORLD, solved));
  const target = gapTarget(DEFAULT_WORLD, solved);
  return { optimal: solved.V[START_STATE], solved, target, gapAll: maxGap(t.Q, solved.V, liveStates(DEFAULT_WORLD)), training: t, gapNow: t.gap.at(-1)!, gapEarly: early.gap.at(-1)!, greedy: greedyReturn(DEFAULT_WORLD, LEARN_DEFAULT.gamma, t.Q) };
}

export function exploreFacts() {
  const runs = Object.fromEntries((Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((id) => [id, runPreset(DEFAULT_WORLD, id)])) as Record<keyof typeof PRESETS, ReturnType<typeof runPreset>>;
  return { runs, open: runs[EXPLORE_DEFAULT.preset] };
}

export function approxFacts() {
  const open = trainTd(approxWorld(OPEN_ROWS), APPROX_DEFAULT.updates);
  const maze = trainTd(approxWorld(MAZE_ROWS), APPROX_DEFAULT.updates);
  return { open, maze };
}
