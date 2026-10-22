import { DEFAULT_TEXT, brokenReport, distinctSubstrings, lcpKasai, longestRepeated, search, suffixArray } from './model';

const sa = suffixArray(DEFAULT_TEXT);
const lcp = lcpKasai(DEFAULT_TEXT, sa);
const repeat = longestRepeated(DEFAULT_TEXT, sa, lcp);
const ana = search(DEFAULT_TEXT, sa, 'ana');
const witness = brokenReport();

/** The numbers the default text (banana) puts in the summary, try-this and quiz. All come from the model. */
export const FACTS = {
  text: DEFAULT_TEXT,
  n: DEFAULT_TEXT.length,
  sa: sa.join(', '),
  lcp: lcp.join(', '),
  lcpSum: lcp.reduce((a, b) => a + b, 0),
  repeat: repeat.text,
  repeatLength: repeat.length,
  substringPairs: (DEFAULT_TEXT.length * (DEFAULT_TEXT.length + 1)) / 2,
  distinct: distinctSubstrings(DEFAULT_TEXT.length, lcp),
  sortedSuffixes: sa.map((start) => DEFAULT_TEXT.slice(start)).join(', '),
  sortedLengths: sa.map((start) => DEFAULT_TEXT.length - start).join(', '),
  anaLo: ana.lo,
  anaHi: ana.hi,
  anaRange: `[${ana.lo}, ${ana.hi})`,
  anaCount: ana.count,
  anaPositions: ana.positions.join(' and '),
  witness: witness.witness,
  witnessCorrect: witness.correct.join(', '),
  witnessBroken: witness.broken.join(', '),
  brokenWrong: witness.wrong,
  brokenChecked: witness.checked,
};
