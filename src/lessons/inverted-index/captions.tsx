/**
 * inverted-index: every caption, built from the model on screen.
 */
import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import type { Steps } from './analyzer';
import type { Index } from './postings';
import { termsOf } from './postings';
import type { Evaluation, ListOrder, Op } from './query';
import type { Scored, Ranker } from './rank';
import type { Sizes } from './vbyte';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

const stepNames = (s: Steps): string => {
  const on = [s.lowercase && 'lowercase', 'split', s.stopWords && 'drop stop words', s.stem && 'toy stemmer'].filter(Boolean);
  return on.join(', ');
};

export function buildCaption(index: Index): ReactNode {
  const terms = termsOf(index);
  const total = [...index.postings.values()].reduce((n, l) => n + l.length, 0);
  if (index.n === 0) return <>The corpus is empty: there is nothing to index. Add a document.</>;
  return (
    <>
      {hl('', index.n)} {noun(index.n, 'document')} become {hl('violet', terms.length)} {noun(terms.length, 'term')} and {total} {noun(total, 'posting')}: each term points at the documents that hold it, sorted by document id. The analyzer ran {stepNames(index.steps)}.
    </>
  );
}

export function queryCaption(o: { e: Evaluation; op: Op; order: ListOrder; other: number; notes: string[]; empty: string | null }): ReactNode {
  const { e } = o;
  if (o.empty) return <>{o.empty} {o.notes.join(' ')}</>;
  return (
    <>
      The query reads {hl('', e.order.length)} {noun(e.order.length, 'posting list')} and merges them {o.op === 'and' ? 'by intersection' : 'by union'}, {o.order === 'shortest-first' && o.op === 'and' ? 'shortest list first' : 'in the order typed'}: {hl('info', `${e.comparisons} ${noun(e.comparisons, 'comparison')}`)}, {hl(e.docs.length ? 'ok' : 'bad', e.docs.length === 0 ? 'no documents' : `${e.docs.length} ${noun(e.docs.length, 'document')}`)}.{' '}
      {o.op === 'and' && e.order.length > 1 ? <>The other order would take {o.other}. </> : null}No document text is scanned: only the lists are read.
    </>
  );
}

export function rankCaption(o: { ranker: Ranker; top: Scored | null; matches: number; k1: number; b: number }): ReactNode {
  if (!o.top) return <>Nothing matches, so there is nothing to rank.</>;
  const how = o.ranker === 'bm25'
    ? <>BM25 with k1 = {decimal(o.k1, 1)} and b = {decimal(o.b, 2)}: b = 0 ignores a document's length and b = 1 fully normalises by it, and a smaller k1 makes a repeated term saturate sooner.</>
    : <>TF-IDF is tf times ln(N / n): a term every document holds counts for nothing, and a repeated term keeps adding.</>;
  return (
    <>
      {o.matches} {noun(o.matches, 'document')} match; {hl('ok', `d${o.top.doc}`)} ranks first with {hl('info', decimal(o.top.score, 4))}. {how}
    </>
  );
}

export function compressCaption(o: { count: number; sizes: Sizes; source: string }): ReactNode {
  const save = (n: number) => `${Math.round((1 - n / o.sizes.fixed) * 100)}%`;
  return (
    <>
      {o.source}: {o.count} {noun(o.count, 'id')} take {hl('bad', `${o.sizes.fixed} bytes`)} at 4 bytes each, {hl('info', `${o.sizes.ids} bytes`)} as variable-byte ids and {hl('ok', `${o.sizes.gaps} bytes`)} as variable-byte gaps: gaps save {save(o.sizes.gaps)}, because small numbers need fewer 7-bit groups.
    </>
  );
}
