import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { dedupeCaption } from './captions';
import {
  AMOUNT, BROKER, CONSUMER, CRASH_LABEL, CRASH_POINTS, DESIGNS, DESIGN_LABEL, crashTable, runCrashPoint, type CrashPoint, type DedupeDesign, type DedupeMsg,
} from './dedupe';

const DESIGN_OPTIONS = DESIGNS.map((d) => ({ value: d, label: DESIGN_LABEL[d] }));
const ACTORS = [{ id: 'client', label: 'producer' }, { id: BROKER, label: 'broker' }, { id: CONSUMER, label: 'consumer' }];
const label = (p: DedupeMsg): string => (p.type === 'publish' ? 'publish' : p.type === 'deliver' ? 'deliver' : 'ack');

export function DedupeScene({ picker }: { picker: ReactNode }) {
  const [design, setDesign] = useState<DedupeDesign>('separate');
  const [point, setPoint] = useState<CrashPoint>('gap');
  const table = useMemo(() => crashTable(), []);
  const run = useMemo(() => runCrashPoint(design, point), [design, point]);
  const sequence = useMemo(() => toSequence(run.cluster.trace, { actors: ACTORS, label, events: true, times: true }), [run]);
  const { outcome } = run;

  useIntroCaption(dedupeCaption({ design, point, outcome }), [design, point]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Effect applied" value={`${outcome.applied} ${outcome.applied === 1 ? 'time' : 'times'}`} color={outcome.applied > 1 ? 'var(--bad)' : 'var(--ok)'} sub={`balance += ${AMOUNT} for message 1`} />
          <Stat label="Balance" value={outcome.balance} color={outcome.balance > AMOUNT ? 'var(--bad)' : undefined} sub={`should be ${AMOUNT}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'the crash point you chose' },
            { color: 'var(--bad)', label: 'a duplicate effect' },
            { color: 'var(--ok)', label: 'applied once' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Consumer records the id" value={design} onChange={setDesign} options={DESIGN_OPTIONS} />
        </>,
        <>
          <ControlGroup label="Crash" inline>
            {CRASH_POINTS.map((p) => (
              <ChipButton key={p} tone="violet" size="md" on={point === p} onClick={() => setPoint(p)}>{CRASH_LABEL[p]}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint="each cell is a run of the schedule, not a typed answer">Effect applied, by crash point and design</SectionTitle>
          <table className="data-table eo-table">
            <thead>
              <tr>
                <th scope="col">Crash</th>
                {DESIGNS.map((d) => <th key={d} scope="col">{DESIGN_LABEL[d]}</th>)}
              </tr>
            </thead>
            <tbody>
              {CRASH_POINTS.map((p) => (
                <tr key={p}>
                  <th scope="row">{CRASH_LABEL[p]}</th>
                  {DESIGNS.map((d) => {
                    const o = table[p][d];
                    const here = p === point && d === design;
                    return (
                      <td key={d} className={`${o.applied > 1 ? 'is-bad' : 'is-ok'} ${here ? 'is-here' : ''}`}>
                        {o.applied > 1 ? '✗' : '✓'} {o.applied} {o.applied === 1 ? 'time' : 'times'}, balance {o.balance}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Box>
          <SectionTitle hint="the chosen cell">What happened</SectionTitle>
          <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="The publish, the deliveries and acks, and the crash" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a broker and a consumer on distSim with fixed delays; each table cell is a run, and the tests also run 500 seeded fault schedules</Provenance>
          <Provenance kind="toy">the consumer's balance and id set are in memory that survives a crash; steps take 20 ms each</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
