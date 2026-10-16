/** Tasks, presets and the opening states of the four scenes (pure data, tested against the try-this entries). */
import type { AgentConfig, Overflow } from './agent';
import { TOOLS, type ToolName } from './tools';

export const SCENES = ['loop', 'context', 'guard', 'trust'] as const;
export type SceneId = (typeof SCENES)[number];

export interface Task {
  id: string;
  label: string;
  goal: string;
}

export const LOOP_TASKS: readonly Task[] = [
  { id: 'total', label: "Order 1042's total with 8% tax", goal: "What is order 1042's total with 8% tax?" },
  { id: 'policy', label: 'Returns policy', goal: 'Find the returns policy and summarise it' },
  { id: 'refund', label: 'Refund order 1042', goal: 'Refund order 1042' },
];
export const AUDIT_GOAL = 'Find the first unpaid order from 1040 to 1049';
export const REFUND_TASKS: readonly Task[] = [
  { id: 'r1042', label: 'Refund order 1042', goal: 'Refund order 1042' },
  { id: 'r1043', label: 'Refund order 1043', goal: 'Refund order 1043' },
];
export const PAGE_GOAL = 'Summarise the supplier notice page';

export const BUDGET_MIN = 200;
export const BUDGET_MAX = 2000;
export const BUDGET_STEP = 100;
export const STEPS_MIN = 2;
export const STEPS_MAX = 20;

/** The loop scene: a roomy context and a step budget that lets every task finish. */
export const LOOP_DEFAULT = { task: 'total', budgetWords: 1000, stepBudget: 12 } as const;
/** The context scene runs the audit task; the smallest budget makes the oldest turns overflow. */
export const CONTEXT_DEFAULT = { stepBudget: 20, budgetWords: 200, overflow: 'truncate' as Overflow };

export interface Guards {
  offered: readonly ToolName[];
  validateArguments: boolean;
  approval: boolean;
}
export type PresetId = 'readonly' | 'approval' | 'open';
export const GUARD_PRESETS: Record<PresetId, { label: string; guards: Guards }> = {
  readonly: { label: 'Read-only agent', guards: { offered: ['lookup_order', 'search_docs', 'calc', 'fetch_page'], validateArguments: true, approval: false } },
  approval: { label: 'Writes behind approval', guards: { offered: TOOLS, validateArguments: true, approval: true } },
  open: { label: 'Writes and no gate', guards: { offered: TOOLS, validateArguments: false, approval: false } },
};
export const GUARD_DEFAULT = { task: 'r1042', preset: 'readonly' as PresetId, failureRate: 0, seed: 7 } as const;
/** The tools with a switch in the guardrails scene (fetch_page has no task there). */
export const GUARD_TOOLS: readonly ToolName[] = ['lookup_order', 'search_docs', 'calc', 'refund', 'send_email'];
export const FAILURE_STEPS = [0, 10, 20, 30, 40, 50, 60];

export type TrustMode = 'naive' | 'separated';
export const TRUST_DEFAULT = { trust: 'naive' as TrustMode, emailOffered: true, approval: false, seed: 7 } as const;

const BASE: Omit<AgentConfig, 'goal' | 'budgetWords' | 'stepBudget'> = {
  overflow: 'truncate', offered: TOOLS, validateArguments: true, approval: false, approvals: [], failureRate: 0, seed: 0, trust: 'separated',
};
export const baseConfig = (over: Partial<AgentConfig> & Pick<AgentConfig, 'goal'>): AgentConfig => ({ budgetWords: 1000, stepBudget: STEPS_MAX, ...BASE, ...over });
