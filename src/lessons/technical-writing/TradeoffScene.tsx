import { useState, type ReactNode } from 'react';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import {
  DECISION, FACTS, SLOTS, WEAK_VERSION, chipById, chipsFor, factsUsed, missingSlots, paragraphOf, place, recommendationAt, verdictOf, wordsIn,
  type Assembly, type SlotId, type Verdict,
} from './tradeoff';

const VERDICT_TEXT: Record<Verdict, string> = {
  empty: 'Nothing placed yet: every slot is missing.',
  incomplete: 'Some slots are still missing.',
  weak: 'Every slot is filled, but some sentences do not do their slot\'s job.',
  strong: 'Every slot is filled with a sentence that does its job.',
};

export function TradeoffScene({ picker }: { picker: ReactNode }) {
  const [assembly, setAssembly] = useState<Assembly>({});
  const [checked, setChecked] = useState(false);
  const setCaption = useSetCaption();
  useIntroCaption(<>Fictional decision, four facts. Fill the five slots in order with one sentence each; the summary below reads them back as a reader would.</>);

  const missing = missingSlots(assembly);
  const used = factsUsed(assembly);
  const paragraph = paragraphOf(assembly);
  const verdict = verdictOf(assembly);
  const recAt = recommendationAt(paragraph);

  const choose = (id: string) => {
    const c = chipById(id);
    const next = place(assembly, id);
    setAssembly(next);
    setChecked(false);
    const slot = SLOTS.find((s) => s.id === c.slot)!;
    const left = missingSlots(next).length;
    setCaption(
      next[c.slot] ? (
        <>Placed in <b>{slot.label}</b>. {left === 0 ? 'All five slots are filled: press Check my summary.' : `${left} slot${left === 1 ? ' is' : 's are'} still missing.`}</>
      ) : (
        <>Took the sentence back out of <b>{slot.label}</b>: that slot is missing again.</>
      ),
    );
  };

  const reset = () => {
    setAssembly({});
    setChecked(false);
    setCaption(<>Cleared. All five slots are missing again.</>);
  };

  const check = () => {
    setChecked(true);
    setCaption(<>{VERDICT_TEXT[verdict]} {verdict === 'strong' ? 'Compare it with the weak version below: same facts, no pick.' : 'The notes under each slot say what is missing from a weak sentence.'}</>);
  };

  const slotNote = (id: SlotId) => {
    const chosen = assembly[id];
    if (!checked || !chosen) return null;
    const c = chipById(chosen);
    return <p className={`tw-note ${c.strong ? 'is-ok' : 'is-weak'}`}>{c.strong ? 'Does the job: it commits to something a reader can check.' : c.flaw}</p>;
  };

  return (
    <StageFrame
      height={460}
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={check} disabled={missing.length === SLOTS.length}>Check my summary</Button>
          <Button onClick={reset}>Clear</Button>
        </>,
      ]}
      stats={
        <Stats>
          <Stat label="Slots filled" value={`${SLOTS.length - missing.length} of ${SLOTS.length}`} />
          <Stat label="Words in your summary" value={wordsIn(paragraph)} />
          <Stat label="Recommendation at word" value={recAt ?? 'none'} />
        </Stats>
      }
    >
      <div className="tw-stage stage-pad">
        <Box variant="sunken">
          <SectionTitle hint="fictional scenario">{DECISION.title}</SectionTitle>
          <p className="tw-text">{DECISION.question}</p>
          <ul className="tw-facts" aria-label="The four facts">
            {FACTS.map((f) => (
              <li key={f.id} className={`tw-fact ${used.has(f.id) ? 'is-used' : ''}`}>
                <b>{f.label}</b>
                <span>{f.text}</span>
                <span className="tw-fact-state">{used.has(f.id) ? 'used in your summary' : 'not used yet'}</span>
              </li>
            ))}
          </ul>
        </Box>

        <div className="tw-slots">
          {SLOTS.map((s) => {
            const chosen = assembly[s.id];
            const judged = checked && chosen ? (chipById(chosen).strong ? 'is-strong' : 'is-weak') : '';
            return (
              <Tray key={s.id} stack className={`tw-slot ${chosen ? 'is-filled' : 'is-missing'} ${judged}`} label={`${s.label}: ${s.job}`}>
                <div className="tw-chip-col" role="group" aria-label={`${s.label} sentences`}>
                  {chipsFor(s.id).map((c) => (
                    <ChipButton
                      key={c.id}
                      tone={chosen === c.id ? (checked ? (c.strong ? 'ok' : 'orange') : 'info') : chosen ? 'dim' : 'muted'}
                      on={chosen === c.id}
                      onStyle="solid"
                      className="tw-sentence"
                      onClick={() => choose(c.id)}
                    >
                      {c.text}
                    </ChipButton>
                  ))}
                </div>
                {!chosen && <span className="tw-missing">missing: no sentence placed</span>}
                {slotNote(s.id)}
              </Tray>
            );
          })}
        </div>

        <div className="tw-compare">
          <Box>
            <SectionTitle hint={paragraph ? `${wordsIn(paragraph)} words` : undefined}>Your summary</SectionTitle>
            <p className="tw-text">{paragraph || 'Place a sentence in each slot to build the paragraph.'}</p>
            {missing.length > 0 && paragraph && <Hint block>Still missing: {missing.map((id) => SLOTS.find((s) => s.id === id)!.label.toLowerCase()).join(', ')}.</Hint>}
          </Box>
          <Box>
            <SectionTitle hint={`${wordsIn(WEAK_VERSION)} words`}>The weak version</SectionTitle>
            <p className="tw-text">{WEAK_VERSION}</p>
            <Hint block>Every fact is in there, and the reader still has to decide: it lists features and never picks, names a cost or says what would change the decision.</Hint>
          </Box>
        </div>
        <Hint block>Fictional scenario. The thresholds in the sentences (ten million rows, 200 ms) are made up for the lesson; a real summary would use your own measurements.</Hint>
      </div>
    </StageFrame>
  );
}
