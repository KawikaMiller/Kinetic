import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Bitwise operators work on every bit of a number at once: AND keeps bits, OR sets them, XOR flips them, and shifts slide them left or right.',
    what: 'AND (&), OR (|), XOR (^) and NOT (~) treat a number as a row of bits and work column by column, each column on its own. Shifts move the whole row: << fills the right with zeros and multiplies by powers of two; >> fills the left with copies of the sign bit; >>> fills it with zeros. Combined with a mask (a number with just the bits you care about set) they set, clear, toggle and test individual flags. In JavaScript all of this happens on 32-bit integers, not on the 64-bit floats that ordinary numbers are.',
    analogy: 'A row of light switches with a stencil laid over it. AND only lets through the switches the stencil leaves open, OR flips the stencilled ones on, and XOR flips them over, on or off.',
    useCases: [
      'Unix permissions and feature-flag words: one bit per switch, read with &',
      'Packing colours and protocol headers: (r << 16) | (g << 8) | b',
      'Fast counts in data structures: popcount, and x & -x in Fenwick trees',
      'Hashes and checksums, which mix bits with XOR and shifts',
    ],
    why: "Bit masks show up in permissions, flags, graphics, compression, hashing and network code, and in plenty of interview questions. Knowing JavaScript's 32-bit rules saves you from bugs like 1 << 31 coming out negative or a huge ID being silently cut down by | 0.",
    watch: 'Each square is one bit: a solid yellow fill when it is 1, a dim outline when it is 0. In Operators the bottom row fills one column at a time from the right: the column being worked out is ringed in blue on every row, columns not reached yet are dashed and empty, and a green ✓ marks a result bit that differs from A. In 32-bit mode an orange "sign" label marks bit 31, and the orange chips are JavaScript\'s 32-bit surprises. In 8-bit mode the "Real JS gives" readout turns red when JavaScript\'s 32-bit answer differs. In Flags the MASK register and ~MASK are violet, ✓ marks bits the operation changed, and the flag-name chips are yellow when that flag is on. In Tricks the operand rows (x − 1, ~x, −x) are violet, ✓ marks bits the current line changed, and the code panel highlights the line running now.',
  },
  tryThis: [
    "In Operators pick >>, then compare it with >>> while A's top bit is set: the top bits fill differently.",
    'Press the "1 << 31" chip: the 1 lands in the sign bit and JavaScript reads the result as negative.',
    'In 8-bit mode type 256 into "Type A": it is refused, not cut down to 0.',
    'In Flags, choose Clear and press Apply; then Toggle the same bit twice and watch it come back.',
    'In Tricks, pick "Power of two?" and clear every bit of x: 0 fools the tempting test.',
  ],
  keyIdeas: [
    '& keeps bits (masking), | sets them, ^ flips them and ~ flips them all, each column on its own.',
    'Flags: set with f | MASK, clear with f & ~MASK, toggle with f ^ MASK, test with (f & MASK) !== 0.',
    '>> copies the sign bit into the top; >>> fills zeros. They only differ when the sign bit is 1.',
    'JavaScript bitwise operators work on 32-bit integers: 1 << 31 is negative and shift counts wrap mod 32.',
  ],
  quiz: [
    {
      q: 'In JavaScript, what are -16 >> 2 and -16 >>> 2?',
      options: [
        '-4 and 1073741820: >>> shifts in zeros',
        'Both are -4: the two operators are aliases',
        'Both 1073741820: every shift drops the sign',
        '-4 and 4: >>> just removes the minus sign',
      ],
      answer: 0,
      why: '>> copies the sign bit into the top, so -16 stays negative and is divided by 4. >>> fills with zeros, so the same 32 bits read as a large positive number. They are not aliases: they agree only when the sign bit is 0.',
    },
    {
      q: 'What does 1 << 31 evaluate to in JavaScript?',
      options: [
        '-2147483648, since bit 31 is the sign bit',
        '2147483648, as JS numbers are 64-bit floats',
        '0, because the 1 falls off the 32-bit end',
        'Infinity, because the integer overflows',
      ],
      answer: 0,
      why: 'Numbers are 64-bit floats, but bitwise operators first convert them to 32-bit signed integers. The 1 lands in bit 31, the sign bit, so the result is the most negative int32. It stays inside the 32 bits, so it is not 0.',
    },
    {
      q: 'Which line turns the ITALIC flag off and leaves every other flag alone?',
      options: ['flags & ~ITALIC', 'flags ^ ITALIC', 'flags | ~ITALIC', 'flags & ITALIC'],
      answer: 0,
      why: '~ITALIC has every bit set except ITALIC\'s, so AND keeps the rest and clears that one. XOR toggles: if ITALIC was already off, ^ would turn it on. flags & ITALIC keeps only ITALIC and wipes everything else.',
    },
    {
      q: 'Why does (x & (x - 1)) === 0 need a guard to test for a power of two?',
      options: [
        'It also returns true when x is 0',
        'It misses powers of two above 2¹⁶',
        'It returns false for 1, which is 2⁰',
        'It only works when x is an odd number',
      ],
      answer: 0,
      why: '0 & -1 is 0, so 0 passes, and in 32-bit JS so does -2147483648. Guard it with x > 0. It does work for 1: 1 & 0 is 0, and 1 = 2⁰ is a power of two.',
    },
    {
      q: "How many times does Kernighan's loop (x &= x - 1 until x is 0) run for x = 0b1000_0001?",
      options: ['2 times', '8 times', '1 time', '7 times'],
      answer: 0,
      why: 'Each pass clears the lowest set bit, so it runs once per 1 bit. 0b1000_0001 has two of them. A loop over every bit position would take 8.',
    },
  ],
};

export default lesson;
