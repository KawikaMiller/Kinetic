import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { explorePathSteps } from '../../core/traceFrames';
import { exhaustiveText, initialExhaustive, seededText, type ExhaustiveState } from './init';
import { exploreBooking, seededLeg, type BookingState } from './model';

const MODES = [
  { value: 'async' as const, label: 'independent grants' },
  { value: 'single-writer' as const, label: 'single writer' },
];

const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a replica that granted the seat' },
      { color: 'var(--info)', label: 'a message on the wire' },
      { color: 'var(--bad)', label: 'both replicas granted' },
    ]}
  />
);

function renderState(state: BookingState) {
  return (
    <div className="dst-state">
      {['r1', 'r2'].map((id, i) => {
        const seat = state.nodes[i];
        return (
          <div key={id} className="dst-seat">
            <strong>{id}</strong>: {seat.granted ? `granted to ${seat.granted}` : seat.taken ? `taken by ${seat.taken}` : 'free'}
          </div>
        );
      })}
      <div className="dst-wire">on the wire: {state.net.map((m) => `${m.payload.type} ${m.payload.client} to ${m.to}`).join(', ') || 'nothing'}</div>
    </div>
  );
}

export function ExhaustiveScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<ExhaustiveState>(initialExhaustive);
  const ex = useMemo(() => exploreBooking(s.mode), [s.mode]);
  const seeded = useMemo(() => seededLeg(s.mode), [s.mode]);
  const steps = useMemo(() => (ex.violation ? explorePathSteps(ex.violation.path) : []), [ex]);

  return (
    <StageFrame
      height={520}
      intro={`The seeded hunt samples schedules; the explorer tries every delivery order of the same protocol functions. ${exhaustiveText(ex)}`}
      introKey={s.mode}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Exhaustive" value={ex.violation ? `${ex.violation.path.length} steps` : `${integer(ex.states)} states`} color={ex.violation ? 'var(--bad)' : 'var(--ok)'} sub={ex.truncated ? 'truncated: not exhaustive' : ex.violation ? 'shortest path to a broken rule' : 'whole model visited, rule holds'} />
          <Stat label="Seeded" value={seeded.ok ? `${integer(seeded.seeds)} passed` : `seed ${seeded.seed} fails`} color={seeded.ok ? 'var(--ok)' : 'var(--bad)'} sub="200 seeds, sampled, same protocol functions" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Protocol" value={s.mode} onChange={(mode) => setS({ mode })} options={MODES} />
          <Button onClick={() => setS(initialExhaustive())}>Reset</Button>
        </>,
      ]}
    >
      <div className="dst-stage stage-pad">
        <Box>
          <SectionTitle hint="breadth-first search over every delivery order, loss and duplication (the set network)">All schedules</SectionTitle>
          <p className="dst-note">{exhaustiveText(ex)}</p>
          <p className="dst-note">{seededText(seeded)}</p>
        </Box>
        {ex.violation ? (
          <Box>
            <SectionTitle hint="step through the shortest schedule that oversells">The counterexample</SectionTitle>
            <TracePlayer initial={ex.init} steps={steps} renderState={renderState} label="Steps of the shortest oversell" />
          </Box>
        ) : (
          <Hint tone="muted" block>With one writer there is no schedule to step through: no state of the explored model has two grants. The model has no clock, so a long pause is a late delivery, which it already covers; it does not cover a writer that crashes.</Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated">the same pure protocol runs under the explorer and under the seeded harness</Provenance>
          <Provenance kind="toy">two replicas and two bookings: small enough to visit every state, which a real system is not</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
