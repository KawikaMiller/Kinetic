import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { weekCaption } from './captions';
import { CALENDAR_START, DAYS, DURATION, TASKS, UPSTREAM, runPipeline } from './engine';
import { baseConfig } from './facts';
import { initialWeekScene } from './init';
import { CalendarTime, DayTable, RunChart, SchedulerLog } from './RunChart';
import { DAY_MS, isoDate } from './schedule';

const EDGES = TASKS.flatMap((t) => UPSTREAM[t].map((u) => ({ from: u, to: t })));
const NODES = TASKS.map((t) => ({ id: t, shape: 'box' as const, label: `${t} (${DURATION[t]} h)` }));

export function WeekScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialWeekScene);
  const sim = useMemo(() => runPipeline(baseConfig, 0), []);
  const final = sim.state;
  const now = state.at;
  const world = sim.history[Math.min(now, sim.history.length - 1)];

  useIntroCaption(weekCaption(world, now), [now]);

  const running = TASKS.filter((t) => world.runs.some((r) => r.tasks[t].status === 'running'));
  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Days loaded" value={`${world.loads.filter((n) => n > 0).length} of ${DAYS}`} color="var(--ok)" sub="report written for the date" />
          <Stat label="Running now" value={running.length === 0 ? 'nothing' : running.join(', ')} color={running.length > 0 ? 'var(--hi)' : undefined} sub={`tick = one hour, UTC`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a task running now', shape: 'square' },
            { color: 'var(--ok)', label: 'a task that succeeded (the number is its day)', shape: 'square' },
            { color: 'var(--dim)', label: 'not yet scheduled', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <CalendarTime now={now} onNow={(h) => setState({ at: h })} />
        </>
      }
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint="a task starts only after the tasks above it succeed">The pipeline: a DAG</SectionTitle>
          <div className="eo-dag">
            <GraphView nodes={NODES} edges={EDGES} directed layout="layered" spacing={{ direction: 'right', layerGap: 70, nodeGap: 36, padMain: 16, padCross: 16 }} box={{ w: 150, h: 32 }} ariaLabel="The pipeline's five tasks and their dependencies" />
          </div>
        </Box>
        <RunChart finalWorld={final} now={now} hint={`seven daily runs from ${isoDate(Date.parse(CALENDAR_START))} to ${isoDate(Date.parse(CALENDAR_START) + (DAYS - 1) * DAY_MS)}, UTC`} />
        <Box>
          <SectionTitle hint="source rows against report rows, at the time cursor">Report by date</SectionTitle>
          <DayTable world={world} dateOf={(d) => isoDate(Date.parse(CALENDAR_START) + d * DAY_MS)} />
        </Box>
        <SchedulerLog world={world} />
        <ProvenanceRow>
          <Provenance kind="simulated">a toy scheduler on fixed lesson dates (UTC), one hour a tick; real orchestrators add queues, pools and priorities not modelled here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
