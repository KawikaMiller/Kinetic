/** Scene 4's presets: each is a full training run on the learner's world, judged against value iteration on the same world. */
import { greedyPolicy, valueIteration, type Solved } from './mdp';
import { gapTarget, greedyReturn, recentGoalShare, train, type QSettings, type Training } from './qlearn';
import { BONUS_CELL, BONUS_REWARD, START_STATE, STATES, stateOf, cellAt, isTerminal, type World } from './world';
import { move } from './mdp';

export type PresetId = 'greedy' | 'highEps' | 'myopic' | 'farsighted' | 'bonus';
export const PRESET_IDS: readonly PresetId[] = ['greedy', 'highEps', 'myopic', 'farsighted', 'bonus'];

export interface Preset {
  label: string;
  settings: QSettings;
  episodes: number;
  /** The reward-edit preset pays a bonus for stepping onto a tile. */
  bonus: boolean;
  /** One line of what the preset is. */
  note: string;
}

const BASE = { alpha: 0.3, gamma: 0.97, epsilon: 1, decay: true, seed: 1 } as const;
/** The seed on which the greedy-from-the-start agent locks onto the cookie (the lowest such seed; a test checks it). */
export const BROKEN_SEED = 1;

export const PRESETS: Record<PresetId, Preset> = {
  greedy: { label: 'Greedy from the start', settings: { ...BASE, epsilon: 0, decay: false, seed: BROKEN_SEED }, episodes: 1000, bonus: false, note: 'epsilon 0: it only ever repeats its best guess' },
  highEps: { label: 'Epsilon too high, forever', settings: { ...BASE, epsilon: 0.9, decay: false }, episodes: 1000, bonus: false, note: 'epsilon 0.9 and never decays: most moves are random' },
  myopic: { label: 'Gamma 0.5: myopic', settings: { ...BASE, gamma: 0.5 }, episodes: 3000, bonus: false, note: 'a reward is worth half as much each step away' },
  farsighted: { label: 'Gamma 0.99: far-sighted', settings: { ...BASE, gamma: 0.99 }, episodes: 3000, bonus: false, note: 'a distant reward is worth almost as much as a near one' },
  bonus: { label: `Reward edit: +${BONUS_REWARD} for a tile`, settings: { ...BASE }, episodes: 3000, bonus: true, note: `every step onto one tile pays ${BONUS_REWARD}: a reward written carelessly` },
};

export type Destination = 'goal' | 'cookie' | 'pit' | 'loop';

/** Follow the greedy action of every state with no slip, from the start, for at most STATES * 2 moves. */
export function greedyRoute(w: World, Q: readonly (readonly number[])[]): { destination: Destination; steps: number; bonusEntries: number } {
  const policy = greedyPolicy(Q);
  const bonusState = stateOf(BONUS_CELL[0], BONUS_CELL[1]);
  let s = START_STATE;
  let bonusEntries = 0;
  for (let steps = 0; steps < STATES * 2; steps++) {
    if (isTerminal(w, s)) {
      const c = cellAt(w, s);
      return { destination: c === 'G' ? 'goal' : c === 'C' ? 'cookie' : 'pit', steps, bonusEntries };
    }
    const next = move(w, s, policy[s]);
    if (next === bonusState && next !== s) bonusEntries++;
    s = next;
  }
  return { destination: 'loop', steps: STATES * 2, bonusEntries };
}

export interface PresetRun {
  preset: Preset;
  world: World;
  solved: Solved;
  training: Training;
  /** Exact expected return of the learned greedy policy from the start. */
  greedy: number;
  /** The best possible return from the start on this world. */
  optimal: number;
  goalShare: number;
  route: ReturnType<typeof greedyRoute>;
  optimalRoute: ReturnType<typeof greedyRoute>;
}

export function runPreset(base: World, id: PresetId): PresetRun {
  const preset = PRESETS[id];
  const world: World = { ...base, bonus: preset.bonus ? BONUS_REWARD : 0 };
  const solved = valueIteration(world, preset.settings.gamma);
  const training = train(world, preset.settings, preset.episodes, gapTarget(world, solved));
  return {
    preset, world, solved, training,
    greedy: greedyReturn(world, preset.settings.gamma, training.Q),
    optimal: solved.V[START_STATE],
    goalShare: recentGoalShare(training),
    route: greedyRoute(world, training.Q),
    optimalRoute: greedyRoute(world, solved.Q),
  };
}
