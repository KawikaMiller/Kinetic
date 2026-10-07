import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Multiplying two big primes takes one step; getting them back from the product is so slow that RSA\'s security rests on it. Finding primes, by contrast, is fast.',
    what: 'A prime has no divisors except 1 and itself. The Sieve of Eratosthenes finds every prime up to N by crossing out multiples of each prime, starting at p² and stopping once p² passes N. Factoring n by trial division tries divisors up to √n, so every two extra digits make it ten times slower: a 617-digit RSA modulus is hopeless. Testing whether a number is prime is a different, easy problem: Miller-Rabin answers in a blink, while the simpler Fermat test is fooled by Carmichael numbers like 561.',
    analogy: 'Mixing two paint colours takes a second; working out the exact two colours from the mixed pot is the hard part.',
    useCases: [
      'RSA keys: two random primes of about 300 digits each, found quickly with Miller-Rabin',
      'Hash table sizes and hash multipliers are often primes, so keys spread evenly',
      'Precomputing primes with a sieve in coding interviews and competitive programming',
      'Judging key sizes: why 2048-bit RSA is fine today while 512-bit keys were factored decades ago',
    ],
    why: 'Public-key crypto depends on the gap between easy multiplication and hard factoring, and the reason a faster computer doesn\'t close that gap is the core of computational hardness. The sieve is also a classic interview algorithm whose p² trick shows up again and again.',
    watch: 'Sieve: each square is a number. The current prime is yellow, the multiples it is crossing out flash red and then fade to grey, confirmed primes are green, numbers not reached yet have no fill, and 1 has a grey outline. Multiply vs factor: the blue bar counts divisions toward √n; on the plot the solid blue line is the range you actually ran, the dashed violet line is extrapolated, your run is a yellow dot, and the grey dashed lines mark the age of the universe and RSA-2048. A found factor shows in green; a run that hits the limit gets a dashed grey "too big to try here" tag. Primality: each test\'s row is green when it\'s right, red when it\'s fooled, and dashed grey when it\'s too big to try.',
  },
  tryThis: [
    'In Sieve, step through 100: 7 starts crossing at 49, and the sieve stops at 11 because 11² = 121 > 100, leaving 25 primes.',
    'Switch to 400: only 2, 3, 5, 7, 11, 13, 17 and 19 ever cross anything out.',
    'In Multiply vs factor, pick 999,983 × 1,000,003 and press "Factor it": about half a million divisions.',
    'Drag "Digits per prime" to 12 and factor it: it stops at 10⁸ divisions, too big to try here, and the plot says how long it would take.',
    'In Primality, try 561: Fermat says prime, yet 561 = 3 × 11 × 17.',
  ],
  keyIdeas: [
    'The sieve crosses out multiples of p starting at p², and stops once p² > N.',
    'Trial division tries up to √n divisors: two more digits, ten times the work.',
    'A faster computer barely helps: 1,000× the speed buys only 6 more digits.',
    'Primality testing (Miller-Rabin) is fast even when factoring is hopeless; Fermat alone is fooled by Carmichael numbers.',
  ],
  quiz: [
    {
      q: 'Sieving up to 100, you reach the prime 7. Which number do you cross out first?',
      options: ['49', '14', '7', '21'],
      answer: 0,
      why: '14, 21, 28, 35 and 42 all have a smaller prime factor (2, 3 or 5), so they are already gone. The first multiple of 7 nobody has crossed yet is 7² = 49. Starting at 2p works, but redoes that wasted work every pass.',
    },
    {
      q: 'Trial division on a 600-digit RSA modulus would outlast the universe. What would a computer a million times faster change?',
      options: [
        'Almost nothing: it buys about 12 more digits',
        'It would bring the time down to a few days',
        'It would make RSA-2048 breakable in a year',
        'Everything: speed is all factoring really needs',
      ],
      answer: 0,
      why: 'The work is about √n, so every 2 digits cost ×10 and a million times the speed covers just 12 more digits. "Down to a few days" is the tempting intuition, but 10³⁰⁰ seconds divided by a million is still 10²⁹⁴ seconds.',
    },
    {
      q: 'Why can the sieve stop once p² is bigger than N?',
      options: [
        'Any composite left has a factor below p',
        'Larger primes have no multiples up to N',
        'The sieve runs out of numbers to check',
        'Primes above √N can\'t be found by sieving',
      ],
      answer: 0,
      why: 'A composite up to N has a factor no bigger than √N, so it was crossed out already. Larger primes do have multiples up to N (11 has 22, 33 … up to 100), but each of those has a smaller factor and is already gone.',
    },
    {
      q: '561 passes Fermat\'s test: 2⁵⁶⁰ ≡ 1 (mod 561). What does that tell you?',
      options: [
        'Nothing certain: 561 = 3 × 11 × 17',
        '561 is prime, since primes pass it',
        '561 is prime unless it is even',
        'Fermat proves 561 is a square',
      ],
      answer: 0,
      why: 'Every prime passes, but passing doesn\'t make a number prime. 561 is a Carmichael number: it passes for every base that shares no factor with it. Miller-Rabin catches it.',
    },
  ],
};

export default lesson;
