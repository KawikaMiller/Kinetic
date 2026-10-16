import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { hourLabel, weekDate } from './chart';
import { loadCaption } from './captions';
import { CALENDAR_START, DAYS, HORIZON_HOURS, LATE_ROWS, dayStatus, runPipeline, type Op } from './engine';
import { baseConfig } from './facts';
import { initialLoadScene } from './init';
import { CalendarTime, DayTable, RunChart } from './RunChart';
import { opsForSeed } from './scenario';
import { DAY_MS, isoDate } from './schedule';

/** New operations go after everything already scheduled (and after the seven runs), so they never interrupt a run. */
const nextHour = (ops: readonly Op[]) => Math.max(HORIZON_HOURS - 24, ...ops.map((o) => o.at)) + 6;
const OPS_SHOWN = 12;

const opText = (o: Op) => (o.kind === 'rerun' ? `rerun ${weekDate(o.day)}` : o.kind === 'late' ? `${LATE_ROWS} late rows for ${weekDate(o.day)}` : 'clear');

export function LoadScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialLoadScene);
  const [at, setAt] = useState(HORIZON_HOURS);
  const { mode, seed, ops, day } = state;

  const sim = useMemo(() => runPipeline({ ...baseConfig, mode, ops }, seed), [mode, ops, seed]);
  const final = sim.state;
  const now = Math.min(at, HORIZON_HOURS);
  const world = sim.history[Math.min(now, sim.history.length - 1)];
  const dup = Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(final, d) === 'duplicated').length;
  const stale = Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(final, d) === 'stale').length;

  useIntroCaption(loadCaption(mode, final), [mode, final]);

  const add = (op: Op) => setState((s) => ({ ...s, ops: [...s.ops, op] }));
  const when = nextHour(ops);

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label="Report rows" value={final.output.reduce((a, b) => a + b, 0)} color={dup > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`${final.source.reduce((a, b) => a + b, 0)} rows in the source`} />
          <Stat label="Duplicated dates" value={dup} color={dup > 0 ? 'var(--bad)' : undefined} sub="more rows than the source" />
          <Stat label="Stale dates" value={stale} color={stale > 0 ? 'var(--violet)' : undefined} sub="missing late rows" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'rows equal to the source', shape: 'square' },
            { color: 'var(--bad)', label: 'duplicated rows (more than the source)', shape: 'square' },
            { color: 'var(--violet)', label: 'a late-arriving correction not loaded yet', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Load" value={mode === 'overwrite'} onChange={(v) => setState((s) => ({ ...s, mode: v ? 'overwrite' : 'append' }))} off="Append today's rows" on="Overwrite this date's partition" />
        </>,
        <>
          <Segmented label="Day" value={day} onChange={(d) => setState((s) => ({ ...s, day: d }))} options={Array.from({ length: DAYS }, (_, d) => ({ value: d, label: weekDate(d).slice(5) }))} />
          <Button onClick={() => add({ at: when, kind: 'rerun', day })}>Rerun this day</Button>
          <Button onClick={() => setState((s) => ({ ...s, ops: [...s.ops, ...Array.from({ length: DAYS }, (_, d) => ({ at: nextHour(s.ops), kind: 'rerun' as const, day: d }))] }))}>Backfill all {DAYS} days</Button>
          <Button onClick={() => add({ at: when, kind: 'late', day })}>Late data for this day</Button>
        </>,
        <>
          <SeedField key={seed} seed={seed} onSeed={(v) => setState((s) => ({ ...s, seed: v, ops: opsForSeed(v) }))} />
          <Button onClick={() => setState((s) => ({ ...s, ops: [] }))} softDisabled={ops.length === 0}>No operations</Button>
        </>,
        <CalendarTime key="time" now={now} onNow={setAt} />,
      ]}
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint={`seed ${seed} made this schedule; a new seed makes another`}>Operations after the first runs</SectionTitle>
          {ops.length === 0 ? (
            <p className="empty-note">None: every day ran once.</p>
          ) : (
            <ul className="eo-ops">
              {ops.slice(0, OPS_SHOWN).map((o, i) => (
                <li key={i}>{hourLabel(CALENDAR_START, o.at)}: {opText(o)}</li>
              ))}
              {ops.length > OPS_SHOWN && <li>and {ops.length - OPS_SHOWN} more</li>}
            </ul>
          )}
        </Box>
        <RunChart finalWorld={final} now={now} hint="every green load bar writes that date's rows" />
        <Box>
          <SectionTitle hint="the report against the source, at the time cursor">Report by date</SectionTitle>
          <DayTable world={world} dateOf={(d) => isoDate(Date.parse(CALENDAR_START) + d * DAY_MS)} />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>reruns and late rows are seeded; the loads and counts are computed by the toy scheduler, not typed</Provenance>
          <Provenance kind="toy">seven days of made-up row counts; real loads write files or table partitions, not a single number</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
