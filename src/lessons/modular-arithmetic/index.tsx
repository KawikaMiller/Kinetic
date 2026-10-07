import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Modular arithmetic is clock maths: count up to n, wrap to 0, and keep only the remainder. a mod n is always between 0 and n − 1.',
    what: 'a mod n is what is left after taking away as many whole n\'s as fit: 17 mod 12 = 5, like 17:00 on a 12-hour clock. Adding and multiplying work as usual, then you wrap. Some numbers have an inverse, a partner that multiplies to 1 (5 × 5 = 25 ≡ 1 mod 12), but only when they share no factor with n. And watch out: JavaScript\'s % is a remainder, not a mod, so -7 % 3 is -1 instead of 2.',
    analogy: 'A 12-hour clock: 5 hours after 10 o\'clock is 3 o\'clock, not 15. Going round the dial a whole extra time changes nothing.',
    useCases: [
      'Hash tables pick a bucket with hash mod size, and consistent hashing places keys on a ring',
      'Ring buffers and round-robin schedulers step through slots with (i + 1) % n',
      'Weekdays, hours and months: "what day is it 100 days from Tuesday?"',
      'RSA, Diffie-Hellman and checksums (ISBN, Luhn) are all arithmetic mod n',
    ],
    why: 'Wrapping arithmetic is everywhere in real code, and the negative-number % bug shows up in ring buffers, pagination and calendar code. The inverse rule (it exists only when gcd(a, n) = 1) is the heart of RSA, which `gcd-euclid` builds towards.',
    watch: 'Clock: the numbers 0 to n − 1 sit round the face. The hand and the number it points at are yellow; the numbers it walked through on the latest + or × turn blue. Inverses: each cell is (row × column) mod n. Green cells are exactly 1, an inverse pair; the other cells are tinted blue, deeper for bigger products; rows with no 1 at all are grey, and the cell you pick gets a yellow ring (the arrow-key focus ring is the app\'s usual outline). A dashed grey tag marks "no inverse". Negatives: a JavaScript % result that differs from the true mod is orange, the true mod green. In the ring buffer the current slot is yellow, an index outside the buffer is red, and the fixed lookup is green.',
  },
  tryThis: [
    'In Clock, keep n = 12 and a = 17 and press "+ a": the hand walks 17 ticks and lands on 5, because 17 mod 12 = 5.',
    'Type 1000000 and press "+ a": the walk is reduced first, because whole laps change nothing.',
    'In Inverses, with n = 12, click the green cell in row 5: 5 × 5 = 25 = 2 · 12 + 1, so 5 is its own inverse.',
    'Slide n from 12 to 13: a prime modulus gives every row a 1, while 12 leaves seven rows without one.',
    'In Negatives, step back from slot 0: (i - 1) % 5 asks for buf[-1], which is undefined.',
  ],
  keyIdeas: [
    'a mod n is the remainder after removing whole laps of n, always from 0 to n − 1.',
    'JavaScript\'s % keeps the sign of the left side: -7 % 3 is -1. Use ((a % n) + n) % n for a true mod.',
    'a has an inverse mod n exactly when gcd(a, n) = 1; with a prime n, every non-zero a has one.',
    'Hash buckets, ring buffers, clocks and RSA all lean on wrapping arithmetic.',
  ],
  quiz: [
    {
      q: 'In JavaScript, what does -7 % 3 evaluate to?',
      options: ['-1', '2', '1', '-2'],
      answer: 0,
      why: 'JavaScript\'s % rounds the quotient toward zero and keeps the sign of the left side: -7 = (-2)·3 + (-1). 2 is what a true mod gives (-7 = (-3)·3 + 2), which is why ((a % n) + n) % n exists.',
    },
    {
      q: 'Which of these numbers has a multiplicative inverse mod 12?',
      options: ['5', '4', '6', '8'],
      answer: 0,
      why: 'An inverse exists exactly when gcd(a, 12) = 1. 5 × 5 = 25 = 2·12 + 1, so 5 is its own inverse. 4, 6 and 8 all share a factor with 12, so every multiple of them stays a multiple of that factor mod 12 and never hits 1.',
    },
    {
      q: 'A ring buffer steps back with buf[(i - 1) % n]. What happens when i is 0?',
      options: [
        'It reads buf[-1], which is undefined',
        'It wraps to the last slot, buf[n - 1]',
        'It throws a RangeError right away',
        'It reads buf[0] again, the same slot',
      ],
      answer: 0,
      why: '(0 - 1) % n is -1 in JavaScript, and arrays have no index -1, so you get undefined with no error. Wrapping to n - 1 is what you wanted, and what ((i - 1) % n + n) % n gives.',
    },
    {
      q: 'Mod 7, every number from 1 to 6 has an inverse. Why doesn\'t mod 8 work the same way?',
      options: [
        '2, 4 and 6 share a factor with 8',
        'Inverses only exist for odd moduli',
        'Bigger moduli always have fewer inverses',
        '8 is a power of two, which has none',
      ],
      answer: 0,
      why: 'a has an inverse mod n exactly when gcd(a, n) = 1. 7 is prime, so nothing from 1 to 6 shares a factor with it. "Odd moduli only" is tempting but wrong: mod 8, 3 × 3 = 9 ≡ 1, so 3 (and 1, 5, 7) still have inverses; only 2, 4 and 6 don\'t.',
    },
  ],
};

export default lesson;
