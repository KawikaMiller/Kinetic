import { integer } from '../../core/format';
import { ML_KEM_SETS, P256_SHARE_BYTES, hybridShareBytes } from './kem';
import { babai, BAD, DEFAULT_TARGET, GOOD } from './lattice';
import { BROKEN_SEED, DEFAULT_PARAMS, DEFAULT_SEED, FAILING_PARAMS, NOISE_LIMIT, Q, sweep } from './lwe';
import { DEFAULT_MOSCA, verdict } from './mosca';
import { shorRun, isRun } from './shor';

const mosca = verdict(DEFAULT_MOSCA);
const shor = shorRun(15, 7);
const shorBad = shorRun(15, 14);
const good = babai(GOOD, DEFAULT_TARGET);
const bad = babai(BAD, DEFAULT_TARGET);
const hybrid = hybridShareBytes(ML_KEM_SETS[1]);
const failing = sweep(FAILING_PARAMS, BROKEN_SEED);

/** The numbers the summary, try-this, key ideas and quiz quote: all from the model. */
export const FACTS = {
  moscaExposure: mosca.exposure,
  moscaSlack: -mosca.slack,
  shorOrder: isRun(shor) ? shor.r : 0,
  shorFactors: isRun(shor) && shor.factors ? `${shor.factors[0]} and ${shor.factors[1]}` : '',
  shorBadReason: isRun(shorBad) ? (shorBad.failure ?? '') : '',
  defaultFailures: sweep(DEFAULT_PARAMS, DEFAULT_SEED).failures,
  failingCount: integer(failing.failures),
  failingSeed: BROKEN_SEED,
  noiseLimit: NOISE_LIMIT,
  q: Q,
  goodPoint: `(${good.point[0]}, ${good.point[1]})`,
  badPoint: `(${bad.point[0]}, ${bad.point[1]})`,
  goodDistance: Math.sqrt(good.distSq),
  badDistance: Math.sqrt(bad.distSq),
  hybridShare: integer(hybrid),
  classicalShare: P256_SHARE_BYTES,
  hybridFactor: Math.round(hybrid / P256_SHARE_BYTES),
};
