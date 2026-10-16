import { integer } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const [c1, c2, c3, c4, c5] = F.counts;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Random-looking output is not unpredictable output: a generator whose state can be inferred from what it has printed gives away everything that follows, so secrets come from a cryptographically secure source, and even that source needs a bias-free way to pick a number.',
    what: 'The lesson shows the structure that hides in plain-looking generators using only toy generators of its own: consecutive pairs of a small linear congruential generator fall on a few lines, and RANDU\'s triples fall on 15 planes that show as lines when turned to the right angle. A 16-bit toy then gives away its whole state after a handful of outputs, counted by a real brute-force pass. The seed is the next weak point, so you compare a clock with a system random value. You sort eight uses into the source each needs, and finish with the modulo bias of picking 0 to 5 with a remainder, and the rejection-sampling fix. Nothing here operates on Math.random, a real token or anyone\'s session id.',
    analogy: 'A shuffled-looking deck that is really a fixed shuffle of a numbered key: once you have seen enough cards you can work out which key was used, and then you know every card still to come.',
    useCases: [
      'Choosing how to generate a session id, reset token or API key',
      'Reviewing code that seeds a generator from the clock',
      'Picking a bounded random integer without favouring some values',
      'Deciding when a reproducible seeded generator is the right tool instead',
    ],
    why: 'Predictable tokens turn into account takeovers, and the bug never shows in a test because the output looks random. Knowing what each generator guarantees, and what a seed and a remainder can quietly give away, is how you pick the right call in the first place.',
    watch: 'Points of a toy generator are red (--bad) where its structure shows, and a generator whose lines are too fine to see is blue (--info); the real crypto.getRandomValues cloud is green (--ok). In the recovery scene the states still consistent with what was seen are blue and shrink to the one true state, yellow (--hi). A correct sort is green and a wrong one red. In the bias scene the outcomes that come up more often are orange (--orange) and the unbiased ones green.',
  },
  tryThis: [
    `Pairs, on the defaults (the toy, seed 0, ${F.pairCount} pairs): the pairs lie on ${F.toyLines} lines, against a bound of ${F.toyBound}. Pick "RANDU": seed 0 stays at 0, so every pair sits on one point. Type the seed 1: its ${F.pairCount} pairs lie on ${F.randuSeed1Lines} lines, too fine to see.`,
    `RANDU planes, on the defaults (${F.planeDefault} degrees): the points look like a cloud. Press "Go to the edge-on angle" (${F.edgeOn} degrees): they fall on lines, and the stat reads ${F.planesInSample} of ${F.planesTotal} planes used.`,
    `Recovering the state, on the defaults (hidden seed 12345): press "Reveal the next output" five times. The states still possible read ${integer(c1)}, ${integer(c2)}, ${integer(c3)}, ${integer(c4)} and ${integer(c5)}: with one left, the next 20 predictions match the real ones.`,
    `Where the seed comes from, on the defaults (whole seconds, a day): ${integer(F.daySeeds)} seeds, ${F.dayBits} bits. Pick milliseconds: ${F.msBits} bits. Pick the system value: ${F.systemBits} bits.`,
    `Modulo bias, on the defaults (n = 6): byte % 6 gives ${F.bias6} byte values to the six outcomes, because 256 = 42 x 6 + 4. Rejection sampling, discarding bytes at or above ${F.limit6}, gives ${F.rejected6} each. Slide n to 8: it divides 256, so there is no bias.`,
  ],
  keyIdeas: [
    `A generator whose state can be inferred from its outputs is not secret: in this toy ${integer(c1)} of ${integer(F.states)} states fit after one output, ${integer(c3)} after three, and ${c5} after five.`,
    `Structure hides in plain-looking output: the toy's pairs lie on ${F.toyLines} lines and RANDU's triples on ${F.planesTotal} planes, and a plot of consecutive values is a quick way to see it.`,
    `A secret is as unpredictable as its seed: a clock read in whole seconds for a day is ${integer(F.daySeeds)} seeds, ${F.dayBits} bits, against ${F.systemBits} bits from the system.`,
    `Picking 0 to 5 with byte % 6 favours some outcomes (${F.hit} byte values against ${F.miss}), and rejection sampling at ${F.limit6} makes them equal; the bias is zero exactly when n divides 256.`,
  ],
  quiz: [
    {
      q: 'An observer sees three outputs of a generator whose whole state is 16 bits, at 4 bits an output. How many states are still possible?',
      options: [
        'About 4,096 states, because each output removes only a small share of the states in the space',
        'Tens of states, since each 4-bit output cuts the count by about 16 times',
        'All 65,536 states, since the outputs say nothing about the state',
        'Exactly one, since three outputs always pin down a 16-bit state',
      ],
      answer: 1,
      why: `In this toy, with the default hidden seed, ${integer(c1)} states fit after one output, ${integer(c2)} after two and ${c3} after three, and ${c5} after five.`,
    },
    {
      q: 'Which source should generate a password-reset link?',
      options: [
        'Math.random with a long token, since length makes any generator unpredictable',
        'A seeded generator, so support staff can regenerate the same link on demand',
        'A cryptographically secure source, since a guessable link hands over the account',
        'Any generator at all, since the link expires soon and nobody will try it, so a guess would not matter',
      ],
      answer: 2,
      why: 'A reset link is a secret that grants access, so it has to be impossible for an attacker to predict the next one. The scene sorts it with the session id, the API key and the CBC IV.',
    },
    {
      q: 'Picking a number from 0 to 5 as byte % 6, which statement is true?',
      options: [
        'All six outcomes come up equally often, because six is a small number and the byte is uniform',
        'Outcomes 4 and 5 are favoured, because they are the last two outcomes in the range of six',
        'Outcomes 0 to 3 get 43 byte values, 4 and 5 get 42, and rejecting bytes of 252 or more fixes it',
        'The bias goes away if the byte is first hashed together with a secret seed value of any size',
      ],
      answer: 2,
      why: `256 = 42 x 6 + 4, so ${F.favoured6} outcomes get ${F.hit} byte values and the rest ${F.miss}; rejecting bytes at or above ${F.limit6} leaves ${F.rejected6} each.`,
    },
    {
      q: 'Why is a seed read from the clock in milliseconds a poor choice for a token generator?',
      options: [
        'The clock repeats every day, so two tokens a day apart would collide',
        'An observer who knows roughly when it was made has a small space to search',
        'Milliseconds are too long to fit in the generator\'s state, so the seed is cut',
        'The clock is public, and any generator seeded from public data has no seed',
      ],
      answer: 1,
      why: `A day of milliseconds is ${integer(F.daySeeds * 1000)} seeds, ${F.msBits} bits, which a computer searches at once; the system value is ${F.systemBits} bits.`,
    },
  ],
};

export default lesson;
