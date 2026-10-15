import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { symbolAt, tapeText, TM_BLANK } from '../../core/tm';
import { binaryValue, judge, shown, STEP_BUDGET, type TaskId, type TmFrame, type SizePoint, doublingRatio, DOUBLING_FROM, growthWord } from './model';

const MOVE_WORD = { L: 'moved left', R: 'moved right', S: 'stayed put' } as const;
const symbolWord = (s: string) => (s === TM_BLANK ? 'a blank' : s);

/** How a stopped run ended, said from the run itself and the task's oracle. */
function endCaption(f: TmFrame, task: TaskId, input: string): ReactNode {
  const steps = plural(f.step, 'step');
  if (f.end === 'stuck') {
    const { state } = f.config;
    return (
      <>
        <span className="hl orange">stuck in {state} reading {symbolWord(symbolAt(f.config, f.config.head))}</span> after {steps}: the table has no rule for it, so the machine stops without answering. That is a different failure from a wrong answer.
      </>
    );
  }
  if (f.end === 'budget') {
    return (
      <>
        <span className="hl wrap">did not halt within {STEP_BUDGET.toLocaleString('en-US')} steps</span>{f.skipped ? ' (the animation jumped here from the first moves)' : ''}. This run alone cannot tell whether it halts later.
      </>
    );
  }
  const verdict = judge(task, input, { status: 'halted', steps: f.step, config: f.config });
  const tape = tapeText(f.config);
  if (verdict.kind === 'right') {
    return task === 'increment' ? (
      <>Halted in {f.config.state} after {steps}. The tape reads <span className="hl ok">{tape}</span> (in decimal, {String(binaryValue(input))} + 1 = {String(binaryValue(tape))}).</>
    ) : (
      <>Halted in <span className="hl ok">{f.config.state}</span> after {steps}, which is the right answer for {shown(input)}.</>
    );
  }
  if (verdict.kind === 'wrong') {
    return task === 'increment' ? (
      <>Halted in {f.config.state} after {steps}, but <span className="hl bad">the tape reads {verdict.got}</span>, not the number plus one ({verdict.expected}).</>
    ) : (
      <>Halted in <span className="hl bad">{verdict.got}</span> after {steps}, but {shown(input)} should end in {verdict.expected}.</>
    );
  }
  return <>Stopped after {steps}.</>;
}

/** The caption for one frame of the stepper. */
export function stepCaption(f: TmFrame, task: TaskId, input: string): ReactNode {
  if (f.end !== 'running') return endCaption(f, task, input);
  if (!f.rule) {
    return <>The input {shown(input)} is on the tape, the head is on its leftmost cell and the machine is in <b>{f.config.state}</b>. Step, or press play.</>;
  }
  const { rule } = f;
  return (
    <>
      Step {f.step}: in <b>{rule.state}</b> reading {symbolWord(rule.read)}, {rule.write === rule.read ? 'left it as it was' : `wrote ${symbolWord(rule.write)}`}, {MOVE_WORD[rule.move]}, now in <b>{rule.next}</b>.
    </>
  );
}

/** Scene 3: what the measured steps say about growth, computed from the same points the plot draws. */
export function sizeCaption(task: TaskId, points: readonly SizePoint[]): ReactNode {
  const input = task === 'increment' ? 'all ones' : 'all a';
  const ok = points.filter((p) => p.steps !== null);
  if (ok.length === 0) {
    return <>This table does not reach a halting state on the {input} inputs (stuck, or over {STEP_BUDGET.toLocaleString('en-US')} steps), so there is no curve to draw.</>;
  }
  const last = ok[ok.length - 1];
  const ratio = doublingRatio(points, DOUBLING_FROM);
  const missing = points.length - ok.length;
  return (
    <>
      {task === 'increment' ? 'Increment' : 'Palindrome'} on {input}, lengths 1 to {points.length}: {last.steps} steps at length {last.n}.
      {ratio !== null && <> Doubling the input from {DOUBLING_FROM} to {DOUBLING_FROM * 2} cells multiplies the steps by <b>{ratio.toFixed(2)}</b>, {growthWord(ratio)}.</>}
      {missing > 0 && <> {plural(missing, 'length')} did not reach a halting state and {missing === 1 ? 'is' : 'are'} left off the plot.</>}
    </>
  );
}
