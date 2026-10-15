import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TapeStrip } from '../../components/TapeStrip';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextArea, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { symbolAt, type Tm } from '../../core/tm';
import { stepCaption } from './captions';
import {
  checkTable, describeCase, frameStatus, INCREMENT_NO_CARRY, INCREMENT_WRONG_WRITE, ruleIndex, TASKS, traceFrames,
  type CheckReport, type FrameStatus, type TaskId,
} from './model';
import type { TaskState } from './useTaskState';

const STEP_MS = 600;
const PHONE_CELLS = 9;
const DESKTOP_CELLS = 17;
const TABLE_ROWS = 9;

const ruleLine = (r: Tm['rules'][number]) => `${r.state} ${r.read} -> ${r.write} ${r.move} ${r.next}`;

const STATUS_VIEW: Record<FrameStatus, { label: string; color?: string }> = {
  running: { label: 'running' },
  right: { label: 'correct', color: 'var(--ok)' },
  wrong: { label: 'wrong answer', color: 'var(--bad)' },
  stuck: { label: 'stuck', color: 'var(--orange)' },
  budget: { label: 'no verdict', color: 'var(--dim)' },
};

function checkLines(report: CheckReport, task: TaskId): ConsoleLine[] {
  if (!report.first) {
    return [{ text: `All ${report.total} inputs came out right. That is a test of ${report.total} inputs, not a proof for every input.`, tone: 'ok' }];
  }
  const kind = report.first.verdict.kind;
  return [
    `Checked ${report.total} inputs: ${report.failures.length} failed.`,
    { text: describeCase(report.first, task), tone: kind === 'stuck' ? 'orange' : kind === 'budget' ? 'dim' : 'bad' },
  ];
}

/** Scenes 1 and 2: edit the transition table, run it, and let Check hold it against the oracle. */
export function TaskScene({ state, picker }: { state: TaskState; picker: ReactNode }) {
  const { task, machine, input } = state;
  const spec = TASKS[task];
  const phone = useMediaQuery(PHONE_QUERY);
  const [checked, setChecked] = useState<{ machine: Tm; report: CheckReport } | null>(null);
  const report = checked && checked.machine === machine ? checked.report : null;

  const frames = useMemo(
    () => traceFrames(machine, input).map((f) => ({ ...f, say: stepCaption(f, task, input), quiet: true })),
    [machine, input, task],
  );
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const status = STATUS_VIEW[frameStatus(f, task, input)];
  const active = ruleIndex(machine, f.rule);

  const check = () => {
    setChecked({ machine, report: checkTable(task, machine) });
    state.markAttempted();
  };

  return (
    <StageFrame
      player={player}
      height={640}
      stats={
        <Stats>
          <Stat label="Steps" value={f.step} sub={f.skipped ? 'jumped to the end of a long run' : undefined} />
          <Stat label="State" value={f.config.state} color="var(--violet)" />
          <Stat label="Result" value={status.label} color={status.color} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the head, and the rule just applied', shape: 'square' },
            { color: 'var(--ok)', label: 'a cell the step changed, or accept', shape: 'square' },
            { color: 'var(--bad)', label: 'reject, or a wrong tape', shape: 'square' },
            { color: 'var(--orange)', label: 'stuck: no rule matched', shape: 'square' },
            { color: 'var(--dim)', label: 'a blank cell', shape: 'square' },
            { color: 'var(--violet)', label: 'the state name', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Tape" value={state.raw} onChange={state.setRaw} width={170} ariaLabel={`Input tape over ${spec.id === 'increment' ? '0 and 1' : 'a and b'}`} spellCheck={false} />
          {state.inputError && <Hint tone="muted"><span role="alert">{state.inputError} Still running {state.input === '' ? 'the empty tape' : state.input}.</span></Hint>}
        </>,
        <>
          <ControlGroup label="Load" inline>
            <ChipButton tone="info" on={state.text === spec.starter} onClick={() => state.setText(spec.starter)}>Starter</ChipButton>
            <ChipButton
              tone="ok"
              on={state.text === spec.reference}
              disabled={!state.attempted}
              title={state.attempted ? 'Load the author’s table' : 'Press Check once first, then the reveal opens'}
              onClick={() => state.setText(spec.reference)}
            >
              Reveal the author’s table
            </ChipButton>
            {task === 'increment' && (
              <>
                <ChipButton tone="orange" on={state.text === INCREMENT_NO_CARRY} onClick={() => state.setText(INCREMENT_NO_CARRY)}>Break it: no carry rule</ChipButton>
                <ChipButton tone="bad" on={state.text === INCREMENT_WRONG_WRITE} onClick={() => state.setText(INCREMENT_WRONG_WRITE)}>Break it: wrong write</ChipButton>
              </>
            )}
          </ControlGroup>
          <Button variant="primary" onClick={check}>Check against the oracle</Button>
        </>,
      ]}
    >
      <div className="tm stage-pad">
        <TapeStrip symbol={(i) => symbolAt(f.config, i)} head={f.config.head} state={f.config.state} changed={f.changed} cells={phone ? PHONE_CELLS : DESKTOP_CELLS} />
        <div className="tm-editor">
          <TextArea label="Transition table: state symbol -> write move next" value={state.text} onChange={state.setText} rows={TABLE_ROWS} className="tm-table" />
          {state.tableError && <p className="tm-error" role="alert">{state.tableError} The machine below is the last table that parsed.</p>}
          <CodePanel title="The machine as read" lines={machine.rules.map(ruleLine)} active={active >= 0 ? active : null} />
        </div>
        <Box variant="sunken">
          <ConsolePanel title="check" lines={report ? checkLines(report, task) : []} empty="Check runs your table on a fixed list of inputs and compares each result with the oracle." />
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a one-tape teaching machine; the tape is unbounded and a run is cut at the step budget</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
