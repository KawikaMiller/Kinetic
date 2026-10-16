/**
 * The agent loop: think (the scripted policy decides), act (a tool runs, or is stopped by a guardrail),
 * observe (the result goes back into the context). The whole history is resent every step, so the words
 * processed grow with the square of the number of steps.
 */
import { mulberry32 } from '../../core/random';
import { REFUND_LIMIT, SYSTEM_PROMPT } from './data';
import { classify, decide, doneOf, goalOf, type Entry, type TaskKind, type Trust } from './policy';
import { callText, emptyWorld, executeTool, isWrite, type Call, type ToolName, type ToolResult, type World } from './tools';

export type Overflow = 'truncate' | 'summarise';
export type ApprovalChoice = 'approve' | 'deny';
export type Phase = 'system' | 'think' | 'act' | 'observe' | 'answer' | 'guard';

export interface AgentConfig {
  goal: string;
  /** Context budget in words (a stand-in for tokens). */
  budgetWords: number;
  stepBudget: number;
  overflow: Overflow;
  offered: readonly ToolName[];
  validateArguments: boolean;
  /** Write tools wait for a human decision. */
  approval: boolean;
  /** Decisions already given, in the order the pauses came. */
  approvals: readonly ApprovalChoice[];
  failureRate: number;
  seed: number;
  trust: Trust;
}

export interface AgentEvent {
  id: number;
  step: number;
  phase: Phase;
  text: string;
  /** Words in the context when this step's model call was made. */
  contextWords?: number;
  /** For an observation: the tool call succeeded. */
  ok?: boolean;
}

export interface ApprovalRecord {
  call: Call;
  decision: ApprovalChoice;
}

export interface ExecutedWrite {
  call: Call;
  requested: boolean;
  approved: boolean;
}

export type Outcome = 'answered' | 'stopped' | 'paused';

export interface AgentRun {
  events: AgentEvent[];
  outcome: Outcome;
  answer: string | null;
  steps: number;
  /** Context words at each model call, in step order (after any truncation or summary). */
  contextByStep: number[];
  /** Sum of `contextByStep`: what the model had to read in total. */
  processed: number;
  world: World;
  approvals: ApprovalRecord[];
  writes: ExecutedWrite[];
  /** A write call waiting for Approve or Deny. */
  pending: Call | null;
  /** The goal was still in the context at the last model call. */
  goalKept: boolean;
  /** First step whose context no longer held the goal, or null. */
  goalDroppedAtStep: number | null;
  overflowEvents: number;
}

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
export const contextWords = (ctx: readonly Entry[]): number => ctx.reduce((sum, e) => sum + wordCount(e.text), 0);

/** Does this write call belong to the task? Only a refund task asks for a refund on its own order. */
export function isRequested(kind: TaskKind | null, goal: string, call: Call): boolean {
  if (kind !== 'refund' || call.tool !== 'refund') return false;
  return Number(call.args.order) === Number(/order (\d+)/.exec(goal)?.[1]);
}

/** Closed form of the words processed by n steps that each add d words to a starting context of c0. */
export const closedFormProcessed = (c0: number, d: number, n: number): number => n * c0 + (d * n * (n - 1)) / 2;

const lastTurn = (ctx: readonly Entry[]) => doneOf(ctx).at(-1);

function shrink(ctx: Entry[], cfg: AgentConfig, nextId: () => number): { ctx: Entry[]; note: string } {
  if (cfg.overflow === 'summarise') {
    const goal = goalOf(ctx);
    const last = lastTurn(ctx);
    const system = ctx.filter((e) => e.kind === 'system');
    const text = `Summary: goal ${goal ?? 'unknown'}; last result: ${last ? last.result.text : 'none'}`;
    const summary: Entry = { id: nextId(), kind: 'summary', text, goal: goal ?? undefined, lastCall: last?.call, lastResult: last?.result };
    return { ctx: [...system, summary], note: 'context over budget: older turns summarised, goal and last result kept' };
  }
  const next = [...ctx];
  let dropped = 0;
  while (contextWords(next) > cfg.budgetWords && next.length > 2) {
    const at = next.findIndex((e) => e.kind !== 'system');
    next.splice(at, 1);
    dropped++;
  }
  return { ctx: next, note: `context over budget: the ${dropped} oldest entries were dropped` };
}

