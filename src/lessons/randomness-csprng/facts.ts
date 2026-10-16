/** Numbers the try-this, key ideas and quiz quote, read off the model at the default state. */
import { classifyScore } from '../../core/classify';
import { decimal } from '../../core/format';
import { favoured, moduloCounts, rejectionCounts, rejectionLimit } from './bias';
import { distinctLines } from './captions';
import { EDGE_ON_DEGREES, RANDU, hyperplaneBound, lcgSequence, planeIndex, presetById, randuPlaneIndices } from './lcg';
import { OPENING } from './opening';
import { MAX_OUTPUTS, STATES, candidates, outputsFrom, predictNext, seedSpace } from './recovery';
import { KEY, USES } from './sources';

const P = OPENING.pairs;
const toy = presetById('toy');
const planeStates = lcgSequence(RANDU, OPENING.planes.seed, OPENING.planes.count + 2);
const outs = outputsFrom(OPENING.recover.seed, MAX_OUTPUTS + 20);
const counts = Array.from({ length: MAX_OUTPUTS }, (_, i) => candidates(outs.slice(0, i + 1)).length);
const day = seedSpace('seconds', 86_400);
const ms = seedSpace('milliseconds', 86_400);
const firstUse = USES[0];
const bias = moduloCounts(6);

export const FACTS = {
  toyLines: distinctLines(toy, P.seed, P.count),
  toyBound: hyperplaneBound(2, toy.m),
  randuSeed1Lines: distinctLines(RANDU, 1, P.count),
  pairCount: P.count,
  edgeOn: Math.round(EDGE_ON_DEGREES),
  edgeOnText: decimal(EDGE_ON_DEGREES, 1),
  planeDefault: OPENING.planes.degrees,
  planesInSample: new Set(Array.from({ length: OPENING.planes.count }, (_, i) => planeIndex(planeStates[i], planeStates[i + 1], planeStates[i + 2]))).size,
  planesTotal: randuPlaneIndices().length,
  states: STATES,
  counts,
  firstUnique: counts.indexOf(1) + 1,
  predicted: predictNext(outs.slice(0, counts.indexOf(1) + 1))?.join(' ') === outs.slice(counts.indexOf(1) + 1, counts.indexOf(1) + 21).join(' '),
  daySeeds: day.seeds,
  dayBits: decimal(day.bits, 1),
  msBits: decimal(ms.bits, 1),
  systemBits: seedSpace('system', 86_400).bits,
  sorted: USES.length,
  firstOnlyRight: classifyScore(USES, KEY, Object.fromEntries(USES.map((u) => [u.id, u.id === firstUse.id ? KEY[u.id] : null]))),
  firstUse: firstUse.label,
  bias6: bias.join(' '),
  hit: Math.max(...bias),
  miss: Math.min(...bias),
  favoured6: favoured(bias).length,
  limit6: rejectionLimit(6),
  rejected6: rejectionCounts(6)[0],
  bytes: 256,
};
