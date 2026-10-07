import { useMemo, useState } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pct, plural } from '../../core/format';
import { barLabelPx } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { CompareTable } from './CompareTable';
import { scheduleFrames } from './frames';
import { JobTable, type JobRow } from './JobTable';
import {
  compareAll, MLFQ_QUANTA, nextJobName, POLICIES, PRESETS, schedule, switchOverhead,
  type Job, type Policy, type Preset, type PresetId, type ScheduleOpts,
} from './model';
import { ganttBars, ganttLanes } from './view';
import './styles.css';

const STEP_MS = 650;
/** The Gantt's narrowest readable width: below it, it scrolls sideways on its own. */
const GANTT_MIN_W = 520;
const QUANTUM_MAX = 8;
const SWITCH_MAX = 2;
const BOOST_MAX = 40;
const BOOST_STEP = 5;

const rowsOf = (jobs: readonly Job[], from: number): JobRow[] => jobs.map((job, i) => ({ key: from + i, job }));

export function Stage() {
  const first = PRESETS[0];
  const [rows, setRows] = useState<JobRow[]>(() => rowsOf(first.jobs, 0));
  const [nextKey, setNextKey] = useState(first.jobs.length);
  const [policy, setPolicy] = useState<Policy>(first.policy);
  const [opts, setOpts] = useState<ScheduleOpts>(first.opts);
  const [loaded, setLoaded] = useState<PresetId | null>(first.id);
  const [comparing, setComparing] = useState(false);

  const jobs = useMemo(() => rows.map((r) => r.job), [rows]);
  const s = useMemo(() => schedule(jobs, policy, opts), [jobs, policy, opts]);
  const frames = useMemo(() => scheduleFrames(jobs, s, policy, opts), [jobs, s, policy, opts]);
  const comparison = useMemo(() => (comparing ? compareAll(jobs, opts) : null), [comparing, jobs, opts]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const m = s.moments[player.frame.at];

  const load = (p: Preset) => {
    setRows(rowsOf(p.jobs, nextKey));
    setNextKey(nextKey + p.jobs.length);
    setPolicy(p.policy);
    setOpts(p.opts);
    setLoaded(p.id);
  };
  /** Edits rewind without playing, so the learner sees the new jobs before anything moves. */
  const edit = (next: JobRow[]) => {
    player.queueNext({ play: false });
    setRows(next);
    setLoaded(null);
  };
  const setOpt = (patch: Partial<ScheduleOpts>) => setOpts({ ...opts, ...patch });

  const bars = ganttBars(jobs, s, player.frame.at);
  const queueStrips = policy === 'mlfq' ? m.queues.map((q, level) => ({ q, title: `Q${level} · quantum ${MLFQ_QUANTA[level]}` })) : [{ q: m.queues[0], title: 'Ready queue' }];
  const overhead = switchOverhead(s);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Time" value={`t = ${m.t}`} sub={`of ${s.end} ticks`} />
          <Stat label="CPU running" value={m.cpu?.kind === 'run' ? jobs[m.cpu.job].name : m.cpu?.kind === 'switch' ? 'switch' : m.cpu ? 'idle' : 'done'} color="var(--hi)" />
          <Stat label="Switching" value={pct(overhead)} color="var(--violet)" sub={`${plural(s.switchTicks, 'tick')} of the run`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now (outline)', shape: 'line' },
            { color: 'var(--info)', label: 'ready queue', shape: 'square' },
            { color: 'var(--violet)', label: 'context switch', shape: 'square' },
            { color: 'var(--dim)', label: 'idle CPU', shape: 'square' },
          ]}
        />
      }
      controls={[
        <ControlGroup label="Presets" inline key="presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={loaded === p.id} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Segmented label="Policy" value={policy} onChange={setPolicy} options={POLICIES.map((p) => ({ value: p.value, label: p.label }))} />
          {policy === 'rr' && <Slider label="Quantum" value={opts.quantum} min={1} max={QUANTUM_MAX} onChange={(quantum) => setOpt({ quantum })} format={(v) => plural(v, 'tick')} />}
          {policy === 'mlfq' && (
            <Slider label="Boost every" value={opts.boostEvery} min={0} max={BOOST_MAX} step={BOOST_STEP} onChange={(boostEvery) => setOpt({ boostEvery })} format={(v) => (v === 0 ? 'never' : plural(v, 'tick'))} />
          )}
          <Slider label="Switch cost" value={opts.switchCost} min={0} max={SWITCH_MAX} onChange={(switchCost) => setOpt({ switchCost })} format={(v) => (v === 0 ? 'free' : `${plural(v, 'tick')} (illustrative)`)} />
        </>,
      ]}
    >
      <div className="cs stage-pad">
        <Hint block tone="muted">
          {POLICIES.find((p) => p.value === policy)!.long}. Times are in abstract ticks; the switch cost is optional and illustrative. SJF and SRTF assume burst lengths are known, which real
          schedulers can only estimate.
        </Hint>
        <WideRegion minWidth={GANTT_MIN_W} label="Schedule timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={ganttLanes(jobs, policy, m.levels)}
            bars={bars}
            domain={[0, Math.max(1, s.end)]}
            now={m.t}
            axis
            unit=""
            size="md"
            labelWidth={84}
            labelMinPx={Math.max(...jobs.map((j) => barLabelPx(j.name)))}
            ariaLabel={`Schedule up to t = ${m.t}: the CPU lane, then one lane per job`}
            className="cs-gantt"
          />
        </WideRegion>
        <p className="cs-key">
          The <b>CPU</b> lane shows who runs each tick. Job lanes: solid = running, hatched = waiting in the ready queue, dashed = blocked on I/O.
        </p>
        <div className="cs-queues">
          {queueStrips.map(({ q, title }) => (
            <div key={title} className="cs-queue">
              <SectionTitle>{title}</SectionTitle>
              {q.length > 0 ? (
                <ArrayStrip values={q.map((j) => jobs[j].name)} cellState={() => 'info'} cellMax={56} fontSize={12} />
              ) : (
                <p className="empty-note">empty</p>
              )}
            </div>
          ))}
        </div>
        <JobTable
          rows={rows}
          s={s}
          moment={m}
          onChange={(key, job) => edit(rows.map((r) => (r.key === key ? { key, job } : r)))}
          onRemove={(key) => edit(rows.filter((r) => r.key !== key))}
          onAdd={() => {
            edit([...rows, { key: nextKey, job: { name: nextJobName(jobs), arrival: 0, burst: 3, io: null } }]);
            setNextKey(nextKey + 1);
          }}
        />
        <div className="cs-compare-bar">
          <Button variant={comparing ? 'ghost' : 'primary'} onClick={() => setComparing(!comparing)} aria-expanded={comparing}>
            {comparing ? 'Hide comparison' : 'Compare all'}
          </Button>
          <Hint>
            Runs all five policies on these jobs: RR quantum {opts.quantum}, MLFQ boost {opts.boostEvery === 0 ? 'never' : `every ${opts.boostEvery}`}, switch cost {opts.switchCost}.
          </Hint>
        </div>
        {comparison && <CompareTable c={comparison} current={policy} />}
      </div>
    </StageFrame>
  );
}
