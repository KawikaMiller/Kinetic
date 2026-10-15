import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, ControlGroup, Provenance, ProvenanceRow } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { SCOPES } from './scopes';

export function ScopesScene({ picker }: { picker: ReactNode }) {
  const [open, setOpen] = useState(0);
  const scope = SCOPES[open];

  useIntroCaption(
    <>
      <b>{scope.title}</b>: exactly-once is {scope.honest ? <span className="hl ok">honestly true here</span> : <span className="hl bad">not something a broker can promise here</span>}. {scope.why}
    </>,
    [open],
  );

  return (
    <StageFrame
      height={300}
      controls={[
        <>
          {picker}
          <ControlGroup label="Scope" inline>
            {SCOPES.map((s, i) => (
              <ChipButton key={s.id} tone={s.honest ? 'ok' : 'bad'} size="md" on={open === i} onClick={() => setOpen(i)}>{s.title}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle>Where "exactly-once" is honestly true</SectionTitle>
          <table className="data-table eo-table">
            <thead>
              <tr><th scope="col">Scope</th><th scope="col">What commits together</th><th scope="col">Exactly-once?</th></tr>
            </thead>
            <tbody>
              {SCOPES.map((s, i) => (
                <tr key={s.id} className={i === open ? 'is-here' : ''}>
                  <th scope="row">{s.title}</th>
                  <td>{s.commits}</td>
                  <td className={s.honest ? 'is-ok' : 'is-bad'}>{s.honest ? '✓ yes, for the effect' : '✗ no, only at-least-once plus dedup'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <ClaimLabel kind="practice">the claim a stream engine's transactions advertise is about processing inside the system; check each product's documentation, no product is shown running</ClaimLabel>
          <Provenance kind="from-memory">what named products advertise is written from memory; none of it is run here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
