import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useIntroCaption } from '../../core/caption';
import { ClaimLabel, ChipButton, ControlGroup, Provenance, ProvenanceRow } from '../../components/ui';
import { CARDS } from './cards';

/** Scene 5: four short cards on what WebAssembly is not. */
export function CardsScene({ picker }: { picker: ReactNode }) {
  const [open, setOpen] = useState(CARDS[0].id);
  const card = CARDS.find((c) => c.id === open) ?? CARDS[0];
  useIntroCaption(<>{card.title}.</>, [card.id]);
  return (
    <StageFrame
      height={420}
      controls={[
        <>
          {picker}
          <ControlGroup label="Card" inline>
            {CARDS.map((c) => (
              <ChipButton key={c.id} tone="violet" on={open === c.id} onClick={() => setOpen(c.id)}>{c.short}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="wa stage-pad">
        <Box>
          <SectionTitle>{card.title}</SectionTitle>
          <p className="wa-note">{card.text}</p>
          <ClaimLabel kind={card.claim}>{card.note}</ClaimLabel>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">toolchain names and what other runtimes exist are from memory: check the projects’ own documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
