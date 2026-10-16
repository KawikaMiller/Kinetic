import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { namesOf } from './ir';
import { ssaView } from './model';
import { OPENING } from './opening';
import { SSA_PROGRAM, SSA_SOURCE } from './programs';
import { IrCode } from './IrCode';

const lineWord = (lines: number[]) => (lines.length === 1 ? `line ${lines[0] + 1}` : `lines ${lines.map((l) => l + 1).join(' and ')}`);

/** Scene 1: the same snippet before and after SSA, with every name assigned exactly once. */
export function SsaScene({ picker }: { picker: ReactNode }) {
  const [branchTaken, setBranchTaken] = useState(OPENING.ssa.branchTaken);
  const [selected, setSelected] = useState<string | null>(OPENING.ssa.selected);
  const view = useMemo(() => ssaView(branchTaken), [branchTaken]);
  const names = useMemo(() => namesOf(SSA_PROGRAM), []);
  const phiPick = branchTaken ? 'x2 (control came from then)' : 'x1 (control came from entry)';
  const where = selected ? view.where(selected) : null;

  const phiSentence = (
    <>
      With the branch {branchTaken ? 'taken' : 'not taken'}, both versions return {view.ssaResult}, and the phi in <code>x3</code> picks {phiPick}.
    </>
  );

  const describe = () => {
    if (!selected || !where) return null;
    if (where.def === null) return <>{selected} is a parameter, so its single definition is the function's entry. It is read on {lineWord(where.uses)}. {phiSentence}</>;
    return (
      <>
        {selected} is assigned once, on {lineWord([where.def])}
        {where.uses.length ? <>, and read on {lineWord(where.uses)}</> : <>, and never read</>}. A name that is assigned once answers "which assignment reaches this use" by itself. {phiSentence}
      </>
    );
  };

  return (
    <StageFrame
      height={380}
      intro={
        describe() ?? (
          <>
            {phiSentence} Click a name in the SSA listing to ring its definition and its uses.
          </>
        )
      }
      introKey={`${branchTaken}-${selected}`}
      stats={
        <Stats>
          <Stat label="As written" value={view.sourceResult} color="var(--info)" sub="the snippet evaluated directly" />
          <Stat label="In SSA" value={view.ssaResult} color="var(--info)" sub="run by the toy interpreter" />
          <Stat label="Same answer" value={view.sourceResult === view.ssaResult ? 'yes' : 'no'} color={view.sourceResult === view.ssaResult ? 'var(--ok)' : 'var(--bad)'} sub={`branch ${branchTaken ? 'taken' : 'not taken'}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a name: its definition and every use are ringed', shape: 'square' }]} />}
      controls={[
        picker,
        <>
          <Toggle label="The branch c" value={branchTaken} onChange={setBranchTaken} off="Not taken (c = 0)" on="Taken (c = 1)" />
          <Hint>Pick a name with Tab and Enter.</Hint>
        </>,
      ]}
    >
      <div className="co-stage stage-pad">
        <div className="co-two">
          <CodePanel className="co-code" title="As written (the name x is assigned twice)" lines={SSA_SOURCE} />
          <IrCode title="In SSA (each name assigned once)" lines={view.listing.lines} names={names} selected={selected} onSelect={setSelected} />
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy IR and interpreter written for this lesson, not any real compiler's output</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
