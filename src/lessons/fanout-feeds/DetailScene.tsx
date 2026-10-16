import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Provenance, ProvenanceRow } from '../../components/ui';
import { POP_SEED, detailEffect, initialDetail, populationFor, type Detail } from './init';

const DETAILS: { id: Detail; label: string }[] = [
  { id: 'inactive', label: 'Inactive users' },
  { id: 'deletes', label: 'Deletes and edits' },
  { id: 'ordering', label: 'Ordering' },
  { id: 'ranked', label: 'A ranked feed' },
];

export function DetailScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialDetail);
  const pop = useMemo(() => populationFor(POP_SEED), []);
  const d = detailEffect(pop, state.detail);

  return (
    <StageFrame
      height={300}
      intro={<>{d.title}: {d.effect}</>}
      introKey={state.detail}
      controls={
        <>
          {picker}
          {DETAILS.map((x) => (
            <ChipButton key={x.id} tone="info" on={state.detail === x.id} onClick={() => setState({ detail: x.id })}>{x.label}</ChipButton>
          ))}
          <Button onClick={() => setState(initialDetail())}>Reset</Button>
        </>
      }
    >
      <div className="ff-stage stage-pad">
        <Box>
          <SectionTitle>{d.title}</SectionTitle>
          <p className="ff-note">{d.effect}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={POP_SEED}>the effects are counted on the seeded population; the details themselves are named, not simulated further</Provenance>
          <Provenance kind="scripted">the inactive share (users whose id leaves a remainder of 0 or 1 when divided by 5) is fixed by the lesson</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
