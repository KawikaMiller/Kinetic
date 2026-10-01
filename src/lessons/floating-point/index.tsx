import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Floating-point numbers are binary fractions with a fixed number of bits. Most decimal fractions, 0.1 included, can\'t be stored exactly, which is why 0.1 + 0.2 isn\'t 0.3.',
    what: 'An IEEE 754 float is scientific notation in binary: a sign bit, an exponent (which power of two) and a mantissa (the digits). A 32-bit float has 8 exponent bits and 23 mantissa bits; JavaScript\'s 64-bit numbers have 11 and 52. Every stored value is an exact binary fraction, but 0.1 is a repeating fraction in binary, like 1/3 in decimal, so it gets rounded to the nearest float. The gaps between representable floats grow with the magnitude: tiny near zero, wider for big numbers.',
    analogy: 'Try writing 1/3 in decimal with 8 digits: 0.33333333. It\'s close, but three of them add up to 0.99999999, not 1. Binary has the same problem with 1/10.',
    useCases: [
      'Every JavaScript number, and double / float in most languages',
      'Money bugs: 0.1 + 0.2 === 0.3 is false, so store cents as integers',
      'Comparing results with a tolerance instead of ===',
      'Graphics, games and ML, where float32 trades precision for speed and memory',
    ],
    why: 'You will hit a rounding bug in a price, a percentage or a test assertion. Knowing floats are exact binary fractions, not "random noise", tells you when to use integers, when to compare with a tolerance, and why a big number can\'t hold a small increment.',
    watch: 'The 32 squares are one float32: the red bit is the sign, the blue bits the exponent, the violet bits the mantissa (filled when 1). Click any bit to change it; the formula line underneath rebuilds the value from the three fields. The zoomed-in line shows the current value as a yellow dot among its dim grey neighbours, the only floats nearby, with the gap between them, and a dashed blue ring where the number you typed really was. The zoomed-out line puts the value on a log scale and prints the gap between floats at each power of ten. The table is real float64 JavaScript: green true, red false.',
  },
  tryThis: [
    'Type 0.1 and press "Store as float32": the dashed ring shows how far it moved.',
    'Pick "2²⁴ = 16,777,216" and look at the gap: odd integers above it can\'t be stored.',
    'Pick 1.0, then click the last blue (exponent) bit: it halves to 0.5. Exponent bits scale by powers of two.',
    'Pick +0, then −0: only the sign bit differs, and they compare equal.',
    'Flip "Stored value" to "Every digit" to see the exact binary fraction behind 0.1.',
  ],
  keyIdeas: [
    'A float is sign × mantissa × 2^exponent, stored in fixed bit fields.',
    'Floats are exact binary fractions; decimals like 0.1 can\'t be written that way, so they round.',
    'Gaps between floats grow with size: great for tiny and huge numbers, bad for exact integers past 2⁵³ (or 2²⁴ in float32).',
    'Compare with a tolerance, and keep money in integer cents.',
  ],
  quiz: [
    {
      q: 'Why is 0.1 + 0.2 !== 0.3 in JavaScript?',
      options: [
        '0.1 and 0.2 are stored as the nearest binary fractions',
        'Floating-point maths is randomly imprecise each run',
        "JavaScript's + operator has a long-standing bug",
        'JavaScript stores numbers as float32, not float64',
      ],
      answer: 0,
      why: 'Each value is rounded to the nearest representable binary fraction. The tiny errors are deterministic, not random, and here they add up to 0.30000000000000004 even in float64.',
    },
    {
      q: 'Which of these is stored exactly as a float?',
      options: ['0.1', '0.3', '0.75', '1/3'],
      answer: 2,
      why: '0.75 = 1/2 + 1/4, a finite binary fraction. The others repeat forever in binary.',
    },
    {
      q: 'What is NaN === NaN?',
      options: ['true', 'false', 'NaN', 'undefined'],
      answer: 1,
      why: 'IEEE 754 defines NaN as unequal to everything, itself included, and === always returns a boolean. Use Number.isNaN to test for it.',
    },
    {
      q: 'You add 1 to a float32 holding 16,777,216 (2²⁴). What do you get?',
      options: ['16,777,217', '16,777,216', 'Infinity', 'An error'],
      answer: 1,
      why: 'At that size neighbouring float32s are 2 apart, so 16,777,217 rounds back to 16,777,216. float64 hits the same wall at 2⁵³.',
    },
  ],
};

export default lesson;
