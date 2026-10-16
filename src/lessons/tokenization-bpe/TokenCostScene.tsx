import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextArea, TextField } from '../../components/ui';
import { pctText } from '../../core/format';
import { TokenChips } from './TokenChips';
import { costCaption, lettersCaption } from './captions';
import { ILLUSTRATIVE_PRICE_PER_MILLION, ILLUSTRATIVE_WINDOWS, tokenCost } from './corpus';
import { costOpening } from './openings';
import { PreparedNote } from './PreparedNote';
import { prepare } from './text';
import { paragraphTokenizer, tokenViews } from './view';

export function TokenCostScene({ picker }: { picker: ReactNode }) {
  const open = costOpening();
  const [doc, setDoc] = useState(open.doc);
  const [windowSize, setWindowSize] = useState<number>(open.window);
  const [word, setWord] = useState(open.word);
  const [digits, setDigits] = useState(open.number);
  const tokenizer = paragraphTokenizer('bytes');

  const prepared = prepare(doc);
  const tokens = useMemo(() => tokenizer.encode(prepared.text).length, [tokenizer, prepared.text]);
  const cost = tokenCost(tokens, ILLUSTRATIVE_PRICE_PER_MILLION);
  const share = tokens / windowSize;
  const wordPrepared = prepare(word.replaceAll(' ', ''));
  const wordViews = useMemo(() => tokenViews(tokenizer, tokenizer.encode(wordPrepared.text)), [tokenizer, wordPrepared.text]);
  const numberPrepared = prepare(digits.replaceAll(' ', ''));
  const numberViews = useMemo(() => tokenViews(tokenizer, tokenizer.encode(numberPrepared.text)), [tokenizer, numberPrepared.text]);
  const target = 'e';
  const truth = Array.from(wordPrepared.text).filter((c) => c === target).length;

  return (
    <StageFrame
      height={540}
      intro={costCaption({ tokens, price: ILLUSTRATIVE_PRICE_PER_MILLION, cost, window: windowSize, share })}
      introKey={[tokens, windowSize]}
      stats={
        <Stats>
          <Stat label="Toy tokens" value={tokens.toLocaleString('en-US')} sub={`${Array.from(prepared.text).length.toLocaleString('en-US')} characters, byte alphabet`} />
          <Stat label="Cost" value={cost.toFixed(6)} sub={`illustrative currency units: ${tokens.toLocaleString('en-US')} × ${ILLUSTRATIVE_PRICE_PER_MILLION} / 1,000,000`} />
          <Stat label="Of the window" value={pctText(share, 1)} color={share > 1 ? 'var(--bad)' : undefined} sub={`${windowSize.toLocaleString('en-US')} tokens (illustrative)`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'document fits the window', shape: 'square' },
            { color: 'var(--bad)', label: 'over the window', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Context window" options={ILLUSTRATIVE_WINDOWS.map((w) => ({ value: w, label: w.toLocaleString('en-US') }))} value={windowSize} onChange={setWindowSize} />
        </>,
        <>
          <TextArea label="Document" value={doc} onChange={setDoc} rows={3} mono={false} spellCheck={false} />
        </>,
        <>
          <TextField label="A word to count letters in" value={word} onChange={setWord} width={150} spellCheck={false} />
          <TextField label="A long number" value={digits} onChange={setDigits} width={170} spellCheck={false} />
        </>,
      ]}
    >
      <div className="tk-stage stage-pad">
        <Bar value={Math.min(tokens, windowSize)} max={windowSize} tone={share > 1 ? 'bad' : 'ok'} height={12} animate={false} label="Context budget used" trailing={pctText(share, 1)} />
        <PreparedNote prepared={prepared} />
        <div className="tk-row">
          <section className="tk-panel" aria-label="Counting letters">
            <h3 className="section-title">What this toy tokenizer gives for a word</h3>
            <TokenChips views={wordViews} ariaLabel="Tokens of the word" />
            <p className="tk-note">{lettersCaption(wordPrepared.text, wordViews, target, truth)}</p>
          </section>
          <section className="tk-panel" aria-label="Splitting a number">
            <h3 className="section-title">A long number, split by the merges this toy learned</h3>
            <TokenChips views={numberViews} ariaLabel="Tokens of the number" />
            <p className="tk-note">The pieces depend on the text the tokenizer learned from: this toy saw only a few digits, so it cuts a number into {numberViews.length} {numberViews.length === 1 ? 'piece' : 'pieces'}, and a tokenizer fitted to other text would cut it differently.</p>
          </section>
        </div>
        <ProvenanceRow>
          <Provenance kind="illustrative">the price per million tokens and the window sizes are made up, not any provider&apos;s</Provenance>
          <Provenance kind="toy">token counts are this toy&apos;s; a real tokenizer would count the same text differently</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
