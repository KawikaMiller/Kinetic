import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { PREPARED, SIZE_MAX, SIZE_MIN, SIZE_STEP } from './chunker';
import { IDF_NOTE, cos, retrieveCaption } from './captions';
import { CONTEXT_BUDGET_WORDS } from './generate';
import { runPipeline } from './pipeline';
import { PromptPanel } from './PromptPanel';
import { QuestionPicker } from './QuestionPicker';
import { SCORERS, SCORER_LABEL } from './retrieval';
import { EVAL_QUESTIONS } from './corpus';
import { K_MAX, K_MIN, RETRIEVE_DEFAULT, RETRIEVE_OVERLAP_PCT } from './settings';

const SCORER_OPTIONS = SCORERS.map((s) => ({ value: s, label: SCORER_LABEL[s] }));
const questionText = (id: string) => EVAL_QUESTIONS.find((q) => q.id === id)!.text;

export function RetrieveScene({ picker }: { picker: ReactNode }) {
  const [question, setQuestion] = useState(questionText(RETRIEVE_DEFAULT.question));
  const [size, setSize] = useState<number>(RETRIEVE_DEFAULT.size);
  const [scorer, setScorer] = useState(RETRIEVE_DEFAULT.scorer);
  const [k, setK] = useState<number>(RETRIEVE_DEFAULT.k);
  const run = useMemo(() => runPipeline(question, { size, overlapPct: RETRIEVE_OVERLAP_PCT, scorer, k, grounded: false }), [question, size, scorer, k]);
  const custom = run.gold === null;
  const caption = retrieveCaption(run, k, scorer, custom);
  const { index, scores, top } = run.retrieval;
  const best = top.length ? scores[top[0]] : 0;
  const mark = (id: number) => (custom ? null : run.goldHits.includes(id) ? 'ok' : 'bad');

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Chunks indexed" value={index.chunks.length} sub={`${size} words each at most, no overlap`} />
          <Stat label="Gold in the top-k" value={custom ? '–' : run.goldHits.length > 0 ? 'yes' : 'no'} color={custom ? undefined : run.goldHits.length > 0 ? 'var(--ok)' : 'var(--bad)'} sub={custom ? 'a typed question has no gold sentence' : 'a chunk holding the whole gold sentence'} />
          <Stat label="Prompt" value={`${run.prompt.used} / ${CONTEXT_BUDGET_WORDS}`} color="var(--violet)" sub={run.prompt.cut > 0 ? `${run.prompt.cut} chunk${run.prompt.cut === 1 ? '' : 's'} cut` : 'everything retrieved fits'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'retrieved, holds the gold sentence', shape: 'square' },
            { color: 'var(--bad)', label: 'retrieved, does not', shape: 'square' },
            { color: 'var(--info)', label: 'score', shape: 'square' },
            { color: 'var(--violet)', label: 'prompt words used', shape: 'square' },
            { color: 'var(--dim)', label: 'struck: cut from the prompt', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>{picker}<QuestionPicker question={question} onChange={setQuestion} /></>,
        <>
          <Slider label="Top k" value={k} min={K_MIN} max={K_MAX} onChange={setK} />
          <Slider label="Chunk size" value={size} min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} onChange={setSize} format={(v) => `${v} words`} />
          <Segmented label="Scorer" value={scorer} onChange={setScorer} options={SCORER_OPTIONS} />
        </>,
      ]}
    >
      <div className="rag-stage stage-pad">
        <Box>
          <SectionTitle hint={question}>Retrieved chunks, best first</SectionTitle>
          {top.length === 0 ? (
            <p className="rag-empty">{run.retrieval.note === 'no-usable-words' ? 'No usable words in the question.' : 'Nothing scored above zero.'}</p>
          ) : (
            <ol className="rag-ranked">
              {top.map((id, rank) => {
                const m = mark(id);
                const c = index.chunks[id];
                return (
                  <li key={id} className={`rag-hit ${m ? `is-${m}` : ''}`}>
                    <span className="rag-rank">{rank + 1}</span>
                    <span className="rag-hit-title">{PREPARED[c.docIndex].doc.title}, words {c.start + 1} to {c.end}</span>
                    <Bar value={scores[id]} max={best} tone="info" height={6} label={<span className="rag-score">score {scorer === 'tfidf' ? cos(scores[id]) : scores[id].toFixed(2)}</span>} />
                  </li>
                );
              })}
            </ol>
          )}
          <Hint tone="muted" block>
            N is the number of chunks and df the number holding a word. TF-IDF weights a word by {IDF_NOTE.tfidf} and ranks by cosine. BM25 weights it by {IDF_NOTE.bm25}: the non-negative form that Lucene-style engines use, not the textbook Robertson form, which can go negative for a word in most chunks.
          </Hint>
        </Box>
        <PromptPanel prompt={run.prompt} mark={mark} question={question} />
        <ProvenanceRow>
          <Provenance kind="toy">TF-IDF stand-in, not a neural embedding: it scores shared words, so a paraphrase can miss</Provenance>
          <Provenance kind="illustrative">invented documents, word counts stand in for tokens, illustrative context budget</Provenance>
          <Provenance kind="from-memory">BM25 with k1 = 1.2 and b = 0.75 are the usual defaults: verify against the original papers or a textbook</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
