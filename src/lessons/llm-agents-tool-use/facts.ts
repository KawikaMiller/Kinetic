/** The numbers the try-this entries and quiz explanations quote, each computed from a run at the scene's opening state. */
import { closedFormProcessed, runAgent } from './agent';
import { AUDIT_GOAL, CONTEXT_DEFAULT, GUARD_DEFAULT, GUARD_PRESETS, LOOP_DEFAULT, LOOP_TASKS, PAGE_GOAL, REFUND_TASKS, TRUST_DEFAULT, baseConfig } from './settings';

export const loopConfig = (taskId: string, over = {}) =>
  baseConfig({ goal: LOOP_TASKS.find((t) => t.id === taskId)!.goal, budgetWords: LOOP_DEFAULT.budgetWords, stepBudget: LOOP_DEFAULT.stepBudget, ...over });

export const contextConfig = (over = {}) => baseConfig({ goal: AUDIT_GOAL, ...CONTEXT_DEFAULT, ...over });

export const guardConfig = (taskId: string, preset: keyof typeof GUARD_PRESETS, over = {}) =>
  baseConfig({ goal: REFUND_TASKS.find((t) => t.id === taskId)!.goal, ...GUARD_PRESETS[preset].guards, failureRate: GUARD_DEFAULT.failureRate, seed: GUARD_DEFAULT.seed, ...over });

export const trustConfig = (over = {}) =>
  baseConfig({ goal: PAGE_GOAL, trust: TRUST_DEFAULT.trust, approval: TRUST_DEFAULT.approval, seed: TRUST_DEFAULT.seed, ...over });

export function loopFacts() {
  const total = runAgent(loopConfig('total'));
  const tight = runAgent(loopConfig('total', { stepBudget: 2 }));
  return { total, tight, steps: total.steps };
}

export function contextFacts() {
  const open = runAgent(contextConfig());
  const summarised = runAgent(contextConfig({ overflow: 'summarise' }));
  const roomy = runAgent(contextConfig({ budgetWords: 2000 }));
  const c0 = roomy.contextByStep[0];
  const d = roomy.contextByStep[1] - roomy.contextByStep[0];
  return { open, summarised, roomy, c0, d, closed: closedFormProcessed(c0, d, roomy.steps) };
}

export function guardFacts() {
  const readonly = runAgent(guardConfig('r1042', 'readonly'));
  const waiting = runAgent(guardConfig('r1042', 'approval'));
  const approved = runAgent(guardConfig('r1042', 'approval', { approvals: ['approve'] }));
  const openBig = runAgent(guardConfig('r1043', 'open'));
  const validatedBig = runAgent(guardConfig('r1043', 'open', { validateArguments: true }));
  return { readonly, waiting, approved, openBig, validatedBig };
}

export function trustFacts() {
  const naive = runAgent(trustConfig());
  const separated = runAgent(trustConfig({ trust: 'separated' }));
  const withoutTool = runAgent(trustConfig({ offered: ['fetch_page', 'lookup_order', 'search_docs', 'calc', 'refund'] }));
  const gated = runAgent(trustConfig({ approval: true }));
  const denied = runAgent(trustConfig({ approval: true, approvals: ['deny'] }));
  return { naive, separated, withoutTool, gated, denied };
}
