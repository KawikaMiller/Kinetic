import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { barTarget, weekDate } from './chart';
import { failureCaption } from './captions';
import { CALENDAR_START, DAYS, HORIZON_HOURS, MAX_RETRIES, RETRY_DELAY, TASKS, keyOf, runPipeline, statusOf, type Config } from './engine';
import { initialFailureScene } from './init';
import { CalendarTime, DayTable, RunChart, SchedulerLog } from './RunChart';
import { DAY_MS, isoDate } from './schedule';

export function FailureScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialFailureScene);
  const [note, setNote] = useState('');
  const { failures, ops, retries, kind, day, task, flaky, seed, at } = state;

  const cfg: Config = useMemo(() => ({ retries, mode: 'overwrite', failures, ops, flaky }), [retries, failures, ops, flaky]);
  const sim = useMemo(() => runPipeline(cfg, seed), [cfg, seed]);
  const final = sim.state;
  const now = Math.min(at, HORIZON_HOURS);
  const world = sim.history[Math.min(now, sim.history.length - 1)];
  const key = keyOf(day, task);

  useIntroCaption(failureCaption(final, day, task, retries), [final, day, task, retries]);

  const inject = () => {
    setState((s) => ({ ...s, failures: { ...s.failures, [key]: { kind } } }));
    setNote(`${task} of ${weekDate(day)} will fail (${kind}).`);
  };
  const clearAndRerun = () => {
    const tr = final.runs[day].tasks[task];
    if (tr.status !== 'failed') {
      setNote(`${task} of ${weekDate(day)} has not failed (it is ${tr.status.replace('_', ' ')}), so there is nothing to clear and rerun.`);
      return;
    }
    const failedAt = tr.spans.at(-1)!.end;
    setState((s) => ({ ...s, ops: [...s.ops, { at: failedAt + 1, kind: 'clear', day, task }] }));
    setNote(`${task} of ${weekDate(day)} is cleared at ${failedAt + 1} h and runs again; the tasks it blocked follow.`);
  };
  const failedTasks = TASKS.filter((t) => final.runs.some((r) => r.tasks[t].status === 'failed')).length;

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label="Failed tasks" value={final.runs.reduce((n, r) => n + TASKS.filter((t) => r.tasks[t].status === 'failed').length, 0)} color={failedTasks > 0 ? 'var(--bad)' : undefined} sub="in the whole week" />
          <Stat label="Did not run" value={final.runs.reduce((n, r) => n + TASKS.filter((t) => r.tasks[t].status === 'upstream_failed').length, 0)} color="var(--orange)" sub="upstream failed" />
          <Stat label="Selected" value={statusOf(world, day, task).replace('_', ' ')} sub={`${task}, ${weekDate(day)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'succeeded', shape: 'square' },
            { color: 'var(--bad)', label: 'failed', shape: 'square' },
            { color: 'var(--orange)', label: 'upstream failed: did not run (hatched)', shape: 'square' },
            { color: 'var(--info)', label: 'waiting to retry (dashed)', shape: 'square' },
            { color: 'var(--hi)', label: 'running now', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Day" value={day} onChange={(d) => setState((s) => ({ ...s, day: d }))} options={Array.from({ length: DAYS }, (_, d) => ({ value: d, label: weekDate(d).slice(5) }))} />
          <Segmented label="Task" value={task} onChange={(t) => setState((s) => ({ ...s, task: t }))} options={TASKS.map((t) => ({ value: t, label: t }))} />
        </>,
        <>
          <Segmented label="Failure" value={kind} onChange={(k) => setState((s) => ({ ...s, kind: k }))} options={[{ value: 'transient', label: 'Transient: first attempt only' }, { value: 'permanent', label: 'Permanent' }]} />
          <Button variant="primary" onClick={inject} softDisabled={key in failures}>Fail this task</Button>
          <Button onClick={clearAndRerun}>Clear and rerun it</Button>
          <Button onClick={() => { setState((s) => ({ ...s, failures: {}, ops: [] })); setNote('All failures removed.'); }} softDisabled={Object.keys(failures).length === 0 && ops.length === 0}>No failures</Button>
        </>,
        <>
          <Slider label="Retries" value={retries} min={0} max={MAX_RETRIES} onChange={(r) => setState((s) => ({ ...s, retries: r }))} />
          <Toggle label="Flaky workers" value={flaky} onChange={(f) => setState((s) => ({ ...s, flaky: f }))} off="Off" on="On (seeded)" />
          {flaky && <SeedField key={seed} seed={seed} onSeed={(v) => setState((s) => ({ ...s, seed: v }))} />}
        </>,
        <CalendarTime key="time" now={now} onNow={(h) => setState((s) => ({ ...s, at: h }))} />,
      ]}
    >
      <div className="eo-stage stage-pad">
        <RunChart finalWorld={final} now={now} onBarClick={(id) => { const t = barTarget(id); if (t) { setState((s) => ({ ...s, day: t.day, task: t.task })); setNote(`Selected ${t.task} of ${weekDate(t.day)}.`); } }} hint="click a bar to select that task and day" />
        {note && <p className="eo-status" role="status">{note}</p>}
        <Box>
          <SectionTitle hint={`retries wait ${RETRY_DELAY} h; ${CALENDAR_START.slice(0, 10)} is day 1`}>Report by date</SectionTitle>
          <DayTable world={world} dateOf={(d) => isoDate(Date.parse(CALENDAR_START) + d * DAY_MS)} />
        </Box>
        <SchedulerLog world={world} />
        <ProvenanceRow>
          <Provenance kind={flaky ? 'simulated' : 'scripted'} seed={flaky ? seed : undefined}>{flaky ? 'each attempt fails with a seeded 1-in-5 chance on top of your failures' : 'the failures are the ones you inject: scripted, not random'}</Provenance>
          <Provenance kind="illustrative">the retry wait of {RETRY_DELAY} h is a made-up constant; real schedulers let each task set its own delay and limit</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
