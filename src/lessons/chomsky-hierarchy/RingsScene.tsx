import { useState, type ReactNode } from 'react';
import { ClassifyBoard, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { classifyScore, emptyClassify, sortedCount } from '../../core/classify';
import { ringsCaption } from './captions';
import { evidenceFor } from './evidence';
import { CARDS, KEY, RINGS, cardById, decide, inputError, type CardId, type RingId } from './languages';
import { MAX_TEST_INPUT, OPENING } from './opening';
import { RingsDiagram } from './RingsDiagram';

const ITEMS: ClassifyItem[] = CARDS.map((c) => ({
  id: c.id,
  label: c.label,
  text: c.label,
  explanation: (
    <>
      {c.label}: {c.definition}. {c.machine ? <>Decided by a {c.machine}.</> : <>No machine decides it: this lesson only labels it.</>}
    </>
  ),
}));
const CATEGORIES = RINGS.map((r) => ({ id: r.id, label: `${r.label}` }));
const TESTABLE = CARDS.filter((c) => c.machine !== null);

/** Scene 1: sort ten languages into the five rings, with a run as the answer to a wrong placement, and a tester for the machines. */
export function RingsScene({ picker }: { picker: ReactNode }) {
  const [board, setBoard] = useState(() => emptyClassify(ITEMS));
  const [cardId, setCardId] = useState<CardId>(OPENING.rings.tester.card);
  const [input, setInput] = useState(OPENING.rings.tester.input);
  const total = ITEMS.length;
  const sorted = sortedCount(ITEMS, board.answers);
  const correct = classifyScore(ITEMS, KEY, board.answers);
  const card = cardById(cardId);
  const tooLong = input.length > MAX_TEST_INPUT;
  const refusal = tooLong ? null : inputError(card, input);
  const decision = tooLong || refusal ? null : decide(card, input);

  return (
    <StageFrame
      height={620}
      intro={ringsCaption({ sorted, checked: board.checked, correct, total })}
      introKey={`${sorted}-${board.checked}-${correct}`}
      stats={
        <Stats>
          <Stat label="Placed" value={`${sorted} of ${total}`} color="var(--info)" sub="cards in a ring" />
          <Stat label="Smallest ring" value={board.checked ? `${correct} of ${total}` : 'not checked'} color={board.checked ? (correct === total ? 'var(--ok)' : 'var(--hi)') : undefined} sub="after Check" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'right ring', shape: 'square' },
            { color: 'var(--bad)', label: 'wrong ring', shape: 'square' },
            { color: 'var(--amber)', label: 'rings are plain categories', shape: 'square' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="ch-stage stage-pad">
        <RingsDiagram cards={CARDS} answers={board.answers} checked={board.checked} />
        <ClassifyBoard items={ITEMS} categories={CATEGORIES} answerKey={KEY} value={board} onChange={setBoard} status="off" />
        {board.checked ? (
          <div className="ch-evidence" role="region" aria-label="What the runs show for the wrong placements">
            {CARDS.map((c) => {
              const e = evidenceFor(c, (board.answers[c.id] as RingId | null) ?? null);
              if (e.relation === 'right' || e.relation === 'unsorted') return null;
              return (
                <div key={c.id} className="ch-evidence-row">
                  <b>{c.label}</b> in {RINGS.find((r) => r.id === board.answers[c.id])!.label.toLowerCase()}:
                  {e.lines.map((line) => (
                    <p key={line} className="ch-note">
                      {line}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="ch-tester">
          <ControlGroup label="Test a string on">
            {TESTABLE.map((c) => (
              <ChipButton key={c.id} tone="info" on={c.id === cardId} onClick={() => setCardId(c.id)}>
                {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <TextField label={`String (up to ${MAX_TEST_INPUT})`} value={input} onChange={setInput} width={220} spellCheck={false} maxLength={40} />
          <Hint tone="muted" block>
            <span role="status" aria-live="polite">
              {tooLong ? (
                <span className="ch-error">That is {input.length} characters; the limit is {MAX_TEST_INPUT}.</span>
              ) : refusal ? (
                <span className="ch-error">{refusal}</span>
              ) : decision ? (
                <>
                  {decision.detail}: <b>{decision.verdict === 'accepted' ? 'accepted' : decision.verdict === 'rejected' ? 'rejected' : 'did not finish within its budget'}</b>.
                </>
              ) : null}
            </span>
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">machines built for this page; the class facts are textbook results (verify against Sipser, Introduction to the Theory of Computation)</Provenance>
        <Provenance kind="from-memory">that unary context-free languages are regular, and that the halting language is recursively enumerable but not decidable</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
