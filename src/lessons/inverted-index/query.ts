/**
 * inverted-index: reading a query and answering it by merging sorted posting lists. Pure.
 *
 * Syntax: words (combined by AND or OR, the caller's choice), `-word` to subtract a word's documents, and "two words" for a phrase
 * (a positional match). Parentheses, wildcards and other operators are not supported: they are treated like punctuation.
 */
import { tokenize, type Steps } from './analyzer';
import { docIds, postingsOf, type Index } from './postings';

export interface ParsedQuery {
  /** Plain words and phrases, as analyzed token lists (a word is a phrase of one token). */
  units: string[][];
  /** Words to subtract. */
  not: string[][];
  /** Things the learner should hear about: dropped stop words, unclosed quotes, a lone minus. */
  notes: string[];
}

/** Split a query into raw units: quoted phrases, `-word`s and plain words. */
export function parseQuery(text: string, steps: Steps): ParsedQuery {
  const units: string[][] = [];
  const not: string[][] = [];
  const notes: string[] = [];
  const pieces = [...text.matchAll(/"([^"]*)"|"([^"]*)$|(-?\S+)/g)];
  for (const m of pieces) {
    if (m[3] === undefined) {
      const quoted = m[1] ?? m[2] ?? '';
      if (m[1] === undefined) notes.push('A quote was never closed, so everything after it is read as one phrase.');
      const toks = tokenize(quoted, steps);
      if (quoted.trim() === '' || toks.length === 0) notes.push(quoted.trim() === '' ? 'An empty phrase "" matches nothing and was ignored.' : `The phrase "${quoted}" has only stop words, so it was ignored.`);
      else units.push(toks);
      continue;
    }
    const raw = m[3];
    const negated = raw.startsWith('-') && raw.length > 1;
    if (raw === '-') {
      notes.push('A lone - subtracts nothing: put a word right after it.');
      continue;
    }
    const toks = tokenize(negated ? raw.slice(1) : raw, steps);
    if (toks.length === 0) {
      notes.push(`"${negated ? raw.slice(1) : raw}" has nothing to look up (a stop word, or only punctuation), so it was ignored.`);
      continue;
    }
    // A word that splits into several tokens ("well-known") is a phrase of them.
    (negated ? not : units).push(toks);
  }
  return { units, not, notes };
}

export type Op = 'and' | 'or';
export type ListOrder = 'shortest-first' | 'as-typed';

/** One step of a two-list merge: which heads were compared, and what happened. */
export interface MergeStep {
  /** Index in the left and right list being compared (past the end for a tail copy). */
  i: number;
  j: number;
  kind: 'match' | 'left-behind' | 'right-behind' | 'tail';
  /** The output so far, after this step. */
  out: number[];
}

export type MergeKind = 'intersect' | 'union' | 'difference';

/** Merge two sorted lists the way a search engine does, recording every comparison as a step. */
export function mergeTrace(a: readonly number[], b: readonly number[], kind: MergeKind): MergeStep[] {
  const steps: MergeStep[] = [];
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      if (kind !== 'difference') out.push(a[i]);
      steps.push({ i, j, kind: 'match', out: [...out] });
      i++;
      j++;
    } else if (a[i] < b[j]) {
      if (kind !== 'intersect') out.push(a[i]);
      steps.push({ i, j, kind: 'left-behind', out: [...out] });
      i++;
    } else {
      if (kind === 'union') out.push(b[j]);
      steps.push({ i, j, kind: 'right-behind', out: [...out] });
      j++;
    }
  }
  if (kind !== 'intersect') {
    while (i < a.length) {
      out.push(a[i]);
      steps.push({ i, j, kind: 'tail', out: [...out] });
      i++;
    }
    if (kind === 'union') {
      while (j < b.length) {
        out.push(b[j]);
        steps.push({ i, j, kind: 'tail', out: [...out] });
        j++;
      }
    }
  }
  return steps;
}

/** The comparisons a merge makes: its steps that compared two heads (a tail copy compares nothing). */
export const comparisonsOf = (steps: readonly MergeStep[]): number => steps.filter((s) => s.kind !== 'tail').length;
export const resultOf = (steps: readonly MergeStep[]): number[] => steps.at(-1)?.out ?? [];

/** Documents in which the tokens occur next to each other, in order: a positional merge over the first token's documents. */
export function phraseDocs(index: Index, phrase: readonly string[]): number[] {
  if (phrase.length === 1) return docIds(index, phrase[0]);
  const first = postingsOf(index, phrase[0]);
  const rest = phrase.slice(1).map((t) => postingsOf(index, t));
  return first
    .filter((p) =>
      p.positions.some((pos) =>
        rest.every((list, k) => list.find((q) => q.doc === p.doc)?.positions.includes(pos + k + 1) ?? false),
      ),
    )
    .map((p) => p.doc);
}

export interface Evaluation {
  docs: number[];
  /** Comparisons of document ids made while merging, over every merge of the query. */
  comparisons: number;
  /** The merges in order, for drawing: the first one is animated. */
  merges: { kind: MergeKind; left: number[]; right: number[]; steps: MergeStep[] }[];
  /** The posting lists of each unit, in the order they were merged. */
  order: number[][];
}

/**
 * Answer the query: merge the units' document lists (AND intersects, shortest list first or in the order typed; OR unions), then
 * subtract the NOT words. An intersection that has gone empty stops the chain. With no positive unit the answer is empty.
 */
export function evaluate(index: Index, q: ParsedQuery, op: Op, order: ListOrder): Evaluation {
  const merges: Evaluation['merges'] = [];
  let comparisons = 0;
  const run = (left: number[], right: number[], kind: MergeKind): number[] => {
    const steps = mergeTrace(left, right, kind);
    merges.push({ kind, left, right, steps });
    comparisons += comparisonsOf(steps);
    return resultOf(steps);
  };
  const lists = q.units.map((u) => phraseDocs(index, u));
  const sequence = op === 'and' && order === 'shortest-first' ? lists.map((l, i) => ({ l, i })).sort((a, b) => a.l.length - b.l.length || a.i - b.i).map((x) => x.l) : lists;
  if (sequence.length === 0) return { docs: [], comparisons: 0, merges, order: [] };
  let acc = sequence[0];
  for (const list of sequence.slice(1)) {
    if (op === 'and' && acc.length === 0) break;
    acc = run(acc, list, op === 'and' ? 'intersect' : 'union');
  }
  for (const word of q.not) {
    if (acc.length === 0) break;
    acc = run(acc, phraseDocs(index, word), 'difference');
  }
  return { docs: acc, comparisons, merges, order: sequence };
}

/** How the query's documents were reached, in words, for an empty result: why nothing matched. */
export function whyEmpty(index: Index, q: ParsedQuery): string | null {
  if (q.units.length === 0) return q.not.length > 0 ? 'A query of only subtracted words has nothing to subtract from: add a word.' : 'Type a word to look up.';
  const unknown = q.units.filter((u) => phraseDocs(index, u).length === 0).map((u) => u.join(' '));
  return unknown.length > 0 ? `${unknown.map((u) => `"${u}"`).join(' and ')} ${unknown.length === 1 ? 'is' : 'are'} in no document.` : null;
}
