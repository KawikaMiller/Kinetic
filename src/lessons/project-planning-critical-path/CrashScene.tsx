import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { crashCaption } from './captions';
import { BASE, BASE_CRITICAL, CHANGE, crashOf } from './crash';
import { PRESET, setDays } from './cpm';
import { OPENING } from './opening';
import { TaskGantt, type TaskRole } from './TaskGantt';

/** Scene 2: shorten or slip one task and see what moves the date, and what becomes critical. */
export function CrashScene({ picker }: { picker: ReactNode }) {
  const [taskId, setTaskId] = useState(OPENING.crash.taskId);
  const [delta, setDelta] = useState(OPENING.crash.delta);
  const crash = useMemo(() => crashOf(taskId, delta), [taskId, delta]);
  const plan = useMemo(() => setDays(PRESET, taskId, PRESET.tasks.find((t) => t.id === taskId)!.days + delta), [taskId, delta]);
  const roleOf = (id: string): TaskRole => (crash.after.slack[id] > 0 ? 'slack' : BASE_CRITICAL.has(id) ? 'critical' : 'newly-critical');
  const moved = crash.after.length - BASE.length;

  return (
    <StageFrame
      height={640}
      intro={crashCaption(plan, crash)}
      introKey={[taskId, delta]}
      stats={
        <Stats>
          <Stat label="Project length" value={`${crash.after.length} days`} color="var(--ok)" sub={`was ${BASE.length} days`} />
          <Stat label="The date moved" value={moved === 0 ? 'not at all' : `${moved < 0 ? '' : '+'}${moved} days`} color={moved < 0 ? 'var(--ok)' : moved > 0 ? 'var(--bad)' : undefined} sub={`you changed ${plan.tasks.find((t) => t.id === taskId)!.label} by ${crash.delta} days`} />
          <Stat label="Newly critical" value={crash.newlyCritical.length ? crash.newlyCritical.map((id) => plan.tasks.find((t) => t.id === id)!.label).join(', ') : 'none'} color={crash.newlyCritical.length ? 'var(--orange)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'critical: zero slack' },
            { color: 'var(--orange)', label: 'became critical after your change' },
            { color: 'var(--info)', label: 'has slack' },
            { color: 'var(--dim)', label: 'slack (faint extension)', shape: 'square' },
            { color: 'var(--ok)', label: 'project end' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Task" options={PRESET.tasks.map((t) => ({ value: t.id, label: t.label }))} value={taskId} onChange={setTaskId} />
        </>,
        <>
          <Slider label="Change its duration by (days)" value={delta} {...CHANGE} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={setDelta} />
        </>,
      ]}
    >
      <div className="pp-stage stage-pad">
        {crash.delta !== delta && <Hint tone="muted" block>A task keeps at least one day, so the change that applied is {crash.delta} days, not {delta}.</Hint>}
        <TaskGantt plan={plan} schedule={crash.after} roleOf={roleOf} ariaLabel={`Schedule after changing ${taskId} by ${delta} days: ${crash.after.length} working days`} />
        <table className="data-table pp-slack">
          <caption>Slack before and after, in days</caption>
          <thead><tr><th>Task</th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            {PRESET.tasks.map((t) => (
              <tr key={t.id} className={crash.newlyCritical.includes(t.id) ? 'pp-newly' : undefined}>
                <td>{t.label}</td><td>{BASE.slack[t.id]}</td><td>{crash.after.slack[t.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ProvenanceRow>
          <ClaimLabel kind="standard">float (slack) is shared along a chain: spending it early on one task leaves less for the next</ClaimLabel>
          <Provenance kind="invented">the eight preset tasks and their durations</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
