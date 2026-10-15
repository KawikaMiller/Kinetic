import type { LessonModule } from '../../core/types';
import { BELIEF_PRESETS, GENERATORS, TRUE_DIST, binaryEntropy, blockBitsPerFlip, entropy, excessBits, generatedBits, textEntropy } from './model';
import { ITEM_ENTROPY, OPTIMAL_QUESTIONS, ITEMS, evenByCount, expectedQuestions } from './questions';
import { Stage } from './Stage';

const bits = (x: number, dp = 3) => x.toFixed(dp);
const H_TENTH = binaryEntropy(0.1);
const BLOCK_FOUR = blockBitsPerFlip(0.1, 4);
const PASSWORD = textEntropy('password')!;
const MISSISSIPPI = textEntropy('mississippi')!;
const CHARS62 = generatedBits(GENERATORS[0].length, GENERATORS[0].alphabet);
const DICEWARE = generatedBits(GENERATORS[1].length, GENERATORS[1].alphabet);
const EVEN_COST = expectedQuestions(evenByCount(ITEMS.map((_, i) => i)))!;
const UNIFORM = BELIEF_PRESETS.find((b) => b.id === 'uniform')!.q;
const UNIFORM_EXTRA = excessBits(TRUE_DIST, UNIFORM);
const SURPRISE_HEADS = -Math.log2(0.1);
const SURPRISE_TAILS = -Math.log2(0.9);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Entropy is the average surprise of a source, in bits: it is how few yes/no answers per symbol the best possible code needs on average, and no code goes below it.',
    what: `A rare outcome is a big surprise (−log2 of its probability) and a common one is a small surprise. Entropy weights each outcome's surprise by how often it happens, giving the average number of bits per symbol. A fair coin has 1 bit; a coin that lands heads 10% of the time has ${bits(H_TENTH, 4)}. A code that gives common symbols short words and rare ones long words gets close to that figure, and no code averages less. Here the entropy is order 0: measured from one sample's own counts, treating each symbol as an independent draw.`,
    analogy: 'Twenty questions: if you know which items are likely, you ask first about the likely ones. The best strategy asks about as many questions on average as the entropy says, and a bad strategy wastes questions on unlikely splits.',
    useCases: [
      'Compression: entropy is the floor that symbol codes such as Huffman approach, and dictionary methods beat it by modelling repeats',
      'Machine learning: cross-entropy is the loss that trains classifiers, and the extra bits over the entropy are the KL divergence',
      'Choosing a decision tree split or a quiz question that splits the likely cases evenly',
      'Reasoning about passwords and keys: the strength of a generator is its entropy, which is not a number you can read off one string',
    ],
    why: 'Entropy turns "how predictable is this" into a number you can compute and compare. It tells you when a compression claim is impossible, why a good model of the data is worth more than a clever code, and why a password policy should talk about how a secret is generated rather than how it looks.',
    watch: 'Blue is probability: the p curve of a coin and the true distribution; the yellow dot, row and surprise figure are the one you are looking at. A violet line or figure is the entropy floor. Red is the cost side: bits above the floor, or extra bits from a wrong belief. In Twenty questions the expected number of questions turns green when your tree matches the best tree and orange when it is above it, with the gap written beside it. Sky blue is a belief q. The symbols in the table are blue bars of their share of the text.',
  },
  tryThis: [
    `In The biased coin press p = 0.10: the entropy reads ${bits(H_TENTH, 4)} bits per flip, and coding four flips at a time costs ${bits(BLOCK_FOUR, 4)} bits per flip, above that floor.`,
    `In Typed text press password: its order-0 entropy is ${bits(PASSWORD.bitsPerChar)} bits per character, ${bits(PASSWORD.totalBits, 2)} bits in all, against ${8 * PASSWORD.n} for plain ASCII. The default text, mississippi, is ${bits(MISSISSIPPI.bitsPerChar)} bits per character.`,
    `In Is it a password strength? press 4 words from a 7,776-word list: the strength reads ${bits(DICEWARE, 2)} bits, below the ${bits(CHARS62, 2)} bits of the default 12 letters and digits, though the words make a longer string.`,
    `In Twenty questions press Split by count: ${bits(EVEN_COST)} questions on average. Then press Show the best tree: ${bits(OPTIMAL_QUESTIONS)}, just above the entropy floor ${bits(ITEM_ENTROPY)}.`,
    `In A wrong belief press uniform: the extra bits read ${bits(UNIFORM_EXTRA)}. Press rules out z and the cost reads unbounded.`,
  ],
  keyIdeas: [
    "Surprise is −log2 of an outcome's probability, and entropy is the average surprise: the bits per symbol the best code needs on average.",
    'In this model no symbol code averages below the entropy; coding longer blocks only approaches it from above.',
    "Order-0 entropy of one sample treats characters as independent draws, and a password's strength is the entropy of how it was generated (L × log2 N for uniform draws), not a number computed from one string.",
    'Cross-entropy is the cost of coding for a wrong belief; the extra bits over the entropy are zero when the belief equals the truth and positive otherwise.',
  ],
  quiz: [
    {
      q: `The text password has an order-0 total of ${bits(PASSWORD.totalBits, 0)} bits. Does cracking it take about 2^${bits(PASSWORD.totalBits, 0)} guesses?`,
      options: [
        "No: those bits describe this string's letter mix, and a guesser tries common passwords before any uniform search",
        'Yes: 22 bits means 2^22 equally likely possibilities for the guesser to work through',
        'Yes, provided the attacker already knows that the password has exactly eight letters',
        'No: entropy counts the bytes stored, so the guesses needed come to 2^22 bytes of memory',
      ],
      answer: 0,
      why: `A figure computed from one sample describes that sample, not the process that produced it. A uniform draw of ${GENERATORS[0].length} characters from ${GENERATORS[0].alphabet} has ${bits(CHARS62, 2)} bits of strength because its outcomes were equally likely; a person's choice is guessed from lists and habits.`,
    },
    {
      q: `A source has entropy ${bits(H_TENTH, 3)} bits per symbol. A teammate says a cleverer symbol code will average 0.40 bits per symbol. What is wrong?`,
      options: [
        "Averaged over the source's own symbols, no code gets under the entropy; block codes approach it from above",
        'Nothing is wrong: coding longer and longer blocks keeps pushing the average below the entropy',
        'The claim fails because block codes work for a fair coin with p = 0.5 but break for biased coins',
        'Entropy bounds text compression but does not apply to a coin, so any average is allowed for it',
      ],
      answer: 0,
      why: `The Kraft inequality and Gibbs' inequality together give a floor under the expected code length. In the coin scene, blocks of four flips reach ${bits(BLOCK_FOUR, 4)} bits per flip and stay above ${bits(H_TENTH, 4)}, narrowing the gap as the blocks grow.`,
    },
    {
      q: 'A coin lands heads with p = 0.1. Which outcome carries the larger surprise, and what is the entropy?',
      options: [
        `Heads, ${bits(SURPRISE_HEADS, 2)} bits against ${bits(SURPRISE_TAILS, 2)} for tails; entropy ${bits(H_TENTH, 4)}, their weighted average`,
        `Tails, because it happens most often; the entropy is that larger surprise, ${bits(SURPRISE_TAILS, 2)} bits per flip`,
        'They carry equal surprise, and the entropy is 1 bit because a coin has two sides and so two outcomes',
        `Heads, ${bits(SURPRISE_HEADS, 2)} bits; the entropy is the plain sum of both surprises, ${bits(SURPRISE_HEADS + SURPRISE_TAILS, 2)} bits`,
      ],
      answer: 0,
      why: `A rare outcome is a bigger surprise, so heads carries more than tails. Entropy then weights each surprise by its chance: 0.1 × ${bits(SURPRISE_HEADS, 2)} + 0.9 × ${bits(SURPRISE_TAILS, 2)} = ${bits(H_TENTH, 4)}. Adding the two surprises without weights would overcount, since tails is the usual outcome.`,
    },
    {
      q: `The truth is p = (${TRUE_DIST.join(', ')}). You believe q is uniform, one third each. What does that cost, per outcome?`,
      options: [
        `${bits(UNIFORM_EXTRA)} extra bits: the cross-entropy ${bits(entropy(TRUE_DIST) + UNIFORM_EXTRA)} exceeds the entropy ${bits(entropy(TRUE_DIST))}`,
        'Nothing: a uniform belief is neutral and does not cost bits, whatever the truth is',
        `${bits(entropy(UNIFORM))} extra bits, the whole entropy of the uniform belief itself`,
        'It is unbounded, because the belief differs from the truth, so the code has no cost limit at all',
      ],
      answer: 0,
      why: `Cross-entropy ${bits(entropy(TRUE_DIST) + UNIFORM_EXTRA)} minus entropy ${bits(entropy(TRUE_DIST))} is the KL divergence. A wrong belief costs extra whenever it differs from p, and the cost is unbounded when q gives an outcome that does happen a chance of zero.`,
    },
  ],
};

export default lesson;
