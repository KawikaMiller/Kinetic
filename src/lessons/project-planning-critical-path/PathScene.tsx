import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { pathCaption } from './captions';
import { DAYS, MAX_TASKS, PRESET, addEdge, addTask, cpm, setDays, type Plan } from './cpm';
import { OPENING } from './opening';
import { TaskGantt, type TaskRole } from './TaskGantt';

const BASE_CRITICAL = new Set(cpm(PRESET).critical);
const GRAPH_MIN_WIDTH = 520;
const BOX = { w: 108, h: 40 };
const SPACING = { direction: 'right' as const, layerGap: 128, nodeGap: 54, padMain: 62, padCross: 34 };

/** Scene 1: the dependency graph, its critical path and slack, and the same schedule on a calendar. */
export function PathScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(OPENING.path.plan);
  const [selected, setSelected] = useState<string | null>(OPENING.path.selected);
  const [note, setNote] = useState<string | null>(OPENING.path.note);
  const [from, setFrom] = useState(OPENING.path.from);
  const [to, setTo] = useState(OPENING.path.to);
  const [newLabel, setNewLabel] = useState(OPENING.path.newLabel);
  const [newDays, setNewDays] = useState(OPENING.path.newDays);

  const schedule = useMemo(() => cpm(plan), [plan]);
  const roleOf = (id: string): TaskRole => (schedule.slack[id] > 0 ? 'slack' : BASE_CRITICAL.has(id) ? 'critical' : 'newly-critical');
  const task = plan.tasks.find((t) => t.id === selected) ?? null;
  const taskOptions = plan.tasks.map((t) => ({ value: t.id, label: t.label }));

  const apply = (result: ReturnType<typeof addEdge>, ok: string) => {
    if (result.ok) {
      setPlan(result.value);
      setNote(ok);
    } else setNote(result.error);
    return result.ok;
  };
  const connect = (a: string, b: string) => apply(addEdge(plan, a, b), `Added: ${plan.tasks.find((t) => t.id === b)!.label} now waits for ${plan.tasks.find((t) => t.id === a)!.label}.`);
  const nudge = (by: number) => {
    if (!task) return;
    setPlan(setDays(plan, task.id, task.days + by));
    setNote(null);
  };

  return (
    <StageFrame
      height={760}
      intro={pathCaption(plan, schedule, selected, note)}
      introKey={[JSON.stringify(plan), selected, note]}
      stats={
        <Stats>
          <Stat label="Project length" value={`${schedule.length} days`} color="var(--ok)" sub="the longest chain, in working days" />
          <Stat label="Zero-slack tasks" value={`${schedule.critical.length} of ${plan.tasks.length}`} color="var(--hi)" />
          <Stat label={task ? `${task.label}: slack` : 'Slack of the selected task'} value={task ? `${schedule.slack[task.id]} days` : '–'} sub={task ? `earliest start day ${schedule.es[task.id]}, latest day ${schedule.ls[task.id]}` : 'click a task'} />
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
          <Button softDisabled={!task || task.days <= DAYS.min} onClick={() => nudge(-1)}>Shorter by a day</Button>
          <Button softDisabled={!task || task.days >= DAYS.max} onClick={() => nudge(1)}>Longer by a day</Button>
          <Button onClick={() => { setPlan(PRESET); setSelected(null); setNote('Back to the preset.'); }}>Reset</Button>
        </>,
        <>
          <Segmented label="Dependency: this task" options={taskOptions} value={from} onChange={setFrom} />
          <Segmented label="must finish before" options={taskOptions} value={to} onChange={setTo} />
          <Button variant="primary" onClick={() => connect(from, to)}>Add dependency</Button>
        </>,
        <>
          <TextField label="New task" value={newLabel} width={140} maxLength={16} onChange={setNewLabel} />
          <TextField label="Days" value={newDays} width={64} onChange={setNewDays} />
          <ChipButton tone="info" size="md" onClick={() => { if (apply(addTask(plan, newLabel, newDays), 'Added a task.')) setNewLabel(''); }}>Add task ({plan.tasks.length} of {MAX_TASKS})</ChipButton>
        </>,
      ]}
    >
      <div className="pp-stage stage-pad">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Task dependency graph: scroll sideways to see all of it">
          <GraphView
            nodes={plan.tasks.map((t) => ({ id: t.id, label: `${t.label} ${t.days}d`, shape: 'box' as const }))}
            edges={plan.edges.map(([a, b]) => ({ from: a, to: b }))}
            layout="layered"
            spacing={SPACING}
            box={BOX}
            directed
            className="pp-graph"
            ariaLabel={`Dependency graph of ${plan.tasks.length} tasks; the longest chain takes ${schedule.length} days`}
            nodeMark={(id) => {
              if (id === selected) return { tone: 'violet', fill: 'solid' };
              const role = roleOf(id);
              return role === 'critical' ? { tone: 'hi', fill: 'tint' } : role === 'newly-critical' ? { tone: 'orange', fill: 'tint' } : { tone: 'info', fill: 'tint', tint: 12 };
            }}
            edgeMark={(e) => (schedule.slack[e.from] === 0 && schedule.slack[e.to] === 0 && schedule.ef[e.from] === schedule.es[e.to] ? { tone: 'hi' } : null)}
            onNodeClick={(id) => setSelected(id)}
            editable={{ onAddEdge: (a, b) => { connect(a, b); } }}
          />
        </WideRegion>
        <Hint tone="muted" block>Click a task to select it, then use the day buttons. Drag from one task to another to add a dependency; the controls below do the same from the keyboard. The selected task is violet.</Hint>
        <TaskGantt plan={plan} schedule={schedule} roleOf={roleOf} ariaLabel={`Schedule: ${plan.tasks.length} tasks over ${schedule.length} working days`} />
        <ProvenanceRow>
          <ClaimLabel kind="standard">the forward pass, backward pass and slack are the critical path method (developed in the 1950s: from memory, check the origin before naming anyone)</ClaimLabel>
          <Provenance kind="invented">an eight-task preset with made-up durations</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
