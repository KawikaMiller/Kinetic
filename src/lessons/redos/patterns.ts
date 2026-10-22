/**
 * The lesson's four textbook patterns and their safe rewrites. They are fixed, lesson-authored text: a learner
 * never types a pattern here, and no text typed by a learner is ever handed to the browser's RegExp.
 *
 * Every pattern is written in the small dialect of `core/regex` and run anchored at both ends (match at position 0
 * and reach the end), which is what the anchors ^ and $ mean; the `shown` form carries them.
 */
import { constructionOf, parsePattern, type Construction, type ParsedRegex } from '../../core/regex';

export type PatternId = 'linear' | 'quadratic' | 'fibonacci' | 'exponential';

export interface ShapePattern {
  id: PatternId;
  /** The dialect source the matchers run. */
  source: string;
  /** What the learner reads: the same pattern with its anchors. */
  shown: string;
  /** One plain sentence on how the engine can split the text under this pattern (no numbers). */
  mechanism: string;
  /** The same language written so that no two parts can claim the same text. */
  rewrite: string;
}

export const PATTERNS: readonly ShapePattern[] = [
  {
    id: 'linear',
    source: 'a+',
    shown: '^a+$',
    mechanism: 'One loop, one way to read the text: the engine reads each letter once and fails at the end.',
    rewrite: 'a+',
  },
  {
    id: 'quadratic',
    source: 'a*a*b',
    shown: '^a*a*b$',
    mechanism: 'Two loops side by side can share the letters in many ways: the first takes k, the second takes the rest, and each split is tried before the missing b is reported.',
    rewrite: 'a*b',
  },
  {
    id: 'fibonacci',
    source: '(a|aa)+',
    shown: '^(a|aa)+$',
    mechanism: 'Two alternatives that overlap (a, and aa starting with a) let the same letters be cut into pieces of one or two in many ways, and the failure at the end sends the engine back through all of them.',
    rewrite: 'a+',
  },
  {
    id: 'exponential',
    source: '(a+)+',
    shown: '^(a+)+$',
    mechanism: 'A loop inside a loop can cut a run of letters into groups in every possible way, and the failure at the end makes the engine try each cut before giving up.',
    rewrite: 'a+',
  },
];

export const patternById = (id: PatternId): ShapePattern => PATTERNS.find((p) => p.id === id)!;

/** The anchored form of a dialect source, for display. */
export const anchored = (source: string): string => `^${source}$`;

const parsedCache = new Map<string, ParsedRegex>();
const machineCache = new Map<string, Construction>();

/** The parsed pattern; throws for a source the dialect refuses (the lesson's own sources never are). */
export function parsedOf(source: string): ParsedRegex {
  let p = parsedCache.get(source);
  if (!p) {
    const r = parsePattern(source);
    if (!r.ok) throw new Error(`${source}: ${r.error}`);
    p = r.value;
    parsedCache.set(source, p);
  }
  return p;
}

export function machineOf(source: string): Construction {
  let c = machineCache.get(source);
  if (!c) {
    c = constructionOf(parsedOf(source));
    machineCache.set(source, c);
  }
  return c;
}
