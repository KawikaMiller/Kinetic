import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `Remainders against several moduli pin down a number uniquely inside a bigger range: a number is the first x that makes every gear point at its remainder, and a formula builds it without searching.`,
    what: `The modular-arithmetic lesson showed remainders against one modulus; this one uses several at once. When the moduli are pairwise coprime, the system x = a_i (mod m_i) has exactly one solution below the product M. The formula builds it: M_i = M / m_i is a multiple of every other modulus, y_i = M_i^-1 mod m_i is its inverse (from the Euclid table), and x = the sum of a_i x M_i x y_i, mod M. Each term adds 0 to the other remainders and a_i to its own. When two moduli share a factor g, the remainders must agree mod g to have any solution, and then it is unique only modulo the lcm, not the product. Residues also add and multiply component by component with no carries, correct while the true result stays below M. Everything here is toy-sized: no key is made, and the last scene is a speed-up of one exponentiation, not a working scheme.`,
    analogy: 'Several gears of different sizes turn together, and you note each one\'s pointer. A number is whatever turn count makes all the pointers read what you were told; the gears repeat their joint pattern only after the product (or the lcm) of their teeth.',
    useCases: [
      'Speeding up RSA decryption and signing by working mod each prime, a common implementation technique',
      'Residue number systems and parallel big-number arithmetic, where the pieces are independent',
      'Secret sharing and error-tolerant schemes built on remainders, named only here',
      'Puzzle and scheduling problems where cycles of different lengths must line up, such as Sun Tzu\'s classic',
    ],
    why: 'It is the reason the pieces of a modulus can be handled separately, which is behind faster big-number arithmetic and a standard speed-up of RSA, and the shared-factor case is the one that trips people up: the moduli need to be coprime for a unique answer modulo their product.',
    watch: 'Each gear is a dial with one tooth per remainder: the pointer is yellow (--hi), the wanted tooth is blue (--info), a gear sitting on its wanted remainder is green (--ok) and one that is not is dim (--dim); the range of the answer is blue too (--info). In the build scene the terms are violet (--violet) and the sum is green. In the shared-factor grid a remainder pair with a solution is green and a pair with none is red (--bad). In the residue scene a result past M is red; in the speed-up scene the direct work is red, the costly side, and the CRT work green.',
  },
  tryThis: [
    `The gears, on the defaults (Sun Tzu's puzzle: 2 mod 3, 3 mod 5, 2 mod 7): press Jump to first match. x = ${F.sunMatch} lights all three dials, inside a range of ${F.sunRange}.`,
    `Build it, on the defaults: the three terms are ${F.sunTerms}, which add to ${F.sunSum}, and ${F.sunSum} mod ${F.sunRange} = ${F.sunX}, the same x the gears found, with no searching.`,
    `A shared factor, on the defaults (x = 2 mod 4, x = 3 mod 6): no x can satisfy both, because the first forces an even x and the second an odd one. Click a pair on the grid that agrees mod 2, such as (2, 4): it has one solution modulo the lcm ${F.sharedLcm}. Only ${F.compatiblePairs} of the ${F.allPairs} pairs have a solution.`,
    `Residue arithmetic, on the defaults (moduli 3, 5, 7): 40 + 35 comes back right. Now set u to 100 and v to 10: the true sum ${F.wrapDirect} is past M = ${F.wrapRange}, and the residues return ${F.wrapped}.`,
    `What it buys, on the defaults (61 x 53, c = 65): the direct power and the CRT recombination both give ${F.rsaDirect}, and in this schoolbook cost model the CRT route costs ${F.rsaPercent}% of the work. These are textbook toy primes, not a key.`,
  ],
  keyIdeas: [
    `A number is fixed by its remainders inside the product of coprime moduli: the first x matching 2 mod 3, 3 mod 5 and 2 mod 7 is ${F.sunMatch}, and the pattern repeats after ${F.sunRange}.`,
    `The formula builds x without searching: the terms ${F.sunTerms} sum to ${F.sunSum}, and mod ${F.sunRange} that is ${F.sunX}.`,
    `Moduli that share a factor need compatible remainders and give a solution unique modulo the lcm: for 4 and 6 that is ${F.sharedLcm}, not ${F.sharedProduct}, and ${F.compatiblePairs} of ${F.allPairs} remainder pairs work.`,
    `Residue arithmetic carries nothing between moduli and is right while the result is below M: ${F.wrapDirect} comes back as ${F.wrapped} over a range of ${F.wrapRange}.`,
  ],
  quiz: [
    {
      q: 'For the moduli 4 and 6, which pairs of remainders have a solution, and modulo what is it unique?',
      options: [
        'Pairs that agree mod 2, and the solution is unique modulo 12',
        'Every pair, and the solution is unique modulo 24',
        'Pairs that differ mod 2, and the solution is unique modulo 12',
        'Pairs that agree mod 4, and the solution is unique modulo 24',
      ],
      answer: 0,
      why: `The gcd of 4 and 6 is 2, so a1 and a2 have to agree mod 2: ${F.compatiblePairs} of the ${F.allPairs} pairs do. A compatible pair has one solution in 0 to ${F.sharedLcm - 1}, the lcm range, and ${F.sharedProduct / F.sharedLcm} in 0 to ${F.sharedProduct - 1}; x = 2 mod 4 with x = 3 mod 6 has none.`,
    },
    {
      q: 'Why does the constructive formula need the moduli to be pairwise coprime?',
      options: [
        'Each M_i needs an inverse mod m_i, which exists only when M_i and m_i share no factor',
        'The product M would be too large to compute when moduli share factors',
        'The remainders could not be told apart if two moduli were equal',
        'The terms would then add up to a number below every modulus',
      ],
      answer: 0,
      why: 'The term a_i x M_i x y_i works because y_i undoes M_i mod m_i. For 4 and 6 the partial products 6 and 4 have no inverse mod 4 and mod 6, and the formula run anyway with a stand-in fails a remainder check on some compatible pairs.',
    },
    {
      q: `On the gears for 3, 5 and 7, the first x that lights every dial is ${F.sunMatch}. Why does the pattern repeat only after ${F.sunRange}?`,
      options: [
        `The gears realign only after a turn count that is a multiple of each size, and ${F.sunRange} = 3 x 5 x 7`,
        `The largest gear sets the pace, so the pattern repeats after 7 turns and again`,
        `Each gear lights on its own at ${F.sunMatch}, so the pattern repeats right away`,
        `The sum of the gear sizes, 15, is the period, since each gear adds its own size`,
      ],
      answer: 0,
      why: `Adding ${F.sunRange} to x turns each gear a whole number of times, so each pointer is back where it was, and no smaller number does that for coprime sizes. The range is the product here and the lcm in general.`,
    },
    {
      q: 'Residue arithmetic adds 100 and 10 on the moduli 3, 5 and 7 and converts back. What does it return, and why?',
      options: [
        `${F.wrapped}: the true sum ${F.wrapDirect} is past M = ${F.wrapRange} and wraps around`,
        `${F.wrapDirect}: component-wise addition is right whatever the size of the result`,
        `0: a carry out of one component cancels the sum in the others`,
        'An error, since a residue tuple cannot hold a number past the largest modulus',
      ],
      answer: 0,
      why: `Each column is added mod its own modulus with no carries, so the tuple stands for ${F.wrapDirect} mod ${F.wrapRange}. The conversion back returns ${F.wrapped}. The method is right while the true result stays below the range M.`,
    },
  ],
};

export default lesson;
