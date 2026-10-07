import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The greatest common divisor of two numbers falls out of repeated division with remainder: replace (a, b) with (b, a mod b) until the remainder is 0. No factoring needed.',
    what: 'gcd(a, b) is the biggest number that divides both. Euclid\'s algorithm, about 2,300 years old, divides a by b, keeps the remainder, and repeats with the smaller pair: 1071 = 2·462 + 147, 462 = 3·147 + 21, 147 = 7·21 + 0, so gcd(1071, 462) = 21. Geometrically, you tile a rectangle with the biggest squares that fit, then tile the leftover strip, and the last square size is the gcd. Tracking two extra numbers (the extended algorithm) also gives x and y with a·x + b·y = gcd, which is how modular inverses, and RSA private keys, are computed.',
    analogy: 'Cutting a 1071 × 462 cm sheet into the biggest equal square tiles with no waste: cut off the biggest squares you can, then repeat on the offcut until nothing is left over.',
    useCases: [
      'Simplifying fractions and ratios: 1071/462 = 51/22, aspect ratios like 1920 × 1080 = 16:9',
      'RSA key generation: the private exponent is a modular inverse found by extended Euclid',
      'Checking that a step size visits every slot of a ring (gcd(step, n) = 1), as in double hashing',
      'Lining up periodic schedules: two jobs every a and b minutes coincide every lcm = a·b / gcd',
    ],
    why: 'It is the oldest algorithm still running in production code, and the fastest way to see that "find the common factors" does not mean factoring. It takes a handful of steps even for numbers with hundreds of digits, which is exactly what RSA needs.',
    watch: 'Tiling: the rectangle is the larger number wide and the smaller tall. The square being placed is yellow; squares already placed take one colour per step, cycling orange, sky and pink, with their side length written in dark text when there\'s room; the dashed blue region is what is still left to tile; at the end the gcd-sized squares turn green. The remainder table grows one row per step, the current row yellow. Extended & inverse: the newest row of the table is yellow and the gcd row green, the x and y columns are violet, and the inverse result is green.',
  },
  tryThis: [
    'Press play on 1071, 462: 2 squares of 462, 3 of 147, then 7 of 21 fill it exactly, so the gcd is 21.',
    'Load "462, 1071 (a < b)": the first step just swaps the pair, at the cost of one extra division.',
    'Load "89, 55 (Fibonacci)": every quotient is 1 until the end, the slowest case, yet only 9 divisions.',
    'Type a = 1000000000000 and b = 999999999999: two divisions, while trying every divisor would take a trillion.',
    'In Extended & inverse, load "RSA: e = 17, φ = 3120": the inverse 2,753 is the textbook RSA private exponent.',
  ],
  keyIdeas: [
    'gcd(a, b) = gcd(b, a mod b), and gcd(a, 0) = a: repeat until the remainder is 0.',
    'It needs only divisions, never prime factors, and finishes in O(log min(a, b)) steps; consecutive Fibonacci numbers are the worst case.',
    'Extended Euclid finds x, y with a·x + b·y = gcd(a, b).',
    'When gcd(a, m) = 1, that x mod m is a\'s inverse mod m, which is how RSA\'s private key is made.',
  ],
  quiz: [
    {
      q: 'What is gcd(1071, 462)?',
      options: ['21', '7', '42', '3'],
      answer: 0,
      why: '1071 = 2·462 + 147, 462 = 3·147 + 21, 147 = 7·21 + 0, so the gcd is 21. 7 and 3 divide both numbers but aren\'t the greatest common divisor; 42 doesn\'t divide 1071.',
    },
    {
      q: 'Do you need the prime factors of two numbers to find their gcd?',
      options: [
        'No: repeated remainders find it quickly',
        'Yes: list both factorisations, then match them',
        'Only for numbers bigger than a million',
        'Yes, unless one of them is already prime',
      ],
      answer: 0,
      why: 'Euclid uses nothing but division with remainder. Matching factorisations does work for small numbers, which is why it\'s tempting, but factoring big numbers is so slow that RSA\'s security rests on it, while Euclid stays fast at any size.',
    },
    {
      q: 'Which pair below 100 makes Euclid take the most division steps?',
      options: ['89 and 55', '96 and 48', '99 and 98', '97 and 2'],
      answer: 0,
      why: 'Neighbouring Fibonacci numbers shrink as slowly as possible: 89, 55 takes 9 divisions. 99 and 98 look hard because they\'re big and close, but 99 = 1·98 + 1 and then 98 = 98·1 + 0: two steps.',
    },
    {
      q: 'gcd(a, m) = 1. What does extended Euclid give you along the way?',
      options: [
        'a\'s inverse mod m, from x in a·x + m·y = 1',
        'The prime factorisation of both a and m',
        'The square root of a mod m, in one step',
        'A proof that m itself is a prime number',
      ],
      answer: 0,
      why: 'Read a·x + m·y = 1 mod m and the m·y term vanishes: a·x ≡ 1, so x mod m is the inverse. A gcd of 1 doesn\'t make m prime; it only says a and m share no factor (3 and 8, for example).',
    },
  ],
};

export default lesson;
