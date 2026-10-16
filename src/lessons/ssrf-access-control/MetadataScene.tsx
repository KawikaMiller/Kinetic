import { useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { metadataCaption } from './captions';
import { blastRadius, exposure, type Hardening } from './metadata';
import { OPENING } from './opening';

/** Scene 2: the metadata service is the prize; three ways to shrink what a reach of it gets. */
export function MetadataScene({ picker }: { picker: ReactNode }) {
  const [h, setH] = useState<Hardening>(OPENING.metadata);
  const e = exposure(h);
  const radius = blastRadius(h);
  const set = (patch: Partial<Hardening>) => setH((cur) => ({ ...cur, ...patch }));

  const lines = [
    { text: '1. The preview server is made to ask the metadata service directly (no other defence is on in this scene).', tone: 'orange' as const },
    e.kind === 'refused'
      ? { text: e.by === 'token' ? '2. Refused: the service wants a session token, obtained with a request type this feature cannot make.' : '2. Refused: the reply cannot cross the extra network hop from the container.', tone: 'ok' as const }
      : { text: `2. The service answers with the machine role's temporary credential (fake): ${e.value}`, tone: 'bad' as const },
    ...(e.kind === 'credential' ? [{ text: `3. That ${e.scope} role could: ${e.can.join(', ')}.`, tone: 'bad' as const }] : []),
  ];

  return (
    <StageFrame
      height={520}
      intro={metadataCaption(h)}
      introKey={`${h.token}|${h.hopLimit}|${h.leastPrivilege}`}
      stats={
        <Stats>
          <Stat label="Leaked credential could do" value={radius} color={radius ? 'var(--bad)' : 'var(--ok)'} sub={radius ? 'things, with the role it was issued for' : 'nothing: no credential came back'} />
          <Stat label="Credential" value={e.kind === 'credential' ? e.scope : 'none'} color={e.kind === 'credential' ? 'var(--bad)' : 'var(--ok)'} sub={e.kind === 'credential' ? 'fake, labelled as such' : 'the request was refused'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'the server\'s own fetch', shape: 'square' }, { color: 'var(--bad)', label: 'a credential came back', shape: 'square' }, { color: 'var(--ok)', label: 'refused', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Session token required" value={h.token} onChange={(token) => set({ token })} off="off" on="on" />
          <Toggle label="Hop limit, server in a container" value={h.hopLimit} onChange={(hopLimit) => set({ hopLimit })} off="off" on="on" />
          <Toggle label="Least-privilege role" value={h.leastPrivilege} onChange={(leastPrivilege) => set({ leastPrivilege })} off="off" on="on" />
        </>,
      ]}
    >
      <div className="ssrf-stage stage-pad">
        <p className="ssrf-note">Why it is the prize: the metadata service can hand a machine's temporary role credentials to whoever asks from that machine, so a fetch feature that can be pointed at it can be made to ask. The fixes either stop the ask, or make what comes back small.</p>
        <ConsolePanel lines={lines} title="what happens" />
        <p className="ssrf-note">The least-privilege role is the same idea as the IAM least-privilege lesson: it does not stop the leak, it makes the leak small.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">a toy machine; the credential is fake and nothing is requested from any service</Provenance>
        <Provenance kind="from-memory">AWS's second-generation metadata service (IMDSv2) uses a session token and a hop limit for this; check the AWS documentation for the exact behaviour and defaults</Provenance>
        <ClaimLabel kind="practice">taking the ask away and shrinking the answer are both done in real deployments</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
