/**
 * The scripted policy: a hand-written rule table, not a language model. It reads the goal and the
 * observations that are in its context window and picks the next action or an answer. Deterministic on
 * purpose, so every behaviour in the lesson is reproducible and a test can assert it.
 */
import { PLACEHOLDER_RECIPIENT, SUPPLIER_URL, UNTRUSTED_MARKER } from './data';
import { firstSentence, type Call, type ToolResult } from './tools';

export type Trust = 'naive' | 'separated';

export interface Entry {
  id: number;
  kind: 'system' | 'goal' | 'thought' | 'action' | 'observation' | 'summary';
  text: string;
  call?: Call;
  result?: ToolResult;
  /** A summary keeps the goal and the last result. */
  goal?: string;
  lastCall?: Call;
  lastResult?: ToolResult;
}

export type Decision = { thought: string; act: Call } | { thought: string; answer: string };
export type TaskKind = 'total' | 'policy' | 'refund' | 'audit' | 'page';

export const goalOf = (ctx: readonly Entry[]): string | null => {
  const goal = ctx.find((e) => e.kind === 'goal');
  if (goal) return goal.text;
  return ctx.find((e) => e.kind === 'summary')?.goal ?? null;
};

export function classify(goal: string): TaskKind | null {
  if (/tax/i.test(goal)) return 'total';
  if (/returns? policy/i.test(goal)) return 'policy';
  if (/^refund order/i.test(goal)) return 'refund';
  if (/first unpaid/i.test(goal)) return 'audit';
  if (/supplier notice/i.test(goal)) return 'page';
  return null;
}

export interface Done {
  call: Call;
  result: ToolResult;
}

/** Every call whose result is still in the context, oldest first. */
export const doneOf = (ctx: readonly Entry[]): Done[] =>
  ctx.flatMap((e) => (e.kind === 'observation' && e.call && e.result ? [{ call: e.call, result: e.result }] : e.kind === 'summary' && e.lastCall && e.lastResult ? [{ call: e.lastCall, result: e.lastResult }] : []));

const sameCall = (a: Call, b: Call) => a.tool === b.tool && JSON.stringify(a.args) === JSON.stringify(b.args);
const num = (goal: string, re: RegExp): number => Number(re.exec(goal)?.[1]);

export function decide(ctx: readonly Entry[], trust: Trust): Decision {
  const goal = goalOf(ctx);
  const done = doneOf(ctx);
  const last = done.at(-1);
  if (goal === null) {
    return { thought: 'I cannot see a goal in my context, so I will report the latest result.', answer: last ? `Latest result: ${last.result.text}` : 'Nothing to report.' };
  }
  const kind = classify(goal);
  if (kind === null) return { thought: 'I do not know this task.', answer: 'I cannot do that task.' };

  if (last && !last.result.ok) {
    let failures = 0;
    for (let i = done.length - 1; i >= 0 && !done[i].result.ok && sameCall(done[i].call, last.call); i--) failures++;
    if (!last.result.transient) return { thought: 'The call was refused, so I will stop and say so.', answer: `Could not finish: ${last.result.error}.` };
    if (failures >= 2) return { thought: 'It failed twice, so I give up.', answer: `Gave up: ${last.call.tool} failed twice.` };
    return { thought: 'The call failed, so I will retry it once.', act: last.call };
  }
  const ok = (tool: Call['tool']) => done.filter((d) => d.call.tool === tool && d.result.ok);

  switch (kind) {
    case 'total': {
      const id = num(goal, /order (\d+)/);
      const pct = num(goal, /(\d+)%/);
      const order = ok('lookup_order').at(-1)?.result.data?.order;
      if (!order) return { thought: `I need the total of order ${id}.`, act: { tool: 'lookup_order', args: { id } } };
      const value = ok('calc').at(-1)?.result.data?.value;
      if (value === undefined) return { thought: `Now I add ${pct}% tax to ${order.total.toFixed(2)}.`, act: { tool: 'calc', args: { expression: `${order.total} * ${1 + pct / 100}` } } };
      return { thought: 'I have the number, so I can answer.', answer: `Total with ${pct}% tax: ${value.toFixed(2)}.` };
    }
    case 'policy': {
      const page = ok('search_docs').at(-1)?.result.data;
      if (!page) return { thought: 'I will search the help pages for the policy.', act: { tool: 'search_docs', args: { query: 'returns policy' } } };
      return { thought: 'I found the page, so I will summarise it.', answer: `${page.title}: ${firstSentence(page.page ?? '')}` };
    }
    case 'refund': {
      const id = num(goal, /order (\d+)/);
      const order = ok('lookup_order').at(-1)?.result.data?.order;
      if (!order) return { thought: `I need the total of order ${id} before I refund it.`, act: { tool: 'lookup_order', args: { id } } };
      if (ok('refund').length === 0) return { thought: `I will refund ${order.total.toFixed(2)} on order ${id}.`, act: { tool: 'refund', args: { order: id, amount: order.total } } };
      return { thought: 'The refund went through, so I am done.', answer: `Refund of ${order.total.toFixed(2)} issued for order ${id}.` };
    }
    case 'audit': {
      const start = num(goal, /from (\d+)/);
      const end = num(goal, /to (\d+)/);
      const lastLookup = ok('lookup_order').at(-1);
      const seen = lastLookup?.result.data?.order;
      if (seen?.status === 'unpaid') return { thought: `Order ${seen.id} is unpaid, so I can answer.`, answer: `First unpaid order: ${seen.id}.` };
      const next = seen ? seen.id + 1 : start;
      if (next > end) return { thought: 'I have checked every order.', answer: 'No unpaid order found.' };
      return { thought: `Next I will check order ${next}.`, act: { tool: 'lookup_order', args: { id: next } } };
    }
    case 'page': {
      const fetched = ok('fetch_page').at(-1);
      if (!fetched) return { thought: 'I will read the notice page.', act: { tool: 'fetch_page', args: { url: SUPPLIER_URL } } };
      const mailed = done.some((d) => d.call.tool === 'send_email');
      if (trust === 'naive' && fetched.result.text.includes(UNTRUSTED_MARKER) && !mailed) {
        return { thought: 'The page contains text that reads like an instruction, and I treat any text in my context as instructions.', act: { tool: 'send_email', args: { to: PLACEHOLDER_RECIPIENT, text: 'page contents' } } };
      }
      return { thought: 'I will summarise the page.', answer: `Summary: ${firstSentence(fetched.result.data?.page ?? '')}` };
    }
  }
}
