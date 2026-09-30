import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A logic gate turns one or two bits into one bit by a fixed rule. Wire a few together and they can add numbers, compare them and make decisions.',
    what: 'Boolean algebra has two values, 0 and 1, and a handful of operations: AND (both), OR (either), NOT (flip), plus NAND, NOR and XOR (exactly one). A logic gate is that operation built from transistors. Because each gate is just a rule, a whole circuit can be described completely by a truth table: one row for every combination of inputs.',
    analogy: 'AND is two switches in a row on one wire: the lamp needs both. OR is two switches side by side: either one will do.',
    useCases: [
      'Every CPU instruction: adders, comparisons and multiplexers are gates all the way down',
      'Bit masks and flags in code: x & mask, x | flag, x ^ key are gates applied to every bit at once',
      'Simplifying an if condition: De Morgan turns !(a && b) into !a || !b',
      'Checksums, parity and XOR-based ciphers',
    ],
    why: 'Bitwise operators, feature flags, permission masks and tangled if conditions are all this lesson in disguise. Knowing that a circuit is fully described by its truth table also teaches the habit of checking every input case.',
    watch: 'Circles on the left are the inputs: click one to flip it between 0 (dim) and 1 (yellow). Wires carrying 1 glow yellow and dim wires carry 0; when you flip an input, a yellow dot runs along every live wire from left to right. Each gate is drawn with its standard symbol and name, and fills yellow when its output is 1. The circles on the right are the outputs. The truth table lists every input combination; the blue-highlighted row is the one the circuit is in now, and you can click any row. In De Morgan\'s law, rows where the two circuits disagree turn red. In Build your own, the gates you can change have a dashed outline (violet, or yellow while they output 1) and a violet name above them; click one to pick its type.',
  },
  tryThis: [
    'In "Half adder", set A = 1 and B = 1: the sum is 0 and the carry is 1, which is 1 + 1 = 10 in binary.',
    'Pick "NAND is universal" and switch "Build from NAND" between NOT, AND and OR: the NAND-built column always matches.',
    'In "De Morgan\'s law", look at the red rows, then switch "Rewrite with" to ¬A ∨ ¬B and watch them clear.',
    'In "Build your own", change G4 to XOR and see how many rows of the Y column flip.',
  ],
  keyIdeas: [
    'A gate is a fixed rule from input bits to one output bit; a truth table lists that rule for every input.',
    'XOR gives the sum bit and AND the carry bit: that pair is a half adder, the start of every CPU\'s arithmetic.',
    'NAND alone can build NOT, AND, OR and therefore any circuit at all.',
    'De Morgan: ¬(A ∧ B) = ¬A ∨ ¬B. Negate each part AND flip the operator.',
  ],
  quiz: [
    {
      q: 'Which rewrite of ¬(A ∧ B) is correct?',
      options: ['¬A ∧ ¬B', '¬A ∨ ¬B', 'A ∨ B', '¬(A ∨ B)'],
      answer: 1,
      why: 'De Morgan\'s law: pushing the NOT inside negates each part and flips AND to OR. ¬A ∧ ¬B is wrong whenever exactly one input is 1.',
    },
    {
      q: 'In a half adder, what does A = 1, B = 1 produce?',
      options: ['sum 1, carry 0', 'sum 0, carry 1', 'sum 1, carry 1', 'sum 0, carry 0'],
      answer: 1,
      why: '1 + 1 = 2 = 10 in binary: the XOR sum bit is 0 and the AND carry bit is 1.',
    },
    {
      q: 'Why is NAND called a universal gate?',
      options: ['It is the fastest gate', 'Any other gate can be built from NAND gates alone', 'It has the most inputs', 'It never outputs 0'],
      answer: 1,
      why: 'NAND(A, A) is NOT A, and NOT and AND made from NANDs give you OR too, so any circuit can be made of NANDs.',
    },
    {
      q: 'How many rows does the truth table for a 3-input circuit have?',
      options: ['3', '6', '8', '9'],
      answer: 2,
      why: 'Each input is 0 or 1, so there are 2 × 2 × 2 = 8 combinations.',
    },
  ],
};

export default lesson;
