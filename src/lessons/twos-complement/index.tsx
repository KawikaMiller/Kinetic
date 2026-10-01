import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Computers store negative integers in two\'s complement: the top bit counts as negative. Fixed-width integers run out, and when they do they usually wrap around silently.',
    what: 'An 8-bit register has 256 bit patterns. Read unsigned, they mean 0 to 255. Read as two\'s complement, the top bit is worth −128 instead of +128, so the same patterns mean −128 to 127. Negating a number is "invert every bit, then add 1", which lets the same adder circuit do subtraction. Go past the largest value and the bits roll over: 127 + 1 becomes −128, and unsigned 255 + 1 becomes 0.',
    analogy: 'A car odometer with only three digits: after 999 it rolls over to 000. Nothing breaks, nothing warns you; the number is just wrong.',
    useCases: [
      'Integer types in every language: int8 / int32 / int64, signed vs unsigned',
      'Bugs: counters and IDs that wrap negative, the year-2038 problem, YouTube\'s view counter',
      'Bit tricks and hashing code that rely on "x | 0" or wrapping multiplication',
      'Reading hex dumps where 0xFF might mean 255 or −1 depending on the type',
    ],
    why: 'Overflow bugs are silent: a count goes negative, a loop never ends, a size check passes when it shouldn\'t. Knowing where your integer type ends, and that most languages wrap instead of throwing, is how you spot the bug before production does.',
    watch: 'The wheel has 256 positions. Its outer violet ring labels each position unsigned (0…255); the inner blue ring labels the same bits signed (−128…127). The yellow pointer at the top marks the current position, and the centre shows both readings. Dashed seams mark 127|−128 (blue) and 255|0 (violet); crossing one flashes it red. The bit strip beside the wheel (below it on a phone) shows the current byte, with the sign bit bracketed in blue. "Negate" shows the bits, the inverted bits, then +1. In "Add two numbers", blue bits are carries into each column, and the red carry-out and verdict boxes show which reading is wrong.',
  },
  tryThis: [
    'Press +1 until you cross 127: the signed reading jumps to −128 and the blue seam flashes.',
    'Press −1 at 0: unsigned wraps to 255, but signed goes to −1, which is correct.',
    'Turn to −128 (unsigned 128) and press Negate: it comes back as −128.',
    'In "Add two numbers", try 127 + 1, then −1 + 1: see which reading each one breaks.',
    'Switch Width to 32-bit and press +1 three times past 2,147,483,647.',
  ],
  keyIdeas: [
    'Same bits, two readings: unsigned 0…255, or signed −128…127 where the top bit is worth −128.',
    'Negate = invert every bit, then add 1. −128 has no positive twin in 8 bits.',
    'Overflow usually wraps silently: 127 + 1 = −128 in Java, Go and C#, with no error. In C, signed overflow is undefined behaviour: worse, not safer.',
    'Signed overflow: both inputs share a sign and the result\'s sign differs. Unsigned wrap: a carry falls off the top.',
  ],
  quiz: [
    {
      q: 'In Java, what does adding 1 to the largest int do?',
      options: ['Throws an OverflowException', 'Returns the smallest (most negative) int', 'Returns Infinity', 'Promotes the value to a long'],
      answer: 1,
      why: 'Java integers wrap silently: Integer.MAX_VALUE + 1 == Integer.MIN_VALUE. Most languages behave this way; overflow is not an error unless you ask for checking.',
    },
    {
      q: 'The byte 1111 1111 means…',
      options: ['Always 255', 'Always −1', '255 unsigned or −1 signed: the bits don\'t say which', 'Nothing: it is invalid'],
      answer: 2,
      why: 'Bits have no type. The code reading them decides whether the top bit is worth +128 or −128.',
    },
    {
      q: 'How do you compute −x in two\'s complement?',
      options: ['Flip only the top bit', 'Invert every bit, then add 1', 'Subtract x from 255', 'Shift right by one'],
      answer: 1,
      why: 'Inverting gives −x − 1, and adding 1 fixes it. Flipping just the sign bit is how floats do it, not integers.',
    },
    {
      q: 'Adding −1 + 1 in 8 bits produces a carry out of the top bit. Is the signed answer (0) wrong?',
      options: ['Yes: any carry out means overflow', 'No: the inputs had different signs, so signed overflow is impossible', 'Only on big-endian machines', 'It depends on the language'],
      answer: 1,
      why: 'A carry out means the unsigned reading wrapped (255 + 1). Signed overflow is a different test: both inputs share a sign and the result\'s sign differs.',
    },
  ],
};

export default lesson;
