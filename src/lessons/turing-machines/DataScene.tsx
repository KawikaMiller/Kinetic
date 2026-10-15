import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decodeTable, encodeTable, REFERENCE_MACHINES, TASKS, type TaskId } from './model';

const TASK_IDS: readonly TaskId[] = ['increment', 'palindrome'];

/** Scene 4: a transition table is also text, which a machine could read; and what the Church-Turing thesis does and does not claim. */
export function DataScene({ picker }: { picker: ReactNode }) {
  const [task, setTask] = useState<TaskId>('increment');
  const tm = REFERENCE_MACHINES[task];
  const line = encodeTable(tm);
  const roundTrips = encodeTable(decodeTable(line)) === line;
  const states = new Set(tm.rules.flatMap((r) => [r.state, r.next]));
  useIntroCaption(<>A machine is a finite table, so it can be written on one line of text: the same kind of symbols a tape holds.</>);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Rules" value={tm.rules.length} />
          <Stat label="States named" value={states.size} />
          <Stat label="Characters on the line" value={line.length} />
          <Stat label="Decodes back to the same table" value={roundTrips ? 'yes' : 'no'} color={roundTrips ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Machine" value={task} onChange={setTask} options={TASK_IDS.map((t) => ({ value: t, label: TASKS[t].label }))} />
        </>,
      ]}
    >
      <div className="tm stage-pad">
        <Box variant="sunken">
          <SectionTitle hint="rules joined by ;  each is state,read,write,move,next">The machine as one line of text</SectionTitle>
          <code className="tm-line">{line}</code>
        </Box>
        <div className="tm-cards">
          <Box>
            <SectionTitle>A table is data</SectionTitle>
            <p>
              Anything that can be written down finitely can be put on a tape. A machine that reads such a line and then imitates the machine it describes is the idea behind a universal machine, and behind the next lesson’s question about what machines can say about other machines. This page names the idea; it does not build one.
            </p>
          </Box>
          <Box>
            <SectionTitle>A thesis, not a theorem</SectionTitle>
            <p>
              The Church-Turing thesis says that this model captures what “effectively computable” means. It cannot be proved, because “effectively computable” is an informal idea; the evidence is that the other formalisations people have proposed, such as the lambda calculus, turned out to compute the same functions.
            </p>
            <ClaimLabel kind="standard">a thesis about an informal notion, widely accepted</ClaimLabel>
          </Box>
          <Box>
            <SectionTitle>Not a computer design</SectionTitle>
            <p>
              Real computers have random access memory and finite memory. The tape model trades that for something simple enough to reason about. The stay move <code>S</code> used here is a convenience: a machine without it can imitate one with it, so it adds no power.
            </p>
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">the one-line encoding is this lesson’s own format, not a standard one</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
