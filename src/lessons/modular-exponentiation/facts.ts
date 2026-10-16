import { modInverse, modPow } from '../../core/numberTheory';
import { bitLength, digitSeries, fermatCensus, naiveMultiplications, operationCount, popcount, powRun, unreducedDigits } from './modpow';
import { HEADLINE, OPENING } from './presets';

const { base, exponent, modulus } = HEADLINE;
const ltr = powRun(base, exponent, modulus, 'ltr');
const rtl = powRun(base, exponent, modulus, 'rtl');
const series = digitSeries(base, exponent, modulus);
const fermat = fermatCensus(OPENING.fermat.n);
const { a, p } = OPENING.fermat;
const short = powRun(3n, 32768n, 1_000_003n, 'ltr');
const long = powRun(3n, 65535n, 1_000_003n, 'ltr');

/** Every number the try-this lines, key ideas and quiz quote, computed from the models the scenes use. */
export const FACTS = {
  base: String(base),
  exponent: exponent.toLocaleString('en-US'),
  modulus: String(modulus),
  bits: bitLength(exponent),
  ones: popcount(exponent),
  squarings: ltr.squarings,
  multiplications: ltr.multiplications,
  operations: operationCount(ltr),
  naive: naiveMultiplications(exponent).toLocaleString('en-US'),
  result: String(ltr.result),
  rtlSame: rtl.result === ltr.result && operationCount(rtl) === operationCount(ltr),
  rtlHeld: rtl.held,
  ltrHeld: ltr.held,
  fullDigits: unreducedDigits(base, exponent).toLocaleString('en-US'),
  reducedDigits: Math.max(...series.map((s) => s.reduced)),
  modulusDigits: String(modulus).length,
  fermatA: String(a),
  fermatP: String(p),
  fermatInverse: String(modPow(a, p - 2n, p)),
  euclidInverse: String(modInverse(a, p)),
  carmichaelN: OPENING.fermat.n,
  coprime: fermat.coprime,
  passing: fermat.passing,
  shortOps: operationCount(short),
  longOps: operationCount(long),
};
