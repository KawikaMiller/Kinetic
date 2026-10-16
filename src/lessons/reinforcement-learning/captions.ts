/** Captions: every number from the model on screen. Plain strings, so tests can read them. */
import { plural } from '../../core/format';
import type { Destination, PresetRun } from './presets';
import { epsilonAt, type QSettings, type Training } from './qlearn';
import type { Solved } from './mdp';
import { cellAt, isDefaultWorld, isTerminal, worldWarning, type World } from './world';

export const f2 = (v: number) => (v === -Infinity ? '-infinity' : v.toFixed(2));
export const pctOf = (v: number) => `${Math.round(v * 100)}%`;

const count = (w: World, ch: string) => w.rows.reduce((n, row) => n + [...row].filter((c) => c === ch).length, 0);

export function worldCaption(w: World): string {
  const slip = Math.round(w.slip * 100);
  const move = slip === 0 ? 'Every move goes where it points.' : `A move goes as intended ${100 - slip}% of the time and slips to each side ${slip / 2}%.`;
  const warn = worldWarning(w);
  return `${plural(count(w, '#'), 'wall')}, ${plural(count(w, 'G'), 'goal')}, ${plural(count(w, 'P'), 'pit')}, ${plural(count(w, 'C'), 'cookie')}; each step costs ${w.stepCost.toFixed(2)}. ${move}${warn ? ` ${warn}` : ''}`;
}

/** One line saying whether the world painted in "The world" is the default, shown in every scene that trains in it. */
export function worldSummary(w: World): string {
  const walls = count(w, '#');
  const parts = `slip ${Math.round(w.slip * 100)}%, step cost ${w.stepCost.toFixed(2)}, ${plural(walls, 'wall')}, ${plural(count(w, 'G'), 'goal')}, ${plural(count(w, 'P'), 'pit')}, ${plural(count(w, 'C'), 'cookie')}`;
  return isDefaultWorld(w) ? `World from "The world": the default (${parts}).` : `World from "The world": edited (${parts}).`;
}

const END_CELL: Record<string, string> = { G: 'the goal', P: 'the pit', C: 'the cookie' };

function endText(t: Training, w: World): string {
  const last = t.lastEpisode.at(-1);
  return last && isTerminal(w, last.to) ? END_CELL[cellAt(w, last.to)] : 'the step cap';
}

export function learnCaption(set: QSettings, episodes: number, t: Training, greedy: number, window: number, w: World): string {
  if (episodes === 0) return 'Nothing learned yet: every Q-value is 0. Press Run to play episodes.';
  const tail = t.returns.slice(-window);
  const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
  const eps = epsilonAt(set, episodes);
  return `After ${plural(episodes, 'episode')} (epsilon now ${f2(eps)}): mean return of the last ${plural(tail.length, 'episode')} ${f2(mean)}, and following the greedy policy from the start is worth ${f2(greedy)} on average. The latest episode took ${plural(t.steps.at(-1)!, 'step')} and ended at ${endText(t, w)}.`;
}

export function exactCaption(computed: boolean, solved: Solved, episodes: number, gapNow: number, gapEarly: number, cells: number): string {
  if (!computed) return `Q-learning has played ${plural(episodes, 'episode')} without ever being told the transition probabilities. Press Compute to run value iteration, which needs them.`;
  return `Value iteration used the known model and converged in ${plural(solved.iterations, 'sweep')} (Bellman residual ${solved.residual.toExponential(1)}). After ${plural(episodes, 'episode')} Q-learning's largest gap to those values on the ${cells} cells the best policy visits is ${f2(gapNow)}, from ${f2(gapEarly)} after 100.`;
}

const DEST: Record<Destination, string> = { goal: 'the goal', cookie: 'the cookie', pit: 'a pit', loop: 'a loop' };

export function exploreCaption(r: PresetRun): string {
  const g = r.preset.settings.gamma;
  const head = `${r.preset.label} (alpha ${f2(r.preset.settings.alpha)}, gamma ${f2(g)}, epsilon ${f2(r.preset.settings.epsilon)}${r.preset.settings.decay ? ' decaying' : ' fixed'}, ${plural(r.preset.episodes, 'episode')}): ${r.route.destination === 'loop' ? `the greedy route loops (still moving after ${plural(r.route.steps, 'step')})` : `the greedy route ends at ${DEST[r.route.destination]} after ${plural(r.route.steps, 'step')}`} and is worth ${f2(r.greedy)}, against ${f2(r.optimal)} for the best policy on this reward.`;
  if (r.preset.bonus) {
    const verdict = r.route.destination === 'loop' ? 'The loop is not a bug in the learner: it maximises the reward as written' : 'The bonus tile did not trap the agent in this world, so there is no loop to explain';
    return `${head} ${verdict}, and ${pctOf(r.goalShare)} of the last 100 episodes reached the goal.`;
  }
  return `${head} ${pctOf(r.goalShare)} of the last 100 episodes reached the goal.`;
}

export function approxCaption(maze: boolean, updates: number, rmse: number, baseline: number): string {
  if (updates === 0) return 'Before any update the weights are 0, so every state is valued at 0.';
  return `After ${updates.toLocaleString('en-US')} TD updates on the ${maze ? 'walled maze' : 'open grid'} the straight-line value function is off by ${f2(rmse)} RMS, from ${f2(baseline)} with weights at 0: ${maze ? 'distance along the corridor is not a straight line in (x, y)' : 'value falls smoothly with distance, which a plane can follow'}.`;
}
