import type { ReactNode } from 'react';
import { pctText } from '../../core/format';
import { pairText, type Mode, type Pair } from './bpe';
import type { StepReport } from './classic';
import type { TokenStats, TokenView } from './view';

export interface MergeView {
  path: readonly Pair[];
  last: StepReport | null;
  total: number;
  greedyTotal: number;
  /** The pair greedy would merge next and its count, or null. */
  next: { pair: Pair; count: number } | null;
}

export function mergeCaption(v: MergeView): ReactNode {
  if (!v.last) {
    return (
      <>
        Each word starts as its characters and an end marker {'</w>'}: {v.total} symbols in all. The most frequent adjacent pair is
        {v.next ? <> <b>{pairText(v.next.pair)}</b> ({v.next.count} times)</> : ' none'}; ties go to the lexicographically smaller pair, a rule the papers do not fix.
      </>
    );
  }
  const { last } = v;
  return (
    <>
      Merge {v.path.length}: <b>{pairText(last.picked)}</b> ({last.pickedCount} times) removed {last.removed} {last.removed === 1 ? 'symbol' : 'symbols'}.{' '}
      {last.isGreedy
        ? 'That was the most frequent pair.'
        : `The most frequent pair, ${pairText(last.greedy)} (${last.greedy.count} times), would have removed ${last.greedyRemoved}.`}{' '}
      The corpus is now {v.total} symbols; greedy merges after the same {v.path.length} steps would leave {v.greedyTotal}.
    </>
  );
}

export interface VocabView {
  merges: number;
  vocabulary: number;
  stats: TokenStats;
}

export function vocabCaption(v: VocabView): ReactNode {
  const s = v.stats;
  if (s.tokens === 0) return <>The text is empty: 0 tokens. Type something.</>;
  return (
    <>
      With {v.merges} {v.merges === 1 ? 'merge' : 'merges'} the vocabulary has {v.vocabulary} entries and your text is <b>{s.tokens}</b> tokens for {s.characters} characters, {s.charsPerToken!.toFixed(2)} characters per token.{' '}
      {s.words > 0 && <>{s.whole} of {s.words} {s.words === 1 ? 'word' : 'words'} stayed whole.</>}
    </>
  );
}

export function bytesCaption(mode: Mode, views: readonly TokenView[], characters: number, bytes: number): ReactNode {
  if (views.length === 0) return <>The text is empty: 0 tokens.</>;
  if (mode === 'chars') {
    const unknown = views.filter((v) => v.unknown).length;
    return unknown === 0
      ? <>Character mode: {characters} characters became {views.length} tokens, and every character was in the toy&apos;s alphabet.</>
      : <>Character mode: <b>{unknown}</b> of {views.length} tokens are {'<unk>'}: the toy never saw those characters, so the text they stood for is lost.</>;
  }
  return <>Byte mode: {characters} characters are {bytes} UTF-8 bytes, split into {views.length} tokens. Nothing is out of vocabulary: every byte has a symbol.</>;
}

export interface CostView {
  tokens: number;
  price: number;
  cost: number;
  window: number;
  share: number;
}

export function costCaption(v: CostView): ReactNode {
  return (
    <>
      {v.tokens.toLocaleString('en-US')} toy tokens at an illustrative {v.price} per million cost <b>{v.cost.toFixed(6)}</b>, and use {pctText(v.share, 1)} of a {v.window.toLocaleString('en-US')}-token window{v.share > 1 ? ': over the window' : ''}.
    </>
  );
}

export function lettersCaption(word: string, views: readonly TokenView[], target: string, truth: number): ReactNode {
  return (
    <>
      &quot;{word}&quot; has {truth} {truth === 1 ? 'copy' : 'copies'} of &quot;{target}&quot;, but the model would receive {views.length} {views.length === 1 ? 'id' : 'ids'}: {views.map((v) => `#${v.id}`).join(', ')}. An id says nothing about the
      letters inside its token; that is one reason, often cited, that letter questions are harder for a token model, and not the only one.
    </>
  );
}
