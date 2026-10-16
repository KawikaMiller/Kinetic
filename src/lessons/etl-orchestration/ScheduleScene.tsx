import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { Slider } from '../../components/ui';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { hourLabel } from './chart';
import { scheduleCaption } from './captions';
import { initialScheduleScene } from './init';
import { PAUSE_FROM, PAUSE_TO, SCHEDULE_DAYS, SCHEDULE_START, createdBy, logicalDate, triggers } from './schedule';

const TRACK_MIN_WIDTH = 640;
const DOMAIN_HOURS = 24 * SCHEDULE_DAYS + 48;
const LANES = [{ id: 'interval', label: 'data interval' }, { id: 'runs', label: 'run created' }];

export function ScheduleScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialScheduleScene);
  const { now, paused, catchup } = state;

  const all = useMemo(() => triggers(paused, catchup), [paused, catchup]);
  const made = createdBy(now, paused, catchup);
  const bars: GanttBar[] = useMemo(
    () => [
      ...all.map((t) => ({ id: `i${t.day}`, lane: 'interval', start: 24 * t.day, end: 24 * (t.day + 1), tone: 'info' as const, label: t.date.slice(5), minPx: 6 })),
      ...all.filter((t) => t.at !== null).map((t) => ({ id: `r${t.day}`, lane: 'runs', start: t.at!, end: t.at!, tone: t.kind === 'caught-up' ? ('violet' as const) : ('ok' as const), label: t.kind === 'caught-up' ? t.date.slice(5) : undefined })),
    ],
    [all],
  );
  const skipped = all.filter((t) => t.kind === 'skipped');

  useIntroCaption(scheduleCaption(now, paused, catchup), [now, paused, catchup]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Runs created" value={made.length} color="var(--ok)" sub={`by ${hourLabel(SCHEDULE_START, now)} UTC`} />
          <Stat label="Skipped days" value={skipped.length} color={skipped.length > 0 ? 'var(--bad)' : undefined} sub="no run will ever be created" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the data interval a logical date names', shape: 'square' },
            { color: 'var(--ok)', label: 'a run created when its interval closed (diamond; the table below names each date)', shape: 'square' },
            { color: 'var(--violet)', label: 'a run created late, by catch-up (labelled with its date)', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Slider label="Now" value={now} min={0} max={DOMAIN_HOURS} format={(h) => hourLabel(SCHEDULE_START, h)} onChange={(h) => setState((s) => ({ ...s, now: h }))} />
          <Toggle label="Pipeline" value={paused} onChange={(p) => setState((s) => ({ ...s, paused: p }))} off="Running" on={`Paused ${hourLabel(SCHEDULE_START, PAUSE_FROM)} to ${hourLabel(SCHEDULE_START, PAUSE_TO)}`} />
          {paused && <Toggle label="Catch-up" value={catchup} onChange={(c) => setState((s) => ({ ...s, catchup: c }))} off="Off: latest only" on="On: every missed day" />}
        </>
      }
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint="the run for a logical date happens after its interval has closed">Logical dates and run times (UTC)</SectionTitle>
          <WideRegion minWidth={TRACK_MIN_WIDTH} label="Logical dates and run times on a calendar: scroll sideways to see all of it">
            <GanttLanes
              lanes={LANES}
              bars={bars.filter((b) => b.start <= now)}
              domain={[0, DOMAIN_HOURS]}
              now={now}
              markers={paused ? [{ at: PAUSE_FROM, label: 'paused', tone: 'bad' }, { at: PAUSE_TO, label: 'resumed', tone: 'ok' }] : []}
              axis={{ calendar: { start: SCHEDULE_START, unit: 'day' } }}
              size="md"
              labelWidth={104}
              ariaLabel="Data intervals and the runs created for them, on a UTC calendar"
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="logical date, when its interval closes, and when its run was created">Every day</SectionTitle>
          <div className="eo-scroll" role="region" aria-label="Logical dates and their runs" tabIndex={0}>
            <table className="data-table eo-table">
              <thead>
                <tr><th scope="col">Logical date</th><th scope="col">Interval closes</th><th scope="col">Run</th></tr>
              </thead>
              <tbody>
                {all.map((t) => (
                  <tr key={t.day}>
                    <th scope="row">{logicalDate(t.day)}</th>
                    <td>{hourLabel(SCHEDULE_START, 24 * (t.day + 1))}</td>
                    <td className={t.kind === 'skipped' ? 'eo-bad' : t.at !== null && t.at <= now ? 'eo-ok' : 'eo-dim'}>
                      {t.kind === 'skipped' ? 'skipped' : t.at !== null && t.at <= now ? `created ${hourLabel(SCHEDULE_START, t.at)}` : 'not yet'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="from-memory">how Airflow-style schedulers commonly define it: the run for a logical date starts after that interval ends, and with catch-up off only the latest closed interval runs after a pause (every missed one with it on); verify both against your scheduler&rsquo;s documentation</Provenance>
          <Provenance kind="scripted">fixed lesson dates in UTC, not today&rsquo;s date; the pause window is set by the lesson</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
