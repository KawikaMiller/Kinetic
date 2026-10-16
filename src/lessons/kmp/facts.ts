import { kmpSearch, lps, naiveSearch } from './kmp';
import { LPS_PRESETS, OPENING } from './presets';
import { WORST_PATTERN } from './sweep';

const naive = naiveSearch(OPENING.naive.text, OPENING.naive.pattern);
const kmpCount = kmpSearch(OPENING.count.text, OPENING.count.pattern);
const match = kmpSearch(OPENING.match.text, OPENING.match.pattern);
const matchNaive = naiveSearch(OPENING.match.text, OPENING.match.pattern);
const overlap = kmpSearch('aaaa', 'aa');

/** Every number the try-this lines and key ideas quote, computed from the same models the scenes use. */
export const FACTS = {
  naiveText: OPENING.naive.text.length,
  naivePattern: OPENING.naive.pattern,
  naiveComparisons: naive.comparisons,
  naiveRematches: naive.rematches,
  lpsDefault: lps(OPENING.lps.pattern).join(' '),
  lpsAaaab: lps('aaaab').join(' '),
  lpsAbababac: lps('abababac').join(' '),
  lpsAabaaab: lps('aabaaab').join(' '),
  lpsPresetCount: LPS_PRESETS.length,
  matchPattern: OPENING.match.pattern,
  matchComparisons: match.comparisons,
  matchNaiveComparisons: matchNaive.comparisons,
  matchFound: match.matches.join(' and '),
  matchFallbacks: match.fallbacks,
  overlapFound: overlap.matches.join(', '),
  kmpComparisons: kmpCount.comparisons,
  kmpBound: 2 * OPENING.count.text.length,
  kmpAdvances: kmpCount.advances,
  kmpFallbacks: kmpCount.fallbacks,
  worstPattern: WORST_PATTERN,
};
