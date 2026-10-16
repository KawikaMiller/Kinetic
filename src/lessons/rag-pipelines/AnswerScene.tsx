import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { PREPARED, SIZE_MAX, SIZE_MIN, SIZE_STEP } from './chunker';
import { answerCaption } from './captions';
import { EVAL_QUESTIONS } from './corpus';
import { GROUNDING_THRESHOLD, type Verdict } from './generate';
import { runPipeline } from './pipeline';
import { PromptPanel } from './PromptPanel';
import { QuestionPicker } from './QuestionPicker';
import { ANSWER_DEFAULT, ANSWER_OVERLAP_PCT, ANSWER_SCORER, K_MAX, K_MIN } from './settings';

const questionText = (id: string) => EVAL_QUESTIONS.find((q) => q.id === id)!.text;
const VERDICT_LABEL: Record<Verdict, string> = { correct: 'right', wrong: 'wrong, and confident', abstained: 'no answer', nothing: 'no answer' };
const VERDICT_COLOR: Record<Verdict, string> = { correct: 'var(--ok)', wrong: 'var(--bad)', abstained: 'var(--orange)', nothing: 'var(--orange)' };

export function AnswerScene({ picker }: { picker: ReactNode }) {
  const [question, setQuestion] = useState(questionText(ANSWER_DEFAULT.question));
  const [size, setSize] = useState<number>(ANSWER_DEFAULT.size);
  const [k, setK] = useState<number>(ANSWER_DEFAULT.k);
  const [grounded, setGrounded] = useState<boolean>(ANSWER_DEFAULT.grounded);
  const run = useMemo(() => runPipeline(question, { size, overlapPct: ANSWER_OVERLAP_PCT, scorer: ANSWER_SCORER, k, grounded }), [question, size, k, grounded]);
  const caption = answerCaption(run, grounded);
  const a = run.answer;
  const citation = a.kind === 'answer' ? `${PREPARED[a.pick.chunk.docIndex].doc.title}, words ${a.pick.start + 1} to ${a.pick.end}` : null;

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Outcome" value={run.verdict ? VERDICT_LABEL[run.verdict] : 'typed question'} color={run.verdict ? VERDICT_COLOR[run.verdict] : undefined} sub={run.verdict ? 'judged against the gold sentence' : 'no gold sentence to judge against'} />
          <Stat label="Gold chunk retrieved" value={run.gold ? (run.goldHits.length > 0 ? 'yes' : 'no') : '–'} color={run.gold ? (run.goldHits.length > 0 ? 'var(--ok)' : 'var(--bad)') : undefined} sub={`top-${k} by TF-IDF`} />
          <Stat label="Grounding threshold" value={`${Math.round(GROUNDING_THRESHOLD * 100)}%`} sub="of the question's words" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'citation', shape: 'square' },
            { color: 'var(--ok)', label: 'right answer', shape: 'square' },
            { color: 'var(--bad)', label: 'wrong, confident answer', shape: 'square' },
            { color: 'var(--orange)', label: 'abstained: a different failure', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>{picker}<QuestionPicker question={question} onChange={setQuestion} /></>,
        <>
          <Toggle label="Grounding instruction" value={grounded} onChange={setGrounded} off="Off: answer anyway" on="On: abstain below the threshold" />
          <Slider label="Top k" value={k} min={K_MIN} max={K_MAX} onChange={setK} />
          <Slider label="Chunk size" value={size} min={SIZE_MIN} max={SIZE_MAX} step={SIZE_STEP} onChange={setSize} format={(v) => `${v} words`} />
        </>,
      ]}
    >
      <div className="rag-stage stage-pad">
        <Box>
          <SectionTitle hint="a scripted rule, not a language model">The stand-in answerer</SectionTitle>
          <div className={`rag-answer ${run.verdict ? `is-${run.verdict}` : ''}`} aria-live="polite">
            {a.kind === 'answer' && <><p className="rag-answer-text">{a.pick.text}</p><span className="rag-cite">{citation}</span></>}
            {a.kind === 'abstain' && <p className="rag-answer-text">Not found in the sources.</p>}
            {a.kind === 'none' && <p className="rag-answer-text">Nothing was retrieved, so there is nothing to answer from.</p>}
          </div>
          <Hint tone="muted" block>This describes the stand-in's rule, not any real model's behaviour: pick the context sentence sharing the most question words, cite its chunk, and (grounding on) abstain below {Math.round(GROUNDING_THRESHOLD * 100)}%.</Hint>
        </Box>
        <PromptPanel prompt={run.prompt} mark={(id) => (run.gold ? (run.goldHits.includes(id) ? 'ok' : 'bad') : null)} question={question} />
        <ProvenanceRow>
          <Provenance kind="scripted">scripted stand-in answerer, not a language model; behaviour invented so the pipeline's effects are reproducible</Provenance>
          <Provenance kind="toy">TF-IDF stand-in retrieval, not a neural embedding</Provenance>
          <Provenance kind="illustrative">invented documents, word counts stand in for tokens (see the tokenisation lesson), illustrative budget</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
