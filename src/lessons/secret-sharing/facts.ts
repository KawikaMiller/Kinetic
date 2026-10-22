import { integer } from '../../core/format';
import { HAND_COEFFS, HAND_SECRET, BYTE_PRIME, BAD_SOURCE_CASE, SOURCE_SUPPORT, exhaustiveSecrecy, interpolateAnyway, makeShares, possibleSecrets, rebuild, reconstructChecked, shareBytes, signed } from './shamir';

const hand = shareBytes([HAND_SECRET], 3, 5, [[...HAND_COEFFS]]);
const full = rebuild(hand, [1, 2, 3]);
const corrupted = reconstructChecked(makeShares(BigInt(BYTE_PRIME), BigInt(HAND_SECRET), [...HAND_COEFFS], [1n, 2n, 3n]).map((s) => (s.x === 3n ? { ...s, y: s.y + 1n } : s)));
const secrecy = exhaustiveSecrecy(7, 3);
const badShares = makeShares(BigInt(BAD_SOURCE_CASE.p), BigInt(BAD_SOURCE_CASE.secret), [...BAD_SOURCE_CASE.coeffs], [...BAD_SOURCE_CASE.xs]);


/** The numbers the summary, try-this, key ideas and quiz quote: all from the model. */
export const FACTS = {
  secret: HAND_SECRET,
  basis: full.ok ? full.basis.map((b) => signed(b, BigInt(BYTE_PRIME))).join(', ') : '',
  anyway: interpolateAnyway(hand, [1, 2])[0],
  corrupted: corrupted.ok ? String(corrupted.secret) : '',
  pairs: integer(secrecy.cases),
  checks: integer(secrecy.checks),
  badUniform: possibleSecrets(BAD_SOURCE_CASE.p, badShares, SOURCE_SUPPORT.uniform(BAD_SOURCE_CASE.p)).length,
  badZeroOne: possibleSecrets(BAD_SOURCE_CASE.p, badShares, SOURCE_SUPPORT['zero-or-one'](BAD_SOURCE_CASE.p)).length,
  badField: BAD_SOURCE_CASE.p,
};
