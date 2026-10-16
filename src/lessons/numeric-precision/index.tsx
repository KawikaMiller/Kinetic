import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const n = (v: number) => v.toLocaleString('en-US');
const signed = (d: number) => (d > 0 ? `+${d}` : String(d));
const centsOf = (d: number) => `${signed(d)} ${Math.abs(d) === 1 ? 'cent' : 'cents'}`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Floating-point error is not random noise that averages out: it piles up when you add many small numbers to a large one and it explodes when you subtract two nearly equal numbers, and both can be avoided by choosing the method, not the type.',
    what: 'The format itself is a separate lesson; this one is about what happens to error as you compute. Adding numbers one at a time into a growing total rounds every step, and a naive float32 sum of 200,000 dimes ends up tens of units off. Compensated sums (Kahan and Neumaier) carry the lost low-order part forward, pairwise summation limits how far errors can pile up, and a BigInt oracle gives the exact answer to compare against. Subtracting nearly equal numbers cancels the leading digits that agreed, leaving only the rounding noise, so sqrt(x + 1) - sqrt(x) is exactly 0 at 10 to the 16 until it is rewritten. Money adds a third trap: float dollars and rounding rules drift from the exact answer by cents, which integer cents with an explicit rule avoid.',
    analogy: 'Adding a grain of sand to a bucket of gravel on a scale that only shows whole kilos: every grain disappears, and a million of them still weigh nothing until you keep the grains in a separate cup and add the cup at the end.',
    useCases: [
      'Summing long columns of measurements, prices or probabilities without letting the total drift',
      'Rewriting a formula (a difference of roots, a log of one plus a small number) so it keeps its digits',
      'Choosing integer cents and a stated rounding rule for money in a two-decimal currency, instead of float dollars',
      'Reading why a result changes when summation order, a library or a compiler flag changes',
    ],
    why: 'Numerical bugs do not crash: they return a plausible number with the wrong digits. Knowing where digits are lost, and having an exact check to compare against, is how you tell a trustworthy total from an accumulated error.',
    watch: 'In the digit strips a digit equal to the oracle\'s is green (--ok) and the first digit that differs, and everything after it, is red (--bad); the oracle row, the exact sum and the x + 1 === x stat are blue (--info). In the error plot the naive method is red (--bad, the costly side), Kahan and Neumaier are green (--ok, Neumaier dashed), pairwise is violet (--violet), sorted ascending is sky blue, and a hollow dot on the floor line marks an error of exactly zero. In the cents scene the three rounding modes are plain categories (amber, pink, sky), and a result that drifted from the exact answer is red while one that matches is green.',
  },
  tryThis: [
    `Summation, on the defaults (ten copies of 0.1 in float64): the naive fold returns ${F.dimesNaive} and Kahan returns ${F.dimesKahan}. Press "A million small steps (200,000 in float32)": naive returns ${F.f32Naive}, off by ${F.f32NaiveError}, while Kahan returns ${F.f32Kahan}, off by ${F.f32KahanError}.`,
    `Blind spot, from the defaults: press "Kahan's blind spot". Naive returns ${F.blindNaive}, Kahan ${F.blindKahan}, Neumaier ${F.blindNeumaier}, and the exact sum is ${F.blindExact}.`,
    `Cancellation, in the second scene on the defaults (x = 10^${F.k}): the naive sqrt difference has ${F.sqrtNaiveDigits} of 16 digits right and the rewrite ${F.sqrtStableDigits}. Move k to 8: the naive version keeps ${F.sqrt8NaiveDigits} by value, though its digit text matches the oracle's for only ${F.sqrt8NaiveMatching} digits. Switch the function to the quadratic root at k = 8: the naive formula keeps ${F.quad8NaiveDigits}.`,
    `Cents, in the third scene on the defaults (${F.items} items, ${F.rate}%, half up, rounding each line): float64 dollars drift ${centsOf(F.floatDriftHalfUp)} from the exact $${F.exactTax} and integer cents drift ${signed(F.centsDriftHalfUp)}. Press "Half to even": float64 drifts ${signed(F.floatDriftHalfEven)}. Switch Round to "the total": float64 drifts ${signed(F.floatDriftTotal)}. The facts at the bottom read ${F.addFact}, "${F.toFixedFact}" and ${F.roundFact}.`,
  ],
  keyIdeas: [
    `Rounding error piles up rather than averaging out: in this model a naive float32 sum of ${n(F.f32N)} copies of 0.1 is off by ${F.f32NaiveError} (about ${n(F.f32NaiveUlps)} ulps), where Kahan is off by ${F.f32KahanError}.`,
    `A bigger type moves the problem without removing it: the same naive sum in float64 is still off by ${F.f64NaiveError}, against ${F.f64KahanError} for Kahan.`,
    `Subtracting nearly equal numbers cancels the digits that agreed: at x = 10^${F.k} the naive sqrt(x + 1) - sqrt(x) has ${F.sqrtNaiveDigits} of 16 digits right, and the algebraically equal rewrite has ${F.sqrtStableDigits}.`,
    `Money is exact only with a stated rule: for a two-decimal currency, integer cents match exact arithmetic (${centsOf(F.centsDriftHalfUp)} of drift) while float dollars drift ${centsOf(F.floatDriftHalfUp)} in this model, and the facts 0.1 + 0.2 = ${F.addFact} and (1.005).toFixed(2) = "${F.toFixedFact}" are live JavaScript.`,
  ],
  quiz: [
    {
      q: 'You add a million small numbers into a large running total in float32. Which method keeps the answer?',
      options: [
        'Kahan summation, which carries the part each addition rounds away',
        'The naive loop, since each addition is correctly rounded on its own',
        'Neither, since float32 cannot represent a total that large at all',
        'Sorting from largest to smallest, so the big terms protect the small ones',
      ],
      answer: 0,
      why: `Each naive addition rounds the small term away against the large total, and the losses go the same way: ${n(F.f32N)} dimes give ${F.f32Naive}, off by ${F.f32NaiveError}. Kahan returns ${F.f32Kahan}, off by ${F.f32KahanError}.`,
    },
    {
      q: 'Why is `Math.sqrt(x + 1) - Math.sqrt(x)` so much worse at large x than at small x?',
      options: [
        'The two roots become nearly equal, so subtracting them cancels the leading digits',
        'The square root function loses accuracy for large inputs, whatever it is used for',
        'The addition x + 1 overflows for large x, which turns the result into infinity',
        'The subtraction rounds away the larger root, so the result is always the smaller root',
      ],
      answer: 0,
      why: `Both roots carry the same leading digits, so the subtraction leaves just rounding noise: ${F.sqrtNaiveDigits} of 16 digits are right at 10^${F.k}, and the rewrite 1 / (sqrt(x + 1) + sqrt(x)) adds instead of subtracting and keeps ${F.sqrtStableDigits}.`,
    },
    {
      q: 'A learner says "floating-point error is random noise, so it averages out over many operations". What is the accurate version?',
      options: [
        'Errors can pile up in one direction, as when a total swallows each small term in turn',
        'Errors cancel on average, but only for sums that are sorted before they are added',
        'Errors are random, but their average is small only in double precision',
        'Errors are noise in each step, and the final result is rounded to hide them',
      ],
      answer: 0,
      why: `Each addition into a large total rounds the same way, so nothing cancels: the naive float32 sum is off by ${F.f32NaiveError}, about ${n(F.f32NaiveUlps)} ulps. A pairwise or compensated sum limits the pile-up.`,
    },
    {
      q: 'Does switching from float32 to float64 fix an accumulating sum?',
      options: [
        'It shrinks the error but does not remove it, so a better method still helps',
        'It removes the error, since double precision holds every digit of the total',
        'It makes the error worse, since the extra bits are rounded away again',
        'It fixes sums of decimals only, since binary fractions are exact in doubles',
      ],
      answer: 0,
      why: `For ${n(F.f32N)} copies of 0.1 the naive float64 sum is still off by ${F.f64NaiveError}, while Kahan in float64 is off by ${F.f64KahanError}: a bigger type helped, and a better method helped more.`,
    },
  ],
};

export default lesson;
