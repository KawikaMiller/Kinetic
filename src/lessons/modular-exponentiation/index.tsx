import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: `Square-and-multiply computes a^e mod n with between one and two modular multiplications per bit of e: ${F.base}^${F.exponent} mod ${F.modulus} takes ${F.operations} multiplications instead of ${F.naive}, because the work follows the length of the exponent, not its size.`,
    what: 'The modular-arithmetic lesson showed remainders; this one is the algorithm that makes big powers practical. Write the exponent in binary and scan its bits: start from the leading bit, then for each later bit square the running value and, when the bit is 1, multiply by the base. Reduce mod n after every operation so the numbers never outgrow the modulus (the unreduced power can have hundreds of thousands of digits). Scanning from the right instead, with a running power, gives the same answer with the same count. The same exponentiation computes Fermat inverses a^(p-2) mod p and runs the plain Fermat primality test, which a Carmichael number such as 561 fools. Everything here is a toy size: no key is created, and nothing is a working scheme.',
    analogy: 'To go up ten floors you do not press the call button ten times: you take an express lift to the fifth floor, double that, and add one more at the end. The bits of the exponent are the instructions: double, or double and step.',
    useCases: [
      'Public-key schemes such as RSA and Diffie-Hellman, which rely on exponentiation mod n with big numbers',
      'Primality tests that raise a base to a large power mod n',
      'Computing modular inverses when the modulus is prime',
      'Hashing and checksums over fields, and any code that needs a big power mod something',
    ],
    why: 'Knowing that the cost is the bit length, not the exponent, explains why modular exponentiation is cheap while discrete logarithms and factoring are not, and it is the first step to reading real big-integer code, including why that code is written to take the same time whatever the secret bits are.',
    watch: 'A bit that is 1 is yellow (--hi) and a 0 is dim (--dim), the usual bit-lesson rule; the ring on the strip marks the bit being processed. A squaring step is blue (--info), a multiply step violet (--violet), the running value green (--ok) and the naive count red (--bad), the costly side. In the Fermat scene a base that exposes a composite is orange (--orange) and a base that passes is green. All numbers are toy sizes.',
  },
  tryThis: [
    `Square and multiply, on the defaults (${F.base}^${F.exponent} mod ${F.modulus}): play to the end. The exponent has ${F.bits} bits and ${F.ones} of them are 1, so it takes ${F.squarings} squarings and ${F.multiplications} multiplications, ${F.operations} in all, against ${F.naive} for repeated multiplication. The answer is ${F.result}.`,
    `Why reduce, on the defaults: written out in full the power would have ${F.fullDigits} digits, while the reduced running value never has more than ${F.reducedDigits}, the size of the modulus (${F.modulusDigits} digits).`,
    `Two directions, set Scan to right to left: the answer ${F.result} and the count of ${F.operations} stay the same, but the method now holds ${F.rtlHeld} numbers instead of ${F.ltrHeld}.`,
    `The same trick elsewhere, on the defaults: a^(p-2) mod p for a = ${F.fermatA}, p = ${F.fermatP} gives ${F.fermatInverse}, the same inverse the Euclid table finds (${F.euclidInverse}). The plain Fermat test on ${F.carmichaelN} passes ${F.passing} of ${F.coprime} coprime bases, so it is fooled.`,
    `A note on timing, with the exponent set to 32768 and then 65535: both have 16 bits, but the first needs ${F.shortOps} multiplications and the second ${F.longOps}. The work follows the 1 bits.`,
  ],
  keyIdeas: [
    `The cost follows the bits of the exponent: ${F.bits} bits with ${F.ones} ones gives ${F.squarings} squarings and ${F.multiplications} multiplications, ${F.operations} in total against ${F.naive}.`,
    `Reduce after each step: the full power would have ${F.fullDigits} digits, and the reduced running value stays within ${F.reducedDigits}.`,
    `Left to right and right to left reach the same result in the same ${F.operations} multiplications, and they differ in what they hold: ${F.ltrHeld} number or ${F.rtlHeld}.`,
    `A prime modulus turns the same exponentiation into an inverse (a^(p-2)), and the plain Fermat test is fooled by ${F.carmichaelN} for ${F.passing} of ${F.coprime} coprime bases.`,
  ],
  quiz: [
    {
      q: `How many modular multiplications does square-and-multiply need for the exponent 1,000,000, and why is it not 1,000,000?`,
      options: [
        `${F.operations}: it works one bit at a time and the exponent has ${F.bits} bits`,
        `${F.bits}: it squares once per bit and never multiplies by the base`,
        `${F.naive}: it still multiplies once for every unit of the exponent`,
        `${F.ones}: it only multiplies at the bits that are 1 and skips the squaring`,
      ],
      answer: 0,
      why: `The exponent ${F.exponent} has ${F.bits} bits and ${F.ones} ones, so the leading bit starts the result and the other ${F.bits - 1} bits cost a squaring each, plus ${F.multiplications} multiplications for the remaining 1 bits: ${F.operations} in total. The step count grows with the number of bits.`,
    },
    {
      q: 'Why is the running value reduced mod n after every operation instead of once at the end?',
      options: [
        'Without it the numbers double in length at each step and become unmanageably large',
        'Without it the final answer would come out as a different number once it is reduced at the end',
        'It makes the exponent smaller, so fewer bits remain to be scanned',
        'The modulus has to be applied once for every bit, or the result is wrong',
      ],
      answer: 0,
      why: `Reduction does not change the result, since remainders respect multiplication, but it keeps each number within the size of the modulus. The unreduced ${F.base}^${F.exponent} has ${F.fullDigits} digits, and the reduced running value stayed within ${F.reducedDigits}.`,
    },
    {
      q: `The plain Fermat test passes for all ${F.coprime} bases coprime to ${F.carmichaelN}. What does that tell you about the test?`,
      options: [
        `A composite number can pass it for every coprime base, so passing is not a proof of being prime`,
        `The number ${F.carmichaelN} must be prime, since a composite would fail for some coprime base`,
        `The test is correct only for numbers below one thousand and unreliable beyond`,
        `The bases that share a factor with ${F.carmichaelN} are the ones that fail, which proves it composite`,
      ],
      answer: 0,
      why: `${F.carmichaelN} = 3 x 11 x 17 is a Carmichael number: a^${F.carmichaelN - 1} = 1 mod ${F.carmichaelN} for each of its ${F.coprime} coprime bases, so the test cannot tell it from a prime that way. The bases sharing a factor do expose it, but a test cannot rely on picking one.`,
    },
    {
      q: 'Square-and-multiply does more multiplications for some exponents than for others of the same length. Why do real implementations avoid that?',
      options: [
        'Work that depends on secret bits can leak those bits through timing, so real code does the same work',
        'The extra multiplications make the answer less accurate for exponents that have many 1 bits in them',
        'Exponents with many 1 bits overflow the registers, which is a separate bug to avoid',
        'The count is wrong for exponents of the same length, and the fix is a slower method',
      ],
      answer: 0,
      why: `The count is exact, not wrong: 32768 and 65535 have the same length but need ${F.shortOps} and ${F.longOps} multiplications. Whatever depends on the secret can be observed, so real code is written to do the same work for any bits (the lesson names this and measures nothing).`,
    },
  ],
};

export default lesson;
