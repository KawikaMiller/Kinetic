import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { PrincipleId } from './acm';
import { CODE_PRINCIPLES, EFFECTS, LENSES, NOTICED, OPTIONS, SCENARIO, STAKEHOLDERS, TENSION, type LensId, type OptionId, type StakeholderId } from './lenses';
import { PrincipleChips } from './PrincipleChips';
import { IMPACT_TONE, IMPACT_WORD } from './tones';

/** The reasoning exercise: stakeholders, options, effects, and four lenses. It has no score and no verdict. */
export function LensScene({ picker }: { picker: ReactNode }) {
  const [counted, setCounted] = useState<StakeholderId[]>(['users']);
  const [option, setOption] = useState<OptionId>('all');
  const [lens, setLens] = useState<LensId>('consequences');
  const [openPrinciple, setOpenPrinciple] = useState<PrincipleId | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>A reasoning exercise, not a test. Decide who is affected, look at an option, then look at it through a lens. Lenses ask questions; they do not output an answer.</>);

  const optionLabel = OPTIONS.find((o) => o.id === option)!.label;
  const lensDef = LENSES.find((l) => l.id === lens)!;
  const toggle = (id: StakeholderId) => {
    const next = counted.includes(id) ? counted.filter((x) => x !== id) : [...counted, id];
    setCounted(next);
    const label = STAKEHOLDERS.find((s) => s.id === id)!.label;
    setCaption(<>{counted.includes(id) ? 'Removed' : 'Added'} <b>{label}</b>. {next.length} of {STAKEHOLDERS.length} stakeholders counted; the ones you skip are still affected.</>);
  };
  const chooseOption = (id: OptionId) => {
    setOption(id);
    setCaption(<>Option: <b>{OPTIONS.find((o) => o.id === id)!.label}</b>. {OPTIONS.find((o) => o.id === id)!.summary}</>);
  };
  const chooseLens = (id: LensId) => {
    setLens(id);
    setCaption(<>{LENSES.find((l) => l.id === id)!.what}</>);
  };

  const shown = STAKEHOLDERS.filter((s) => counted.includes(s.id));
  const skipped = STAKEHOLDERS.filter((s) => !counted.includes(s.id));

  return (
    <StageFrame height={380} controls={[<>{picker}<Hint>Fictional scenario; every effect is authored for the lesson, not measured.</Hint></>]}>
      <div className="ce-stage stage-pad">
        <Box variant="sunken" className="ce-honesty" role="note">
          <b>{SCENARIO.title}</b>
          <p>{SCENARIO.text}</p>
        </Box>

        <Box>
          <SectionTitle hint="who is affected?">1 · Stakeholders</SectionTitle>
          <div className="ce-chip-row">
            {STAKEHOLDERS.map((s) => (
              <ChipButton key={s.id} tone="sky" on={counted.includes(s.id)} onStyle="solid" onClick={() => toggle(s.id)}>
                {s.label}
              </ChipButton>
            ))}
          </div>
          <ul className="ce-list">
            {shown.map((s) => (
              <li key={s.id}>
                <b>{s.label}:</b> {s.stake}
              </li>
            ))}
          </ul>
          {skipped.length > 0 && (
            <Hint block>
              Not counted yet, but still affected: {skipped.map((s) => s.label.toLowerCase()).join('; ')}.
            </Hint>
          )}
        </Box>

        <Box>
          <SectionTitle hint="what could we do?">2 · Options</SectionTitle>
          <div className="ce-choices" role="group" aria-label="Options">
            {OPTIONS.map((o) => (
              <ChipButton key={o.id} tone="info" size="md" on={option === o.id} onStyle="solid" className="ce-choice" onClick={() => chooseOption(o.id)}>
                {o.label}
              </ChipButton>
            ))}
          </div>
        </Box>

        <Box>
          <SectionTitle hint={`${optionLabel.toLowerCase()}`}>3 · What changes for the people you counted</SectionTitle>
          {shown.length === 0 ? (
            <p className="empty-note">Count at least one stakeholder to see what changes for them.</p>
          ) : (
            <table className="data-table ce-effects">
              <thead>
                <tr>
                  <th>Stakeholder</th>
                  <th>Effect (authored)</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const e = EFFECTS[option][s.id];
                  return (
                    <tr key={s.id}>
                      <td data-label="Stakeholder">
                        <b>{s.label}</b>
                      </td>
                      <td data-label="Effect">
                        <span className={`chip tone-${IMPACT_TONE[e.tone]}`}>{IMPACT_WORD[e.tone]}</span> {e.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Hint block>There is no total row on purpose: a count hides how severe, how likely and how reversible each effect is.</Hint>
        </Box>

        <Box>
          <SectionTitle hint="a lens is a set of questions">4 · Look through a lens</SectionTitle>
          <div className="ce-chip-row">
            {LENSES.map((l) => (
              <ChipButton key={l.id} tone="violet" on={lens === l.id} onStyle="solid" onClick={() => chooseLens(l.id)}>
                {l.label}
              </ChipButton>
            ))}
          </div>
          <p className="ce-text">{lensDef.what}</p>
          <ul className="ce-list">
            {lensDef.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="ce-text">
            <b>What this lens notices about this option:</b> {NOTICED[option][lens]}
          </p>
          {lens === 'code' && (
            <PrincipleChips ids={CODE_PRINCIPLES} open={openPrinciple} onToggle={(id) => setOpenPrinciple(openPrinciple === id ? null : id)} />
          )}
          <p className="ce-text">
            <b>Where the lenses can pull apart:</b> {TENSION[option]}
          </p>
          <Hint block>
            Lenses come from moral philosophy and professional ethics, and each has many variants. They help you ask better questions; the
            decision is still yours.
          </Hint>
        </Box>
      </div>
    </StageFrame>
  );
}
