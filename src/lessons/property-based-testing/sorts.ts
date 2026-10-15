/**
 * The functions under test and the properties to check them with. Everything here is real
 * JavaScript that runs on every case; the bugs are lesson-authored on purpose. The `source`
 * lines are what the CodePanel shows, and a test runs them for real to prove they behave
 * exactly like the functions below.
 */

export type Sorter = (xs: number[]) => number[];

export type BugId = 'correct' | 'no-comparator' | 'dedupe' | 'insertion';

export interface Bug {
  id: BugId;
  label: string;
  fn: Sorter;
  source: readonly string[];
  /** Index in `source` of the line that is wrong, or null for the correct sort. */
  badLine: number | null;
  /** One plain sentence on what is wrong, shown once a test has failed. */
  flaw: string;
}

const numeric = (a: number, b: number) => a - b;

export const BUGS: readonly Bug[] = [
  {
    id: 'correct',
    label: 'Correct sort',
    fn: (xs) => [...xs].sort(numeric),
    source: ['function sort(xs) {', '  return [...xs].sort((a, b) => a - b);', '}'],
    badLine: null,
    flaw: 'Nothing: this one copies the array and sorts it numerically.',
  },
  {
    id: 'no-comparator',
    label: 'sort() with no comparator',
    fn: (xs) => [...xs].sort(),
    source: ['function sort(xs) {', '  return [...xs].sort();', '}'],
    badLine: 1,
    flaw: 'With no comparator, JavaScript sorts by string, so 10 comes before 2.',
  },
  {
    id: 'dedupe',
    label: 'Dedupes while sorting',
    fn: (xs) => [...new Set(xs)].sort(numeric),
    source: ['function sort(xs) {', '  return [...new Set(xs)].sort((a, b) => a - b);', '}'],
    badLine: 1,
    flaw: 'The Set drops repeated values, so the output is shorter than the input whenever a value repeats.',
  },
  {
    id: 'insertion',
    label: 'Insertion sort, off by one',
    fn: (xs) => {
      const a = [...xs];
      for (let i = 1; i < a.length; i++) {
        for (let j = i; j > 1 && a[j - 1] > a[j]; j--) {
          [a[j - 1], a[j]] = [a[j], a[j - 1]];
        }
      }
      return a;
    },
    source: [
      'function sort(xs) {',
      '  const a = [...xs];',
      '  for (let i = 1; i < a.length; i++) {',
      '    for (let j = i; j > 1 && a[j - 1] > a[j]; j--) {',
      '      [a[j - 1], a[j]] = [a[j], a[j - 1]];',
      '    }',
      '  }',
      '  return a;',
      '}',
    ],
    badLine: 3,
    flaw: 'The inner loop stops at index 1 instead of 0, so the first element is never moved, even when something smaller follows it.',
  },
];

export const bugOf = (id: BugId): Bug => BUGS.find((b) => b.id === id)!;

export type PropId = 'nondecreasing' | 'sameLength' | 'permutation' | 'idempotent' | 'reference';

export interface Property {
  id: PropId;
  label: string;
  /** `out` is the function's output for `xs`; `sort` is the function itself. */
  check: (xs: readonly number[], out: readonly number[], sort: Sorter) => boolean;
  source: readonly string[];
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** How many times each value occurs. */
function counts(xs: readonly number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of xs) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export const PROPERTIES: readonly Property[] = [
  {
    id: 'nondecreasing',
    label: 'non-decreasing',
    check: (_xs, out) => out.every((v, i) => i === 0 || out[i - 1] <= v),
    source: ['const nondecreasing = (xs, out) =>', '  out.every((v, i) => i === 0 || out[i - 1] <= v);'],
  },
  {
    id: 'sameLength',
    label: 'same length',
    check: (xs, out) => out.length === xs.length,
    source: ['const sameLength = (xs, out) => out.length === xs.length;'],
  },
  {
    id: 'permutation',
    label: 'same values (a permutation)',
    check: (xs, out) => {
      const a = counts(xs);
      const b = counts(out);
      return a.size === b.size && [...a].every(([v, n]) => b.get(v) === n);
    },
    source: ['const permutation = (xs, out) => {', '  const a = counts(xs), b = counts(out);', '  return a.size === b.size && [...a].every(([v, n]) => b.get(v) === n);', '};'],
  },
  {
    id: 'idempotent',
    label: 'idempotent',
    check: (_xs, out, sort) => same(sort([...out]), out),
    source: ['const idempotent = (xs, out) => same(sort(out), out);'],
  },
  {
    id: 'reference',
    label: 'equals a reference sort',
    check: (xs, out) => same(out, [...xs].sort(numeric)),
    source: ['const reference = (xs, out) =>', '  same(out, [...xs].sort((a, b) => a - b));'],
  },
];

export const propOf = (id: PropId): Property => PROPERTIES.find((p) => p.id === id)!;
export const ALL_PROPS: readonly PropId[] = PROPERTIES.map((p) => p.id);

/** The properties from `ids` that this output breaks, in menu order. */
export function failedProperties(ids: readonly PropId[], xs: readonly number[], sort: Sorter): PropId[] {
  const out = sort([...xs]);
  return PROPERTIES.filter((p) => ids.includes(p.id) && !p.check(xs, out, sort)).map((p) => p.id);
}
