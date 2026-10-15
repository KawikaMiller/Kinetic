import { useEffect, useState, type ReactNode } from 'react';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { endText } from './captions';
import { CHECK_BUDGET, checkTerm, MAX_INPUT, TASK_IDS, TASKS, type CheckResult, type TaskId } from './tasks';
import { TermText } from './TermText';
import { NAMED_SOURCE, parse, print, type Term } from './term';

interface Attempt {
  task: TaskId;
  term: Term;
  result: CheckResult;
}

const resultLines = (a: Attempt): ConsoleLine[] => {
  const task = TASKS[a.task];
  if (!a.result.failure) return [{ text: `All ${a.result.total} cases give the expected normal form (up to alpha-equivalence). That is a test of ${a.result.total} inputs, not a proof.`, tone: 'ok' }];
  const f = a.result.failure;
  const produced = f.end.kind === 'normal'
    ? `produced ${print(f.produced)}, which reads as ${f.reads}`
    : endText(f.end, { steps: 0, budget: CHECK_BUDGET, strategy: 'normal' });
  return [`Checked ${task.cases.length} cases (${task.goal}).`, { text: `First failure, ${f.label}: ${produced}; expected ${print(f.expected)}.`, tone: 'bad' }];
};

/** Scene 3: write a term for succ, add, mul, and or not; Check applies it to numerals or booleans. */
export function BuildScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [task, setTask] = useState<TaskId>('succ');
  const [texts, setTexts] = useState<Record<TaskId, string>>(() => Object.fromEntries(TASK_IDS.map((id) => [id, TASKS[id].starter])) as Record<TaskId, string>);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [tried, setTried] = useState<Record<TaskId, boolean>>({ succ: false, add: false, mul: false, and: false, not: false });
  const spec = TASKS[task];
  const text = texts[task];
  const parsed = parse(text);
  const shown = attempt && attempt.task === task ? attempt : null;

  useEffect(() => {
    setCaption(
      shown?.result.failure ? <>Not yet: {shown.result.failure.label} gives {shown.result.failure.reads}. Fix the term and check again.</>
        : shown ? <>Every case passes. Applying your term to the numerals or booleans and reducing gives what {spec.label} should.</>
        : <>Write a term for <b>{spec.label}</b>: {spec.goal}. Check applies it to {spec.cases.length} inputs.</>,
      { quiet: true },
    );
  }, [setCaption, shown, spec]);

  const setText = (next: string) => setTexts({ ...texts, [task]: next });
  const check = () => {
    if (!parsed.ok) return;
    setAttempt({ task, term: parsed.term, result: checkTerm(spec, parsed.term) });
    setTried({ ...tried, [task]: true });
  };
  const insert = (id: keyof typeof NAMED_SOURCE) => setText(`${text}${text.trim() ? ' ' : ''}(${NAMED_SOURCE[id]})`);

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Task" value={spec.label} sub={spec.goal} />
          <Stat label="Cases" value={shown ? (shown.result.failure ? 'not all pass' : `${shown.result.total} of ${shown.result.total}`) : `${spec.cases.length} to check`} color={shown ? (shown.result.failure ? 'var(--bad)' : 'var(--ok)') : undefined} sub={`numerals 0 to ${MAX_INPUT}, or both booleans`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'every case matches the expected normal form', shape: 'square' }, { color: 'var(--bad)', label: 'the first case that fails', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Build" value={task} onChange={setTask} options={TASK_IDS.map((id) => ({ value: id, label: TASKS[id].label }))} />
        </>,
        <>
          <TextField label={`Your term for ${spec.label}`} value={text} onChange={setText} onEnter={check} width={340} spellCheck={false} ariaLabel={`Term for ${spec.label}`} />
          <Button variant="primary" onClick={check} disabled={!parsed.ok}>Check</Button>
          {spec.helpers.length > 0 && (
            <ControlGroup label="Insert, shown expanded" inline>
              {spec.helpers.map((id) => <ChipButton key={id} tone="info" onClick={() => insert(id)}>{id}</ChipButton>)}
            </ControlGroup>
          )}
        </>,
      ]}
    >
      <div className="ld stage-pad">
        {!parsed.ok && <Hint tone="muted"><span role="alert">{parsed.error}</span></Hint>}
        {parsed.ok && <TermText term={parsed.term} ariaLabel={print(parsed.term)} />}
        <ConsolePanel title="check" lines={shown ? resultLines(shown) : []} empty="Press Check to apply your term to the inputs." />
        {tried[task] && <p className="ld-note">Hint: {spec.hint}</p>}
        {!tried[task] && <Hint tone="muted">Press Check once and a hint about the shape opens.</Hint>}
        <ProvenanceRow>
          <Provenance kind="toy">the checker reduces your term applied to Church numerals or booleans in normal order and compares normal forms up to renaming</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
