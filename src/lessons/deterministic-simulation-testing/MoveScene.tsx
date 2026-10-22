import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { BookingDiagram } from './BookingDiagram';
import { delaySub, editedLabel, initialMove, moveCaption, type MoveState } from './init';
import { GAP, SCENE2_T1, defaultBooking, replicateDelay, replicateDropped, runBooking } from './model';

const legend = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a booking one replica granted' },
      { color: 'var(--bad)', label: 'both replicas granted' },
      { color: 'var(--info)', label: 'a replicate message' },
      { color: 'var(--violet)', label: 'the boundary computed from the trace' },
    ]}
  />
);

export function MoveScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<MoveState>(initialMove);
  const set = (p: Partial<MoveState>) => setM((x) => ({ ...x, ...p }));
  const setup = useMemo(
    () => ({ ...defaultBooking(m.seed), t1: SCENE2_T1, t2: Math.max(0, SCENE2_T1 + m.gap), requestA: m.requestA, requestB: m.requestB, dropReplicate: m.dropReplicate }),
    [m],
  );
  const run = useMemo(() => runBooking(setup), [setup]);
  const baseline = useMemo(() => runBooking({ ...setup, requestA: true, requestB: true, dropReplicate: false }), [setup]);
  const delayMs = useMemo(() => replicateDelay(run), [run]);
  const dropped = useMemo(() => replicateDropped(run), [run]);
  const edited = !m.requestA || !m.requestB || m.dropReplicate;
  const rows: { label: string; present: boolean; action: string; toggle: () => void }[] = [
    { label: `request A at ${SCENE2_T1} ms`, present: m.requestA, action: m.requestA ? 'Remove' : 'Add back', toggle: () => set({ requestA: !m.requestA }) },
    { label: `request B at ${Math.max(0, SCENE2_T1 + m.gap)} ms`, present: m.requestB, action: m.requestB ? 'Remove' : 'Add back', toggle: () => set({ requestB: !m.requestB }) },
    { label: m.dropReplicate ? 'drop every replicate from r1 (added by you)' : 'drop every replicate from r1 (not in this schedule)', present: m.dropReplicate, action: m.dropReplicate ? 'Remove' : 'Add a drop', toggle: () => set({ dropReplicate: !m.dropReplicate }) },
  ];

  return (
    <StageFrame
      height={560}
      intro={moveCaption(m, run.failed, baseline.failed, { delayMs, dropped })}
      introKey={`${m.seed}|${m.gap}|${m.requestA}|${m.requestB}|${m.dropReplicate}|${m.reveal}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Verdict" value={run.failed ? 'oversold' : 'one grant'} color={run.failed ? 'var(--bad)' : 'var(--ok)'} sub={run.failed ? run.message : 'at most one client holds the seat'} />
          <Stat label="Traced replicate delay" value={!m.reveal ? 'hidden' : dropped ? 'dropped' : delayMs === null ? 'none sent' : `${delayMs.toFixed(2)} ms`} color="var(--violet)" sub={delaySub(m)} />
          {edited && <Stat label="Edited fault list" value={editedLabel(baseline.failed, run.failed)} color={run.failed ? 'var(--bad)' : 'var(--ok)'} sub={baseline.failed ? 'the unedited schedule fails' : 'the unedited schedule passes'} />}
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Gap (B minus A)" value={m.gap} min={GAP.min} max={GAP.max} format={(v) => `${v > 0 ? '+' : ''}${v} ms`} onChange={(gap) => set({ gap })} />
          <SeedField seed={m.seed} onSeed={(seed) => set({ seed, reveal: false })} />
          <Button variant="primary" onClick={() => set({ reveal: true })} softDisabled={m.reveal}>Show the boundary</Button>
          <Button onClick={() => setM(initialMove())}>Reset</Button>
        </>,
      ]}
    >
      <div className="dst-stage stage-pad">
        <Box>
          <SectionTitle hint="edit the schedule and re-run; a struck-through line is not in the schedule; automatic minimising is another lesson's job">The fault list</SectionTitle>
          <ul className="dst-faults">
            {rows.map((r) => (
              <li key={r.label} className={r.present ? '' : 'is-off'}>
                <span>{r.label}</span>
                <Button onClick={r.toggle}>{r.action}</Button>
              </li>
            ))}
          </ul>
        </Box>
        <Box>
          <SectionTitle hint={`seed ${m.seed}, gap ${m.gap} ms`}>The run</SectionTitle>
          <BookingDiagram run={run} />
        </Box>
        <Hint tone="muted" block>Drag the gap until the verdict flips, then press Show the boundary to check it. The boundary is the earlier request's replicate delay, the one the seed gave that message (read from the replicate send in this run's trace), and the same on every replay.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={m.seed}>the seed's link delays are kept while the gap moves; only the request times change</Provenance>
          <Provenance kind="toy">a deliberately small bug, not a real booking system</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
