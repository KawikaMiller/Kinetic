import { toyRsa, modPow } from '../../core/numberTheory';
import { bruteSolutions, compatiblePair, crtBuild, crtExponentiation, firstMatch, fromResidues, lcmN, productN, residueOp, toResidues, workOf } from './crt';
import { KEYS, OPENING, SHARED_DEFAULT, SUN_TZU } from './presets';

const sun = crtBuild(SUN_TZU)!;
const key = KEYS.find((k) => k.id === OPENING.speed.key)!;
const rsa = toyRsa(key.p, key.q, key.e);
if (!rsa.ok) throw new Error(rsa.reason);
const message = BigInt(OPENING.speed.c);
const wrap = (() => {
  const ms = SUN_TZU.moduli;
  return fromResidues(residueOp(toResidues(100, ms), toResidues(10, ms), ms, 'add'), ms);
})();
let compatiblePairs = 0;
for (let a1 = 0; a1 < SHARED_DEFAULT.moduli[0]; a1++) {
  for (let a2 = 0; a2 < SHARED_DEFAULT.moduli[1]; a2++) if (compatiblePair(a1, SHARED_DEFAULT.moduli[0], a2, SHARED_DEFAULT.moduli[1])) compatiblePairs++;
}

/** Every number the try-this lines, key ideas and quiz quote, computed from the models the scenes use. */
export const FACTS = {
  sunMatch: firstMatch(SUN_TZU, productN(SUN_TZU.moduli)),
  sunRange: productN(SUN_TZU.moduli),
  sunSum: sun.sum,
  sunTerms: sun.terms.map((t) => t.term).join(' + '),
  sunX: sun.x,
  sharedLcm: lcmN(SHARED_DEFAULT.moduli),
  sharedProduct: productN(SHARED_DEFAULT.moduli),
  sharedNone: bruteSolutions(SHARED_DEFAULT, lcmN(SHARED_DEFAULT.moduli)).length,
  compatiblePairs,
  allPairs: SHARED_DEFAULT.moduli[0] * SHARED_DEFAULT.moduli[1],
  wrapped: wrap,
  wrapDirect: 110,
  wrapRange: productN(SUN_TZU.moduli),
  rsaN: String(rsa.n),
  rsaDirect: String(modPow(message, rsa.d, rsa.n)),
  rsaCrt: String(crtExponentiation(message, rsa.d, key.p, key.q).result),
  rsaPercent: (workOf(key.p, key.q, rsa.d).ratio * 100).toFixed(0),
};