export function runAgent(cfg: AgentConfig): AgentRun {
  const rnd = mulberry32(cfg.seed);
  const world = emptyWorld();
  let counter = 0;
  const nextId = () => counter++;
  let ctx: Entry[] = [
    { id: nextId(), kind: 'system', text: SYSTEM_PROMPT },
    { id: nextId(), kind: 'goal', text: cfg.goal },
  ];
  const goal = cfg.goal;
  const kind = classify(goal);
  const events: AgentEvent[] = [];
  const log = (step: number, phase: Phase, text: string, extra: Partial<AgentEvent> = {}) => events.push({ id: events.length, step, phase, text, ...extra });
  const contextByStep: number[] = [];
  const approvals: ApprovalRecord[] = [];
  const writes: ExecutedWrite[] = [];
  let approvalIndex = 0;
  let overflowEvents = 0;
  let outcome: Outcome = 'stopped';
  let answer: string | null = null;
  let pending: Call | null = null;
  let step = 0;
  let goalKept = true;
  let goalDroppedAtStep: number | null = null;

  while (true) {
    if (step >= cfg.stepBudget) {
      log(step, 'guard', 'stopped: step budget reached');
      break;
    }
    step++;
    if (contextWords(ctx) > cfg.budgetWords) {
      const shrunk = shrink(ctx, cfg, nextId);
      ctx = shrunk.ctx;
      overflowEvents++;
      log(step, 'guard', shrunk.note);
    }
    const words = contextWords(ctx);
    contextByStep.push(words);
    goalKept = goalOf(ctx) !== null;
    if (!goalKept && goalDroppedAtStep === null) goalDroppedAtStep = step;
    const decision = decide(ctx, cfg.trust);
    ctx.push({ id: nextId(), kind: 'thought', text: decision.thought });
    log(step, 'think', decision.thought, { contextWords: words });
    if ('answer' in decision) {
      ctx.push({ id: nextId(), kind: 'thought', text: decision.answer });
      log(step, 'answer', decision.answer);
      outcome = 'answered';
      answer = decision.answer;
      break;
    }
    const call = decision.act;
    ctx.push({ id: nextId(), kind: 'action', text: callText(call), call });
    log(step, 'act', callText(call));

    let result: ToolResult;
    const refuse = (error: string): ToolResult => ({ ok: false, text: `error: ${error}`, error });
    let approved = false;
    if (!cfg.offered.includes(call.tool)) {
      result = refuse(`${call.tool} is not offered to this agent`);
      log(step, 'guard', `rejected: ${call.tool} is not offered`);
    } else if (cfg.validateArguments && call.tool === 'refund' && Number(call.args.amount) > REFUND_LIMIT) {
      result = refuse(`a refund above ${REFUND_LIMIT} is rejected`);
      log(step, 'guard', `rejected: refund of ${Number(call.args.amount).toFixed(2)} is above the limit of ${REFUND_LIMIT}`);
    } else if (cfg.approval && isWrite(call.tool) && cfg.approvals[approvalIndex] === undefined) {
      pending = call;
      outcome = 'paused';
      log(step, 'guard', `waiting for approval: ${callText(call)}`);
      break;
    } else if (cfg.approval && isWrite(call.tool) && cfg.approvals[approvalIndex] === 'deny') {
      approvals.push({ call, decision: 'deny' });
      approvalIndex++;
      result = refuse('the approver denied this call');
      log(step, 'guard', `denied by the approver: ${callText(call)}`);
    } else {
      if (cfg.approval && isWrite(call.tool)) {
        approvals.push({ call, decision: 'approve' });
        approvalIndex++;
        approved = true;
        log(step, 'guard', `approved: ${callText(call)}`);
      }
      if (rnd() < cfg.failureRate) {
        result = { ok: false, text: 'error: the tool failed (simulated)', error: 'the tool failed (simulated)', transient: true };
      } else {
        result = executeTool(call, world);
        if (isWrite(call.tool) && result.ok) writes.push({ call, requested: isRequested(kind, goal, call), approved });
      }
    }
    ctx.push({ id: nextId(), kind: 'observation', text: result.text, call, result });
    log(step, 'observe', result.text, { ok: result.ok });
  }

  return {
    events, outcome, answer, steps: step, contextByStep, processed: contextByStep.reduce((a, b) => a + b, 0),
    world, approvals, writes, pending, goalKept, goalDroppedAtStep, overflowEvents,
  };
}
