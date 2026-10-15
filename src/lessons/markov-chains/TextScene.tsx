import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from '../../components/Bar';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextArea } from '../../components/ui';
import { pctText } from '../../core/format';
import {
  CORPORA, DEFAULT_CORPUS, MAX_WORDS, MAX_WORD_LENGTH, buildChain, generateSentences, inCorpus, nextWords, parseCorpus, sameWordTwoHistories, sentenceText,
} from './textChain';
import { textCaption } from './text';

const SCENE_SEED = 3;
const TABLE_WORDS = 8;

export function TextScene({ picker }: { picker: ReactNode }) {
  const [raw, setRaw] = useState(DEFAULT_CORPUS);
  const [accepted, setAccepted] = useState(DEFAULT_CORPUS);
  const [seed, setSeed] = useState(SCENE_SEED);
  const [look, setLook] = useState<string | null>(null);
  const checked = parseCorpus(raw);
  const parsed = useMemo(() => {
    const r = parseCorpus(accepted);
    return r.ok ? r.value : [];
  }, [accepted]);
  const chain = useMemo(() => buildChain(parsed), [parsed]);
  const sentences = useMemo(() => generateSentences(chain, seed), [chain, seed]);
  const fresh = sentences.filter((s) => !inCorpus(chain, s)).length;
  const wordCount = chain.sentences.flat().length;
  const focus = chain.words.includes(look ?? '') ? look! : chain.words[0];
  const rows = focus ? nextWords(chain, focus) : [];
  const two = useMemo(() => sameWordTwoHistories(chain), [chain]);

  const type = (text: string) => {
    setRaw(text);
    if (parseCorpus(text).ok) setAccepted(text);
  };
  const pick = (text: string) => {
    setRaw(text);
    setAccepted(text);
  };

  return (
    <StageFrame
      height={420}
      intro={textCaption(wordCount, chain.words.length, fresh, sentences.length)}
      introKey={[accepted, seed]}
      stats={
        <Stats>
          <Stat label="Words in the corpus" value={wordCount} sub={`${chain.words.length} different: the states`} />
          <Stat label="New sentences" value={`${fresh} of ${sentences.length}`} color="var(--info)" sub="not in the corpus" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the word you are looking at', shape: 'dot' },
            { color: 'var(--info)', label: 'chance of a next word' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Corpus" inline>
            {CORPORA.map((c) => (
              <ChipButton key={c.id} tone="info" on={accepted === c.text} onClick={() => pick(c.text)}>
                {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <TextArea label={`Your corpus (up to ${MAX_WORDS} words, words up to ${MAX_WORD_LENGTH} letters)`} value={raw} onChange={type} rows={3} mono={false} ariaLabel="Corpus text" className="mc-corpus" />
          {checked.ok ? <Hint>Sentences end at . ! or ?; words are lower-cased.</Hint> : <Hint tone="muted" block>{checked.error} Showing the last corpus that was accepted.</Hint>}
        </>,
      ]}
    >
      <div className="mc-stage stage-pad">
        <div className="mc-visual">
          <h4 className="mc-title">Five sentences the chain writes (seed {seed})</h4>
          <ol className="mc-sentences">
            {sentences.map((s, i) => (
              <li key={i} className={inCorpus(chain, s) ? undefined : 'is-new'}>
                {s.length === 0 ? '(nothing)' : sentenceText(s)} {!inCorpus(chain, s) && <span className="mc-new">new</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="mc-visual">
          <h4 className="mc-title">What follows a word</h4>
          <div className="mc-chips">
            {chain.words.slice(0, TABLE_WORDS).map((w) => (
              <ChipButton key={w} tone="hi" on={w === focus} onClick={() => setLook(w)}>
                {w}
              </ChipButton>
            ))}
          </div>
          <table className="mc-next" aria-label={`Words that follow ${focus ?? 'nothing'}`}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.word}>
                  <th scope="row">{r.word}</th>
                  <td>{pctText(r.probability)}</td>
                  <td className="mc-bar-cell"><Bar value={r.probability} max={1} tone="info" height={8} animate={false} ariaLabel={`${r.word}: ${pctText(r.probability)}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mc-visual">
          <h4 className="mc-title">What the chain forgets</h4>
          {two ? (
            <p className="mc-note">
              <b>{two.word}</b> is reached here by two different histories: <i>{sentenceText(two.histories[0])}</i> and <i>{sentenceText(two.histories[1])}</i>. The chain keeps only the word it is on, so both draw the next word from the same row.
            </p>
          ) : (
            <p className="mc-note">No word in this corpus follows two different words, so there is no pair of histories to compare.</p>
          )}
          <p className="mc-note">Drift is the price: it cannot remember a subject from three words ago. Real language models condition on far more than the last word; this is a toy first-order chain. A web surfer following random links is a chain too, which is where <Link to="/lesson/eigen-pagerank">PageRank</Link> comes from.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>a seeded walk on a bigram chain built from the corpus above</Provenance>
        <Provenance kind="illustrative">the corpus is invented, written for this lesson</Provenance>
        <Provenance kind="toy">a first-order word chain, not a model of how real language models work</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
