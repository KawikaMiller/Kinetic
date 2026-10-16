import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextArea } from '../../components/ui';
import { TokenChips } from './TokenChips';
import { vocabCaption } from './captions';
import { pairText } from './bpe';
import { PreparedNote } from './PreparedNote';
import { prepare } from './text';
import { vocabOpening } from './openings';
import { paragraphTokenizer, tokenStats, tokenViews } from './view';

const FIRST_MERGES = 8;

export function VocabScene({ picker }: { picker: ReactNode }) {
  const [merges, setMerges] = useState(vocabOpening().merges);
  const [typed, setTyped] = useState(vocabOpening().text);
  const full = paragraphTokenizer('chars');
  const tokenizer = useMemo(() => full.withMerges(merges), [full, merges]);
  const prepared = prepare(typed);
  const tokens = useMemo(() => tokenizer.encode(prepared.text), [tokenizer, prepared.text]);
  const views = useMemo(() => tokenViews(tokenizer, tokens), [tokenizer, tokens]);
  const stats = tokenStats(tokenizer, prepared.text);

  return (
    <StageFrame
      height={500}
      intro={vocabCaption({ merges, vocabulary: tokenizer.vocabulary.length, stats })}
      introKey={[merges, prepared.text]}
      stats={
        <Stats>
          <Stat label="Vocabulary" value={tokenizer.vocabulary.length} sub={`${tokenizer.baseSize} base symbols + ${merges} merges`} />
          <Stat label="Tokens" value={stats.tokens} sub={`${stats.characters} characters`} />
          <Stat label="Characters per token" value={stats.charsPerToken === null ? '–' : stats.charsPerToken.toFixed(2)} sub={`${stats.whole} of ${stats.words} words whole`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'tokens are coloured by position, not by meaning', shape: 'square' },
            { color: 'var(--bad)', label: '<unk>: a character the toy never saw', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Merges" value={merges} min={0} max={full.merges.length} format={(v) => `${v} (vocabulary ${full.baseSize + v})`} onChange={setMerges} />
        </>,
        <>
          <TextArea label="Type text to tokenize" value={typed} onChange={setTyped} rows={2} mono={false} spellCheck={false} />
        </>,
      ]}
    >
      <div className="tk-stage stage-pad">
        <TokenChips views={views} ariaLabel="Tokens of the typed text" />
        <p className="tk-note">
          The · at the end of a piece is the end-of-word marker. The encoder applies the learned merges <b>in the order they were learned</b> (rank order) and never counts pairs in your text: merge 1 first, then 2, and so on.
        </p>
        <section className="tk-panel" aria-label="The first merges learned">
          <h3 className="section-title">First {Math.min(FIRST_MERGES, merges)} of {merges} merges, in order</h3>
          {merges === 0 ? (
            <Hint tone="muted">No merges: every character is its own token.</Hint>
          ) : (
            <ol className="tk-merges">
              {tokenizer.merges.slice(0, FIRST_MERGES).map((m, i) => (
                <li key={i}>{pairText(m).replace('</w>', '·')}</li>
              ))}
            </ol>
          )}
        </section>
        <PreparedNote prepared={prepared} />
        <ProvenanceRow>
          <Provenance kind="toy">learned on a ~300-word paragraph written for this lesson, not any real model&apos;s tokenizer</Provenance>
          <Provenance kind="simulated">the merge list is computed once; the slider reads a prefix of it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
