import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Provenance, ProvenanceRow } from '../../components/ui';
import { LEAVES_OUT } from './leaves';
import type { SceneProps } from './opening';

/** Scene 3: what the toy leaves out. Each line says how much weight it can bear. */
export function LeavesScene({ picker }: SceneProps) {
  return (
    <StageFrame height={420} intro={LEAVES_OUT.caption} controls={[<>{picker}</>]}>
      <div className="iw-stage stage-pad">
        <ul className="iw-leaves">
          <li><ClaimLabel kind="practice">talking to people who will be affected before a meeting is a common way to avoid surprise</ClaimLabel></li>
          <li>
            <ClaimLabel kind="view">the practice is sometimes compared to nemawashi in Japanese organisations</ClaimLabel>
            <Provenance kind="from-memory">nemawashi, the idea of laying groundwork before a decision meeting; verify against a source on Japanese organisational practice</Provenance>
          </li>
          <li><ClaimLabel kind="view">informing and listening is not the same as manipulating, and this toy cannot tell them apart</ClaimLabel></li>
          <li><Provenance kind="invented">{LEAVES_OUT.plain}</Provenance></li>
        </ul>
        <ul className="iw-leaves-out">
          {LEAVES_OUT.missing.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <ProvenanceRow>
          <Provenance kind="invented">every number about people in this lesson is made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
