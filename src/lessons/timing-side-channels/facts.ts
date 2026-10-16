/** The numbers the try-this entries and the quiz quote, computed from each scene's opening state by the models the scenes draw. */
import { COMPARE_FNS, DEFAULT_GUESS, SECRET_BYTES, SECRET_TEXT, parseGuess } from './compare';
import { MITIGATIONS, classVerdict, openClasses, type MitigationId } from './mitigations';
import { noiseOpening, samplesNeeded } from './noise';
import { PAIR_PRESETS, PROGRAMS, programOf, secretBytes, verdict, type ProgramId } from './traces';

const bytesOf = (text: string) => {
  const parsed = parseGuess(text);
  return parsed.ok ? parsed.value.bytes : [];
};

export function compareFacts() {
  const counts = (text: string) => {
    const guess = bytesOf(text);
    return { early: COMPARE_FNS.early(SECRET_BYTES, guess).comparisons, constant: COMPARE_FNS.constant(SECRET_BYTES, guess).comparisons };
  };
  return {
    opening: counts(DEFAULT_GUESS),
    allWrong: counts('xxxxxxxxxxxxxxxx'),
    fourRight: counts('demoxxxxxxxxxxxx'),
    allRight: counts(SECRET_TEXT),
    wrongLength: counts('demo-tok'),
    wrongLengthBytes: 'demo-tok'.length,
    tokenBytes: SECRET_BYTES.length,
  };
}

export function noiseFacts() {
  const open = noiseOpening();
  return {
    opening: samplesNeeded(open),
    sigma: open.sigma,
    signal: open.perComparison,
    tenTimes: samplesNeeded({ ...open, sigma: 100 }),
    tenTimesSigma: 100,
    strongerSignal: samplesNeeded({ perComparison: 20, sigma: 100 }),
  };
}

export function traceFacts() {
  const [far, near, zero] = PAIR_PRESETS;
  const run = (pair: { a: number; b: number }, id: ProgramId) => verdict(programOf(id), secretBytes(pair.a), secretBytes(pair.b));
  return {
    openingLeaks: run(far, 'secret-if').leaks,
    openingFirstDifference: run(far, 'secret-if').firstDifference! + 1,
    nearIf: run(near, 'secret-if').leaks,
    zeroBroken: run(zero, 'broken-compare').leaks,
    zeroConstant: run(zero, 'ct-compare').leaks,
    farLeakCount: PROGRAMS.filter((p) => run(far, p.id).leaks).length,
    programs: PROGRAMS.length,
  };
}

export function mitigationFacts() {
  const all: MitigationId[] = MITIGATIONS.map((m) => m.id);
  return {
    classes: openClasses([]).length,
    afterConstantTime: openClasses(['constant-time']).length,
    constantTimeCovers: classVerdict(['constant-time'], 'crypto-timing'),
    afterAll: openClasses(all).length,
    mitigations: all.length,
  };
}
