import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { boardCaption, type PaybackRow } from './captions';
import {
  BAND_LABEL, CAPACITY_HOURS, CONTEXTS, LEVELS, LEVEL_MAX, PRESETS, QUEUE_WARN, TASKS, TEAM, WEEKS, bandOf, gapOf, payback, simulate, type Assignee, type Band, type Plan,
} from './model';
import { OPENING } from './opening';

const ASSIGNEES: { value: Assignee; label: string }[] = [
  { value: 'me', label: 'Me' },
  ...TEAM.map((p) => ({ value: p.id, label: p.name })),
  { value: 'none', label: 'Nobody' },
];

const BAND_CLASS: Record<Band, string> = { easy: 'md-band-dim', matched: 'md-band-muted', stretch: 'md-band-violet', hard: 'md-band-bad', beyond: 'md-band-bad' };
const CHART = { width: 356, height: 190 };

/** Scene 1: assign the weekly tasks, pick a level and context, and watch eight invented weeks. */
export function BoardScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(OPENING.board.plan);
  const [seed, setSeed] = useState(OPENING.board.seed);
  const [presetId, setPresetId] = useState<string | null>(OPENING.board.presetId);
  const run = useMemo(() => simulate(plan, seed), [plan, seed]);
  const paybacks = useMemo<PaybackRow[]>(
    () => TASKS.flatMap((t) => {
      const who = plan.assignments[t.id];
      return TEAM.some((p) => p.id === who) ? [{ taskId: t.id, personId: who, payback: payback(t, who, plan.level, plan.context) }] : [];
    }),
    [plan],
  );
  const last = run.weeks[run.weeks.length - 1];
  const edit = (next: Plan) => {
    setPlan(next);
    setPresetId(null);
  };
  const backlog = TEAM.reduce((sum, p) => sum + last.personQueues[p.id], 0);
  const maxQueue = Math.max(QUEUE_WARN + 2, ...run.weeks.map((w) => w.queue + 1));
  const maxDone = Math.max(4, ...run.weeks.map((w) => Math.max(w.completed, w.bounced) + 1));
  const week = (f: (w: (typeof run.weeks)[number]) => number): [number, number][] => run.weeks.map((w) => [w.week, f(w)]);

  return (
    <StageFrame
      height={760}
      intro={boardCaption(run, paybacks)}
      introKey={[JSON.stringify(plan), seed]}
      stats={
        <Stats>
          <Stat label="Finished in 8 weeks" value={run.totals.completed} color="var(--ok)" sub={`${run.totals.bounced} bounced back to you`} />
          <Stat label="Your queue, week 8" value={last.queue} color={last.queue > QUEUE_WARN ? 'var(--bad)' : 'var(--hi)'} sub={`your hours used: ${Math.round(run.weeks.reduce((s, w) => s + w.hours, 0) / WEEKS)} of ${CAPACITY_HOURS} a week on average`} />
          <Stat label="Waiting with others" value={backlog} sub={`${run.totals.unstarted} never started`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'tasks finished' },
            { color: 'var(--bad)', label: 'tasks bounced back, or far above someone' },
            { color: 'var(--hi)', label: 'your queue' },
            { color: 'var(--violet)', label: 'a stretch task (the role where skill grows)' },
            { color: 'var(--amber)', label: 'Ana' },
            { color: 'var(--pink)', label: 'Ben' },
            { color: 'var(--sky)', label: 'Cy' },
            { color: 'var(--orange)', label: 'Di' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={presetId === p.id} onClick={() => { setPlan(p.plan); setPresetId(p.id); }}>{p.label}</ChipButton>
          ))}
        </>,
        <>
          <Slider label="Delegation level" value={plan.level} min={0} max={LEVEL_MAX} format={(v) => LEVELS[v]} onChange={(level) => edit({ ...plan, level })} />
          <Segmented label="Context given" options={CONTEXTS} value={plan.context} onChange={(context) => edit({ ...plan, context })} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="md-stage stage-pad">
        <ul className="md-tasks">
          {TASKS.map((t) => {
            const who = plan.assignments[t.id] ?? 'none';
            const person = TEAM.find((p) => p.id === who);
            const band = person ? bandOf(gapOf(person.skill[t.area], t.complexity)) : null;
            return (
              <li key={t.id} className="md-task">
                <span className="md-task-label">{t.label}</span>
                <span className="md-task-meta">{t.area}, complexity {t.complexity}, {t.criticality} criticality</span>
                {band && <span className={`md-band ${BAND_CLASS[band]}`}>for {person!.name}: {BAND_LABEL[band]}</span>}
                <Segmented ariaLabel={`Assign: ${t.label}`} options={ASSIGNEES} value={who} onChange={(v) => edit({ ...plan, assignments: { ...plan.assignments, [t.id]: v } })} />
              </li>
            );
          })}
        </ul>
        <div className="md-charts">
          <figure className="md-chart">
            <figcaption>Your queue (tasks)</figcaption>
            <Plot2D x={{ domain: [1, WEEKS], ticks: 7, label: 'week' }} y={{ domain: [0, maxQueue], ticks: 4 }} {...CHART} ariaLabel={`Your queue by week, ending at ${last.queue}`}>
              <HLine at={QUEUE_WARN} tone="dim" label="overflow line" />
              <Curve points={week((w) => w.queue)} tone="hi" />
              <Points data={run.weeks.map((w) => ({ x: w.week, y: w.queue, tone: w.queue > QUEUE_WARN ? 'bad' : 'hi' }))} r={3.5} />
            </Plot2D>
          </figure>
          <figure className="md-chart">
            <figcaption>Team throughput (tasks a week)</figcaption>
            <Plot2D x={{ domain: [1, WEEKS], ticks: 7, label: 'week' }} y={{ domain: [0, maxDone], ticks: 4 }} {...CHART} ariaLabel="Tasks finished and tasks bounced back, by week">
              <Curve points={week((w) => w.completed)} tone="ok" />
              <Curve points={week((w) => w.bounced)} tone="bad" dashed />
            </Plot2D>
          </figure>
          <figure className="md-chart">
            <figcaption>Each person&apos;s skill (mean of two areas)</figcaption>
            <Plot2D x={{ domain: [1, WEEKS], ticks: 7, label: 'week' }} y={{ domain: [1, 5], ticks: 4 }} {...CHART} ariaLabel="Mean skill of each teammate by week">
              {TEAM.map((p) => <Curve key={p.id} points={week((w) => w.skills[p.id])} tone={p.tone} />)}
            </Plot2D>
          </figure>
        </div>
        <table className="data-table md-payback">
          <caption>Pay-back: delegating the same task again and again, against doing it yourself</caption>
          <thead><tr><th>Task</th><th>To</th><th>Pays back after</th></tr></thead>
          <tbody>
            {paybacks.length === 0 && <tr><td colSpan={3}>Nothing is delegated, so there is nothing to pay back.</td></tr>}
            {paybacks.map((r) => (
              <tr key={r.taskId}>
                <td>{TASKS.find((t) => t.id === r.taskId)!.label}</td>
                <td>{TEAM.find((p) => p.id === r.personId)!.name}</td>
                <td>{r.payback.reps === null ? `not within ${r.payback.perRep.length} repetitions` : r.payback.reps === 1 ? 'the first repetition' : `${r.payback.reps} repetitions`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ProvenanceRow>
          <Provenance kind="invented">people, tasks, skills and every rule here are made up to show a trade-off; they are not measurements of real people</Provenance>
          <Provenance kind="simulated" seed={seed}>{WEEKS} weeks of seeded outcomes</Provenance>
          <ClaimLabel kind="view">the seven delegation levels (tell to delegate) are from Management 3.0, from memory: one view, check the source</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
