import type { LessonModule } from '../../core/types';
import { contextFacts, guardFacts, loopFacts, trustFacts } from './facts';
import { BUDGET_MIN, CONTEXT_DEFAULT } from './settings';
import { Stage } from './Stage';

const loop = loopFacts();
const ctx = contextFacts();
const guard = guardFacts();
const trust = trustFacts();
const n = (v: number) => v.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An agent is a loop around a model and some tools: it thinks, calls a tool, reads the result, and repeats, so its safety depends on the permissions and gates around the loop more than on anything the model says.',
    what: 'Each pass of the loop resends the whole history to the model, which picks the next tool call or an answer. The history grows, so the words read grow with the square of the steps, and when it overflows something has to be dropped, possibly the goal itself. Tools can fail, write tools change the world, and text fetched by a tool is data that can look like an instruction. Guardrails (which tools are offered, validated arguments, a human approval for writes) are what keep a wrong step from becoming a harmful one. Here the model is a scripted rule table, so every behaviour is reproducible.',
    analogy: 'An assistant who reads the entire case file aloud from page one before every single decision, and who has been given a company card: the file gets longer each time, and the card limit matters more than their good intentions.',
    useCases: [
      'Support assistants that look up orders and issue refunds',
      'Coding agents that read files, run tests and edit code',
      'Research agents that search, read pages and summarise',
      'Deciding which tools an agent gets and which actions need a person',
    ],
    why: 'Agent failures are system failures: a dropped goal, a runaway loop, a write nobody approved. Seeing the loop, the growing context and the guardrails as ordinary engineering lets you budget steps and words, scope permissions, and put a gate where a mistake would cost something.',
    watch:
      'The log colours each line: the policy\'s thought is blue, a tool call yellow, a successful result green, a failure or rejected call red, a call waiting for your approval orange, the final answer violet. Fetched text that is untrusted has an orange dashed outline and the label "untrusted". The violet bar and curve are words in the context window, red once over the budget, and the goal shows struck through in grey when it has been dropped. The scripted policy is not a language model.',
  },
  tryThis: [
    `In "The loop", the tax task finishes in ${loop.steps} model calls with "${loop.total.answer}". Set Step budget to 2: it stops with "stopped: step budget reached" and no answer.`,
    `In "The context fills", the audit runs at a ${BUDGET_MIN}-word budget with Truncate the oldest: the goal is dropped at step ${ctx.open.goalDroppedAtStep} and the scripted policy answers a different question. Switch to Summarise and it finds order 1047. Raise Context budget to 2,000 and the model re-reads ${n(ctx.roomy.processed)} words in ${ctx.roomy.steps} calls.`,
    `In "Guardrails", the Read-only agent cannot refund order 1042 (it answers "${guard.readonly.answer}"). Press Writes behind approval: it pauses; press Approve and the ledger shows ${guard.approved.writes.length} refund. Press Writes and no gate, then Refund order 1043: ${n(Number(guard.openBig.writes[0].call.args.amount))} goes out; turn Argument validation on and it is rejected.`,
    `In "Untrusted data", the naive policy treats the page's untrusted block as an instruction and sends an unrequested message (${trust.naive.world.outbox.length} in the outbox). Switch to Separated, or turn send_email to Not offered, or turn the Approval gate on: the outbox stays empty.`,
  ],
  keyIdeas: [
    'The agent loop resends the whole history each step, so in this model the total words read grow with the square of the steps, and a step budget is what ends a loop that does not finish.',
    'When the context overflows, dropping the oldest entries can drop the goal, and a policy that reads its goal from the context then answers a different question.',
    'Guardrails sit outside the model: which tools are offered, validated arguments and a human approval for writes decide what a call can do, whatever the model chose.',
    'Fetched text is data, but a policy that treats context as instructions can be steered by it; in this model least privilege and an approval gate stop the write, which is common current guidance and not a standard.',
  ],
  quiz: [
    {
      q: 'A fetched page carries instruction-like text and the agent has a send_email tool. Which control keeps working whatever the model decides?',
      options: [
        'Permissions outside the model: not offering send_email, or holding writes for approval, limit what any call can do',
        'A firm sentence in the system prompt telling the model to ignore any instructions that it finds in fetched pages or tool output',
        'A larger model, which can tell the difference between a page it is reading and an instruction from the user',
        'Asking the model to repeat the user\'s goal before every tool call, so that it stays on the task at hand',
      ],
      answer: 0,
      why: `With the naive stand-in the unrequested write ${trust.naive.writes.length > 0 ? 'ran' : 'did not run'} and the outbox held ${trust.naive.world.outbox.length} message. With send_email not offered, or with the approval gate on, the outbox held ${trust.withoutTool.world.outbox.length} and ${trust.denied.world.outbox.length}: the guardrail does not depend on the policy's behaviour.`,
    },
    {
      q: 'An agent run takes 9 model calls and each call adds the same number of words. Why do the words it reads grow faster than 9 times one call?',
      options: [
        'Each call resends the whole history, so call i reads i turns of context and the total grows like the square of the steps',
        'Each tool result is larger than the one before it, so the context grows faster with every step that the loop takes in total',
        'The model re-reads its tool descriptions on top of the history, and they are added again to the context each step',
        'Each step re-runs the earlier steps from scratch, which is why the earlier tool calls are repeated in the log',
      ],
      answer: 0,
      why: `In the audit the first call reads ${ctx.c0} words and each turn adds ${ctx.d}, so ${ctx.roomy.steps} calls read ${n(ctx.roomy.processed)} words, equal to the closed form ${ctx.roomy.steps} x ${ctx.c0} + ${ctx.d} x ${ctx.roomy.steps} x ${ctx.roomy.steps - 1} / 2 = ${n(ctx.closed)}.`,
    },
    {
      q: `The audit overflows a ${CONTEXT_DEFAULT.budgetWords}-word context and the oldest entries are truncated. Why does the scripted policy answer a different question?`,
      options: [
        'The goal was the oldest entry, so truncation removed it, and this policy reads the goal from its context',
        'Truncation shuffles the entries that remain, so the policy reads the observations in the wrong order and loses the thread',
        'The step budget ended the run early, so the policy answered from whatever it had already seen',
        'The summary stub replaced the goal with the last result, which the policy then took as a new goal',
      ],
      answer: 0,
      why: `The goal is dropped at step ${ctx.open.goalDroppedAtStep}, and the rule reports the latest result instead of order 1047. Summarising keeps the goal and the last result, and the same run answers "${ctx.summarised.answer}"`,
    },
    {
      q: 'With human approval on, the naive stand-in still tries the unrequested write. What happens?',
      options: [
        'The loop pauses at the write and nothing runs until you press Approve; Deny leaves the outbox empty',
        'The attempt is blocked before it reaches the gate, because a naive policy cannot call a write tool',
        'The write runs at once and the approval is recorded afterwards, so that it can be audited later on',
        'The policy switches to the separated rule once a gate exists, so it does not attempt the write at all',
      ],
      answer: 0,
      why: `The gated run is ${trust.gated.outcome} with ${trust.gated.writes.length} writes executed; denied, the outbox holds ${trust.denied.world.outbox.length}. In this model the gate leaves what the policy tries unchanged and controls what is allowed to happen.`,
    },
    {
      q: 'The tax task needs 3 model calls and the step budget is 2. What does the loop report?',
      options: [
        'It stops with "step budget reached" and no answer, which is how a loop that cannot finish is ended',
        'It answers with the partial total, because the order lookup alone already gave it a number to use',
        'It reports that the loop will never stop, since a task that needs more steps cannot come to an end',
        'It raises the budget by itself until the task has enough calls to produce an answer for the user',
      ],
      answer: 0,
      why: `The tight run makes ${loop.tight.steps} calls and ends "${loop.tight.events.at(-1)?.text}" with answer ${loop.tight.answer === null ? 'none' : loop.tight.answer}. A budget turns an open-ended loop into a bounded one, and the report says what happened.`,
    },
  ],
};

export default lesson;
