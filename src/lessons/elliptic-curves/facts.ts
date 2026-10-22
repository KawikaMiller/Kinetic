import { TOY_F17, add, formatPoint, mul } from '../../core/ecc';
import { humanDuration, power } from '../../core/format';
import { DEFAULT_FIELD, P256_COST, TOY, commutativityChecks, curveFacts, mulChecked, scalarView, FORGOT_FACTOR_2_WITNESS, realAdd, realPointText, groupBits } from './model';
import { rat } from './rational';

const toy = curveFacts(DEFAULT_FIELD);
const g = TOY_F17.G;
const thirteen = scalarView(13n);
const real = { a: -2, b: 1 };
const sum = realAdd(real, { x: rat(0n), y: rat(1n) }, { x: rat(1n), y: rat(0n) });

/** The numbers the summary, try-this, key ideas and quiz quote: all from the model. */
export const FACTS = {
  toyCount: toy.count,
  toyBits: groupBits(TOY.n),
  /** The generic square-root method on the toy group: about sqrt(19) = 4.4, rounded. */
  toyGeneric: Math.round(Math.sqrt(Number(TOY.n))),
  hasseWidth: toy.hasse.width,
  doubleG: formatPoint(add(TOY_F17, g, g)),
  tripleG: formatPoint(mul(TOY_F17, 3n, g).point),
  point13: formatPoint(thirteen.point),
  doublings13: thirteen.doublings,
  additions13: thirteen.additions,
  point20: formatPoint(scalarView(20n).point),
  p256Steps: power(P256_COST.log2),
  p256Time: humanDuration(P256_COST.seconds),
  commutes: commutativityChecks().agreed,
  realSum: realPointText(sum.result),
  witness: String(FORGOT_FACTOR_2_WITNESS),
  brokenAtWitness: mulChecked('forgot-factor-2', FORGOT_FACTOR_2_WITNESS).failure !== null,
};
