import type { LessonModule } from '../../core/types';
import { f2, pctOf } from './captions';
import { FIXED_LOW_EPSILON, approxFacts, exactFacts, exploreFacts, learnFacts } from './facts';
import { stateCount } from './approx';
import { PINNED_FIXED_EPSILON, PINNED_RL_SEEDS } from './pinned';
import { LEARN_DEFAULT } from './settings';
import { Stage } from './Stage';
import { BONUS_REWARD } from './world';

const learn = learnFacts();
const exact = exactFacts();
const explore = exploreFacts();
const approx = approxFacts();
const n = (v: number) => v.toLocaleString('en-US');
const fixedAt = (epsilon: number) => PINNED_FIXED_EPSILON.find((f) => f.epsilon === epsilon)!;
const FROM_DEFAULT = '(from the default world: press Reset the world if the strip says edited)';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A reinforcement learner improves by trying actions and collecting rewards, updating a table of values after every step, and its results depend on how much it explores, how far ahead it looks and exactly what the reward pays for.',
    what: 'In a small grid world the agent learns Q(s, a), the value of each move in each cell, with Q-learning: after each step it nudges the value towards the reward plus the best value of where it landed. Epsilon-greedy play mixes the best known move with random ones. Because the world here is tiny and known, value iteration can compute the exact optimal values to check against, which also shows what Q-learning does without the model. A greedy agent can lock onto a small near reward, a discount factor decides how far ahead rewards count, and a careless reward gets exploited. A table does not scale to big worlds, which is where function approximation comes in.',
    analogy: 'Trying restaurants in a new city: always returning to the first decent place never finds the great one across town, yet trying a random place every night wastes most dinners.',
    useCases: [
      'Game-playing and control agents that learn from reward',
      'Choosing how much a system should explore versus exploit',
      'Reward design for training agents, and spotting reward hacking',
      'Understanding what a table, a model of the world and a function approximator each buy',
    ],
    why: 'Reward-driven training fails in characteristic ways: an agent that never explores, a horizon that is too short, a reward that pays for the wrong thing. Seeing each failure in a world small enough to solve exactly teaches how to diagnose them in a larger one.',
    watch:
      'The grid: the goal is green (+1), the pit red (-1), the cookie yellow (+0.3), walls grey, and a bonus tile in the reward edit has an amber outline; free cells wash green by how high their best Q-value is, and violet arrows are the greedy policy. A blue line is the latest episode and an orange segment is a random exploratory move. Curves: violet is return per episode, blue steps or the gap to the exact values.',
  },
  tryThis: [
    `In "The world", the start is row 5, column 1. Set Paint with to wall and click row 4, column 1 and row 5, column 2: the goal is walled off and the stage says "Unreachable goal: the agent cannot learn it." Press Reset the world.`,
    `In "Learn" ${FROM_DEFAULT}, press Run once (${n(LEARN_DEFAULT.perPress)} episodes): following the greedy policy from the start is worth ${f2(learn.one.greedy)}, because it heads for the cookie, and ${pctOf(learn.one.goalShare)} of the last 100 episodes reached the goal. Press Run nine more times (${n(10 * LEARN_DEFAULT.perPress)} episodes in all): ${f2(learn.many.greedy)} and ${pctOf(learn.many.goalShare)} reach the goal. Then switch Epsilon decay to Fixed and set Epsilon to ${f2(FIXED_LOW_EPSILON)}: the same ${n(10 * LEARN_DEFAULT.perPress)} episodes replay and the greedy return falls back to ${f2(learn.fixedLow.greedy)}, with ${pctOf(learn.fixedLow.goalShare)} reaching the goal. A little random play is not enough here. Switch decay back on and set Epsilon to 0: it stays 0, not the 0.05 floor.`,
    `In "The exact answer" ${FROM_DEFAULT}, press Compute the optimal values: value iteration converges in ${exact.solved.iterations} sweeps and the best possible return from the start is ${f2(exact.optimal)}. After ${n(exact.training.returns.length)} episodes Q-learning's largest gap to those values on the ${exact.target.states.length} cells the best policy visits is ${f2(exact.gapNow)}, from ${f2(exact.gapEarly)} after 100; over all cells it is ${f2(exact.gapAll)}, because cells off the best route are visited rarely. The note under the grids prints the measured rates over ${PINNED_RL_SEEDS.seeds} seeds and says why the two grids can show different arrows.`,
    `In "Exploration and discounting" ${FROM_DEFAULT}, Greedy from the start (epsilon 0) ends at ${explore.open.route.destination === 'cookie' ? 'the cookie' : 'the goal'} after ${explore.open.route.steps} steps and is worth ${f2(explore.open.greedy)}, against ${f2(explore.open.optimal)} for the best policy. Press Gamma 0.5: it also heads for the cookie, now correctly (${f2(explore.runs.myopic.greedy)} against ${f2(explore.runs.myopic.optimal)}). Press Gamma 0.99: it reaches the goal. Press the reward edit: it loops on the +${BONUS_REWARD} tile.`,
    `In "When a table cannot scale", a straight-line value function trained for ${n(5000)} TD updates is off by ${f2(approx.open.rmse)} on the open grid and ${f2(approx.maze.rmse)} on the walled maze, where distance along a corridor is not a function a plane can follow.`,
  ],
  keyIdeas: [
    `A greedy agent repeats the first good reward it finds, so in this world with epsilon 0 it heads for the near cookie and does not try the longer route to the goal; a small fixed epsilon does not rescue it (0.1 and 0.3 still end at the cookie on ${fixedAt(0.1).cookie} and ${fixedAt(0.3).cookie} of ${fixedAt(0.1).seeds} seeds), whereas starting near 1 and decaying does.`,
    'Q-learning learns values from sampled experience and does not need the model; value iteration needs the transition probabilities and rewards of the world, and gives the exact answer to check against.',
    'The discount factor sets the horizon: a low gamma makes a near small reward the optimal choice, a high one makes a far large reward worth the trip.',
    'An agent optimises the reward as written, so a bonus for stepping on a tile produces a loop that is optimal for that reward; a table also stops scaling as states multiply.',
  ],
  quiz: [
    {
      q: 'With epsilon 0 the agent keeps heading for the +0.3 cookie. Which setting lets it find the +1 goal nine moves away, and why does a little random play not do it?',
      options: [
        'Heavy exploration early, then decay: a little random play seldom chains nine moves to the goal',
        'A larger learning rate alone, since faster updates let the agent notice the distant goal before the cookie',
        'A lower step cost, because cheaper steps make the long route the only one that the agent can afford',
        'Nothing, since the cookie is the optimal choice whatever gamma and epsilon are in a world of this size',
      ],
      answer: 0,
      why: `At epsilon 0 the greedy route ends at the cookie after ${explore.open.route.steps} steps and is worth ${f2(explore.open.greedy)}, against ${f2(explore.open.optimal)} for the best policy at gamma ${f2(explore.open.preset.settings.gamma)}. A fixed epsilon of 0.1, 0.3 or 0.5 still ends at the cookie on ${fixedAt(0.1).cookie}, ${fixedAt(0.3).cookie} and ${fixedAt(0.5).cookie} of ${fixedAt(0.1).seeds} seeds after ${n(fixedAt(0.1).episodes)} episodes, while a fixed 0.7 reaches the goal on ${fixedAt(0.7).goal} of ${fixedAt(0.7).seeds}. Starting at 1 and decaying, the greedy return after ${n(10 * LEARN_DEFAULT.perPress)} episodes is ${f2(learn.many.greedy)}, against a best of ${f2(learn.optimal)}.`,
    },
    {
      q: 'What does value iteration need that Q-learning does without?',
      options: [
        'The model: every transition probability and reward, which it sweeps; Q-learning learns from experience',
        'A discount factor, because Q-learning is undiscounted and so never looks past the very next reward',
        'A random seed, since value iteration picks its actions at random and Q-learning follows a fixed rule',
        'Many episodes of play, because value iteration averages returns while Q-learning updates from one step',
      ],
      answer: 0,
      why: `Value iteration used the known model and converged in ${exact.solved.iterations} sweeps; Q-learning did not see the model and, after ${n(exact.training.returns.length)} episodes, was within ${f2(exact.gapNow)} of the same values on the cells the best policy visits.`,
    },
    {
      q: 'At gamma 0.5 the agent prefers the cookie two steps away to the goal nine steps away. Why?',
      options: [
        'A reward k steps away is worth gamma^k of its size, so at gamma 0.5 a distant goal is nearly worthless',
        'The cookie\'s reward is larger than the goal\'s at that gamma, so the agent takes the bigger one',
        'Gamma 0.5 makes half of all moves slip, which makes the long route to the goal too dangerous to learn',
        'Value iteration breaks below gamma 0.9, so the learner falls back on the nearest reward it can find',
      ],
      answer: 0,
      why: `Value iteration at gamma 0.5 values the start at ${f2(explore.runs.myopic.optimal)} by the cookie route (${explore.runs.myopic.optimalRoute.destination}); at gamma 0.99 it is ${f2(explore.runs.farsighted.optimal)} by the goal route (${explore.runs.farsighted.optimalRoute.destination}). The horizon decides which reward is worth the trip.`,
    },
    {
      q: `A reward edit pays +${BONUS_REWARD} each time the agent steps onto one tile, and it loops there. How is that best described?`,
      options: [
        'It is the best policy for the reward as written, so the reward needs fixing, not the learner',
        'A bug in Q-learning, which fails to converge whenever a reward can be collected more than once',
        'Too little exploration, since a higher epsilon would stop the agent from ever returning to the tile',
        'A sign that the discount factor is too high, because a lower gamma always removes loops of this kind',
      ],
      answer: 0,
      why: `On the edited reward value iteration's best route is itself ${explore.runs.bonus.optimalRoute.destination === 'loop' ? 'a loop' : 'not a loop'}, worth ${f2(explore.runs.bonus.optimal)}, and the learned greedy return matches it at ${f2(explore.runs.bonus.greedy)}. ${pctOf(explore.runs.bonus.goalShare)} of the last 100 episodes reached the goal.`,
    },
    {
      q: 'Why does a table of Q-values stop working for a 20 x 20 grid with a key and three doors?',
      options: [
        'It needs one entry per state, and states multiply with every flag the world carries, past what can be visited',
        'A table cannot store negative values, which the pit and the step cost both require in a larger grid, so it fails there',
        'Q-learning only works on grids smaller than ten cells on a side, because its updates are not stable',
        'The goal cannot be reached in a large grid, so the table never receives the reward it would learn from',
      ],
      answer: 0,
      why: `A state is the cell times 2 for each yes/no flag: ${n(stateCount(400, 0))} states for the plain 20 x 20 grid and ${n(stateCount(400, 4))} with a key and three doors, against ${n(stateCount(30, 0))} here. A function approximator replaces the table, but a straight line in (x, y) is off by ${f2(approx.maze.rmse)} on the walled maze against ${f2(approx.open.rmse)} on the open grid.`,
    },
  ],
};

export default lesson;
