/** Captions: every number from the run on screen. Plain strings, so tests can read them. */
import { plural } from '../../core/format';
import type { AgentConfig, AgentRun } from './agent';

export const AUDIT_ANSWER = 'First unpaid order: 1047.';

const outcomeText = (run: AgentRun): string =>
  run.outcome === 'answered' ? `answered "${run.answer}"` : run.outcome === 'paused' ? 'paused, waiting for an approval' : 'stopped: step budget reached, with no answer';

export function loopCaption(label: string, run: AgentRun, shown: number): string {
  const e = run.events[Math.min(shown, run.events.length) - 1];
  const at = e ? `Showing event ${shown} of ${run.events.length}, a ${e.phase} event of step ${e.step}.` : 'Nothing has happened yet.';
  return `${label}: ${plural(run.steps, 'model call')}, ${outcomeText(run)}. ${at} The policy is scripted, not a language model.`;
}

export function contextCaption(run: AgentRun, cfg: AgentConfig, ifNothingDropped: number): string {
  const head = `The audit made ${plural(run.steps, 'model call')} and the model re-read ${run.processed.toLocaleString('en-US')} words in total (${ifNothingDropped.toLocaleString('en-US')} if nothing had been dropped), because every call resends the whole history.`;
  if (run.overflowEvents === 0) return `${head} The context stayed within its ${cfg.budgetWords}-word budget, so nothing was dropped.`;
  const kept = run.answer === AUDIT_ANSWER;
  if (cfg.overflow === 'truncate') {
    return run.goalDroppedAtStep === null
      ? `${head} The oldest entries were dropped ${plural(run.overflowEvents, 'time')}, but the goal stayed.`
      : `${head} Truncating the oldest entries dropped the goal at step ${run.goalDroppedAtStep}, and the scripted policy, which reads the goal from its context, ${kept ? 'still answered correctly' : 'answered a different question'}: "${run.answer}"`;
  }
  return `${head} Summarising kept the goal and the last result, so the policy ${kept ? 'went on to the right answer' : 'lost the thread'}: "${run.answer}"`;
}

export function guardCaption(run: AgentRun, goal: string): string {
  const writes = run.writes.length === 0 ? 'No write tool ran.' : `${plural(run.writes.length, 'write')} ran: ${run.writes.map((w) => `${w.call.tool}${w.approved ? ' (approved)' : ' (no approval asked)'}`).join(', ')}.`;
  return `Goal "${goal}": ${outcomeText(run)}. ${writes} The tool failures here are seeded and simulated.`;
}

export function trustCaption(run: AgentRun, trust: 'naive' | 'separated'): string {
  const attempted = run.events.some((e) => e.phase === 'act' && e.text.startsWith('send_email'));
  const executed = run.writes.some((w) => !w.requested);
  const policy = trust === 'naive' ? 'The naive stand-in treats any text in its context as instructions' : 'The separated stand-in treats tool output as data';
  const result = executed
    ? 'It attempted a write the task never asked for, and the write ran: the fake outbox has a message.'
    : run.outcome === 'paused'
      ? 'It attempted a write the task never asked for and the gate is waiting for your decision: nothing has run yet.'
      : attempted
        ? 'It attempted a write the task never asked for, and the guardrail stopped it: nothing ran.'
        : 'It made no write attempt.';
  const stand = trust === 'separated' ? ' This stand-in is hard-coded to skip the instruction in the text; a real model gives no such guarantee.' : '';
  return `${policy}. ${result}${stand} The defence is the permissions and the gate around the model, not the wording of a prompt.`;
}
