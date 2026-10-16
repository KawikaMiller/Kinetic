import { useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { runAgent, type ApprovalChoice } from './agent';
import { guardCaption } from './captions';
import { EventLog, Outbox } from './EventLog';
import { guardConfig } from './facts';
import { FAILURE_STEPS, GUARD_DEFAULT, GUARD_PRESETS, GUARD_TOOLS, REFUND_TASKS, type Guards, type PresetId } from './settings';
import { callText, isWrite, type ToolName } from './tools';

const PRESET_IDS = Object.keys(GUARD_PRESETS) as PresetId[];
const sameGuards = (a: Guards, b: Guards) =>
  a.validateArguments === b.validateArguments && a.approval === b.approval && a.offered.length === b.offered.length && a.offered.every((t) => b.offered.includes(t));

export function GuardScene({ picker }: { picker: ReactNode }) {
  const [task, setTask] = useState<string>(GUARD_DEFAULT.task);
  const [guards, setGuards] = useState<Guards>(GUARD_PRESETS[GUARD_DEFAULT.preset].guards);
  const [failurePct, setFailurePct] = useState<number>(GUARD_DEFAULT.failureRate);
  const [seed, setSeed] = useState<number>(GUARD_DEFAULT.seed);
  const [approvals, setApprovals] = useState<ApprovalChoice[]>([]);
  const result = useRef<HTMLDivElement>(null);
  const goal = REFUND_TASKS.find((t) => t.id === task)!.goal;
  const run = runAgent(guardConfig(task, 'readonly', { ...guards, failureRate: failurePct / 100, seed, approvals }));
  const caption = guardCaption(run, goal);
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setApprovals([]); };
  const decide = (choice: ApprovalChoice) => {
    setApprovals([...approvals, choice]);
    result.current?.focus();
  };
  const toggleTool = (tool: ToolName) => change(setGuards)({ ...guards, offered: guards.offered.includes(tool) ? guards.offered.filter((t) => t !== tool) : [...guards.offered, tool] });

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Outcome" value={run.outcome === 'paused' ? 'waiting for you' : run.outcome === 'answered' ? 'answered' : 'stopped'} color={run.outcome === 'paused' ? 'var(--orange)' : undefined} sub={run.answer ?? (run.outcome === 'paused' ? 'press Approve or Deny' : 'stopped: step budget reached')} />
          <Stat label="Writes that ran" value={run.writes.length} color={run.writes.length > 0 ? 'var(--hi)' : undefined} sub={`${run.approvals.filter((a) => a.decision === 'approve').length} approved by you`} />
          <Stat label="Tool failures injected" value={`${failurePct}%`} sub="seeded and simulated" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'an executed call', shape: 'square' },
            { color: 'var(--ok)', label: 'a successful result or approval', shape: 'square' },
            { color: 'var(--bad)', label: 'a rejected call or failure', shape: 'square' },
            { color: 'var(--orange)', label: 'a call awaiting approval (a wait, not an error)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Task" inline>
            {REFUND_TASKS.map((t) => <ChipButton key={t.id} tone="info" on={task === t.id} onClick={() => change(setTask)(t.id)}>{t.label}</ChipButton>)}
          </ControlGroup>
          <ControlGroup label="Preset" inline>
            {PRESET_IDS.map((id) => <ChipButton key={id} tone="violet" on={sameGuards(guards, GUARD_PRESETS[id].guards)} onClick={() => change(setGuards)(GUARD_PRESETS[id].guards)}>{GUARD_PRESETS[id].label}</ChipButton>)}
          </ControlGroup>
        </>,
        <>
          <ControlGroup label="Tools offered" inline>
            {GUARD_TOOLS.map((t) => <ChipButton key={t} tone={isWrite(t) ? 'orange' : 'info'} on={guards.offered.includes(t)} onClick={() => toggleTool(t)}>{t}</ChipButton>)}
          </ControlGroup>
          <Toggle label="Argument validation" value={guards.validateArguments} onChange={(v) => change(setGuards)({ ...guards, validateArguments: v })} off="Off" on="On: refund limit 100" />
          <Toggle label="Human approval" value={guards.approval} onChange={(v) => change(setGuards)({ ...guards, approval: v })} off="Off" on="On: writes wait" />
        </>,
        <>
          <Slider label="Tool failure rate" value={failurePct} min={FAILURE_STEPS[0]} max={FAILURE_STEPS.at(-1)!} step={10} onChange={change(setFailurePct)} format={(v) => `${v}%`} />
          <SeedField seed={seed} onSeed={change(setSeed)} />
        </>,
      ]}
    >
      <div className="ag-stage stage-pad">
        {run.pending && (
          <Box>
            <SectionTitle hint="the loop is paused">Approval needed</SectionTitle>
            <p className="ag-approve">The agent wants to run <code>{callText(run.pending)}</code>.</p>
            <div className="ag-approve-buttons">
              <Button variant="primary" onClick={() => decide('approve')}>Approve</Button>
              <Button onClick={() => decide('deny')}>Deny</Button>
            </div>
          </Box>
        )}
        <EventLog events={run.events} title="Guardrails in the loop" hint={`goal: ${goal}`} />
        <div ref={result} tabIndex={-1} className="ag-result" aria-label="Fake outbox and ledger">
          <Outbox run={run} />
        </div>
        <ProvenanceRow>
          <Provenance kind="scripted">scripted policy, not an LLM</Provenance>
          <Provenance kind="simulated" seed={seed}>seeded tool failures; a failed call is retried once, then the policy gives up</Provenance>
          <Provenance kind="illustrative">invented data and fake outbox: nothing is sent; the refund limit of 100 is illustrative</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
