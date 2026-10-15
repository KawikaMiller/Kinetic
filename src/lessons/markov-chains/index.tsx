import { pctText } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { PRESETS, WALK_MAX, WALK_SEED, WEATHER, distributionAt, pointMass, secondEigenvalues, setEntry, stationarySolve, tvSeries, visitFractions, walk, FORGET_STEPS } from './model';
import { Stage } from './Stage';
import { DEFAULT_CORPUS, buildChain, generateSentences, inCorpus, nextWords, parseCorpus } from './textChain';
import { num3, prob } from './text';

const PI = stationarySolve(WEATHER)!;
const FRACTIONS = visitFractions(walk(WEATHER, 0, WALK_SEED, WALK_MAX), WALK_MAX, 3);
const EDITED_ROW = setEntry(WEATHER, 0, 0, 0.5)[0];
const LAMBDAS = secondEigenvalues(WEATHER);
if (LAMBDAS.kind !== 'real') throw new Error('the default weather chain has real second eigenvalues');
const RATIO_STEP = 10;
const SERIES = tvSeries(WEATHER, pointMass(3, 0), PI, FORGET_STEPS);
const RATIO = SERIES[RATIO_STEP] / SERIES[RATIO_STEP - 1];
const PERIODIC = PRESETS.find((p) => p.id === 'periodic')!;
const PERIODIC_AT_7 = distributionAt(PERIODIC.P, [1, 0], 7);
const PERIODIC_AT_8 = distributionAt(PERIODIC.P, [1, 0], 8);
const CHAIN = (() => {
  const parsed = parseCorpus(DEFAULT_CORPUS);
  if (!parsed.ok) throw new Error('the default corpus must parse');
  return buildChain(parsed.value);
})();
const TOP_WORD = CHAIN.words[0];
const AFTER_TOP = nextWords(CHAIN, TOP_WORD);
const SEED_THREE = generateSentences(CHAIN, 3);
const NEW_OF_FIVE = SEED_THREE.filter((s) => !inCorpus(CHAIN, s)).length;
const STEPS_TO_HUNDREDTH = Math.ceil(Math.log(100) / -Math.log(LAMBDAS.slem));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A Markov chain hops between states using only the row of probabilities for the state it is on; if it is irreducible and aperiodic it settles to one stationary distribution, at a speed set by its second eigenvalue.',
    what: `A Markov chain has states and a matrix of transition probabilities, each row summing to 1. The next state depends only on the current one, not on how it got there. Run it long enough and the share of time in each state can settle: for the weather chain here Sunny gets ${pctText(PI[0])}, Cloudy ${pctText(PI[1])} and Rainy ${pctText(PI[2])}, whatever the start. That distribution π satisfies π P = π. Whether and how fast it settles depends on the matrix: three conditions (irreducible, aperiodic, finite) make it settle, and a periodic, absorbing or reducible chain breaks the story in three different ways.`,
    analogy: 'A board game where your next square depends only on the square you are on and the dice, not on the squares you passed. Play for a long time and you spend a steady share of turns on each square.',
    useCases: [
      'PageRank: a web surfer clicking random links is a Markov chain, and the rank is its stationary distribution',
      'Queueing and reliability models, where the state is the queue length or whether a machine is up',
      'Text and music generators that choose the next token from the current one (a toy form of what larger language models do much better)',
      'Sampling methods that build a chain whose stationary distribution is the distribution you want (named, not shown)',
    ],
    why: 'Many systems are "what happens next depends on where it is now" models, and a Markov chain turns that into questions you can compute: where does it spend its time, how long until the start stops mattering, and when does it never settle. The conditions that make a chain settle are the same ones to check before trusting any long-run average.',
    watch: 'Yellow marks the state the token is on, and its last hop is a yellow arrow. Every arrow is as thick as its probability and carries the number. Blue bars are the share of time in each state, and they turn green when they are within 0.01 of the violet stationary line. In How fast it forgets the red curve is the distance to π (the cost of not having converged) and the dashed violet one is the guide from the second eigenvalue. In When it never settles an orange verdict is a different kind of failure from an error, dim bars are states the start cannot reach, and a green tick is a condition that holds.',
  },
  tryThis: [
    `In A weather chain press Run 100,000 steps: the bars land within 0.01 of the violet lines, at ${FRACTIONS.map((f) => pctText(f)).join(', ')} against π of ${PI.map((p) => pctText(p)).join(', ')} (seed ${WALK_SEED}).`,
    `In A weather chain set Sunny → Sunny to 0.5 with its slider: the other two entries rescale to ${prob(EDITED_ROW[1])} and ${prob(EDITED_ROW[2])}, and the row still sums to 1.`,
    `In How fast it forgets slide t to ${RATIO_STEP}: the measured ratio reads ${num3(RATIO)}, close to the guide ${num3(LAMBDAS.slem)} from the second eigenvalue.`,
    `In When it never settles the periodic chain starts on A: at t = 7 the bars read A ${prob(PERIODIC_AT_7[0])}, B ${prob(PERIODIC_AT_7[1])}, and at t = 8 they swap to A ${prob(PERIODIC_AT_8[0])}, B ${prob(PERIODIC_AT_8[1])}.`,
    `In A text chain the most common word is ${TOP_WORD} and the table shows what follows it (${AFTER_TOP.slice(0, 3).map((r) => `${r.word} ${pctText(r.probability)}`).join(', ')}); with seed 3, ${NEW_OF_FIVE} of the 5 sentences are new.`,
  ],
  keyIdeas: [
    'In a Markov chain the next state depends on just the current state: the transition matrix row for where it is now, with nothing from earlier steps.',
    'A stationary distribution satisfies π P = π; a finite chain that is irreducible and aperiodic settles to it from any start.',
    `The distance to π shrinks by about the second-largest eigenvalue modulus each step: ${num3(LAMBDAS.slem)} for the default weather chain.`,
    'A periodic chain flips forever, an absorbing state collects the mass, and a chain with two closed classes has a stationary distribution that depends on the start.',
  ],
  quiz: [
    {
      q: 'A chain alternates A to B to A to B with probability 1 each step, starting on A. What do the bars look like after a million steps?',
      options: [
        'They flip: all the mass is on A after an even number of steps and on B after an odd number',
        'They settle at 50% and 50%, the stationary distribution, once enough steps have gone by',
        'They settle on A, the start state, because a chain remembers exactly where it began',
        'They settle after about 1 ÷ |λ₂| steps, the same speed as any other chain does',
      ],
      answer: 0,
      why: 'The stationary distribution (0.5, 0.5) exists, because π P = π holds, but the chain is periodic with period 2, so the distribution at step t depends on whether t is even. Settling needs aperiodicity as well. After a million steps, an even number, the mass is back on A.',
    },
    {
      q: 'A text chain is on the word "the". Does the next word depend on the earlier words, such as "sat on"?',
      options: [
        'No: it is drawn from the row for "the", the same whatever words came before',
        'Yes: a Markov chain keeps the full history and weights recent words more heavily',
        'Yes, but only when the earlier words were also states of the chain',
        'No: it is drawn at random from all the words, ignoring the current one',
      ],
      answer: 0,
      why: 'The Markov property is exactly that the row for the current state is what matters. Two different histories that end on "the" share one next-word distribution, which is why a first-order chain drifts and cannot hold a subject for long.',
    },
    {
      q: `A chain's distance to its stationary distribution shrinks by ${num3(LAMBDAS.slem)} each step. About how many steps cut that distance to one hundredth?`,
      options: [
        `About ${STEPS_TO_HUNDREDTH}: ${num3(LAMBDAS.slem)} raised to that power is near 0.01`,
        `About ${Math.round(100 * (1 - LAMBDAS.slem))}: one step per percent of the shrinking rate`,
        `About ${Math.round(100 / LAMBDAS.slem)}: the factor of 100 divided by the rate`,
        'About 2: two steps remove nearly all of any start',
      ],
      answer: 0,
      why: `The distance falls geometrically, so n steps leave ${num3(LAMBDAS.slem)}^n of it. Solving ${num3(LAMBDAS.slem)}^n = 0.01 gives n = ln 100 ÷ ln(1 ÷ ${num3(LAMBDAS.slem)}), about ${(Math.log(100) / -Math.log(LAMBDAS.slem)).toFixed(1)}, so ${STEPS_TO_HUNDREDTH} steps. The guide describes the tail of the curve, which is what the measured ratio approaches.`,
    },
    {
      q: 'A chain has two closed classes of states, so no state in one can reach a state in the other. What is true of its stationary distribution?',
      options: [
        'It is not unique: each class has its own, and where the mass ends depends on which class the chain starts in',
        'It is unique, because every finite chain has exactly one stationary distribution',
        'It does not exist, since a chain that cannot reach every state has no distribution with π P = π',
        'It is unique and spread evenly over all the states, whatever the matrix says',
      ],
      answer: 0,
      why: 'Each closed class on its own is a chain with its own stationary distribution, and any mix of them also satisfies π P = π. A start inside one class stays in it, so the long-run answer depends on the start. Uniqueness needs a single closed class, and a finite chain has at least one stationary distribution.',
    },
  ],
};

export default lesson;
