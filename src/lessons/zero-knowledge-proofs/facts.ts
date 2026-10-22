import { confidence } from './cave';
import { DEFAULT_R, DEFAULT_X, GROUP_A, commit, extract, proveFiatShamir, publicKey, realTriples, respond, simulatedTriples, verify } from './schnorr';

const y = publicKey(GROUP_A, DEFAULT_X);
const t = commit(GROUP_A, DEFAULT_R);
const s4 = respond(GROUP_A, DEFAULT_R, 4n, DEFAULT_X);
const s3 = respond(GROUP_A, DEFAULT_R, 3n, DEFAULT_X);
const check4 = verify(GROUP_A, y, t, 4n, s4);
const check3 = verify(GROUP_A, y, t, 3n, s3);
const fs = proveFiatShamir(GROUP_A, DEFAULT_X, DEFAULT_R);

/** The numbers the summary, try-this, key ideas and quiz quote: all from the model. */
export const FACTS = {
  confidence5: confidence(5),
  confidence10: confidence(10),
  survive5: 2 ** -5,
  survive5Percent: (100 * 2 ** -5).toFixed(1),
  s4: String(s4),
  s3: String(s3),
  both3: String(check3.lhs),
  both4: String(check4.lhs),
  extracted: String(extract(GROUP_A, 4n, s4, 3n, s3)),
  triples: realTriples(GROUP_A, DEFAULT_X).length,
  simulated: simulatedTriples(GROUP_A, y).length,
  challengeFs: String(fs.c),
  sFs: String(fs.s),
  q: String(GROUP_A.q),
  p: String(GROUP_A.p),
};
