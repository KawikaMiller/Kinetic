// A fictional cloud account: what exists in it, what the reports service really used in the last
// 90 days (a lesson-authored access log), and the policies the blast-radius scene compares.
import { evaluate, type Statement } from './policy';

export const PRINCIPAL = 'reports-api';
export const LOG_DAYS = 90;

export interface Resource {
  id: string;
  kind: 'bucket' | 'queue' | 'database' | 'secret';
  label: string;
  /** The concrete resource name policies are matched against. */
  name: string;
  /** Every action that exists on it. */
  actions: string[];
}

export const RESOURCES: Resource[] = [
  { id: 'reports', kind: 'bucket', label: 'reports bucket', name: 'bucket/reports/q3.csv', actions: ['storage:GetObject', 'storage:PutObject', 'storage:DeleteObject'] },
  { id: 'billing', kind: 'bucket', label: 'billing bucket', name: 'bucket/billing/ledger.csv', actions: ['storage:GetObject', 'storage:PutObject', 'storage:DeleteObject'] },
  { id: 'logs', kind: 'bucket', label: 'logs bucket', name: 'bucket/logs/app.log', actions: ['storage:GetObject', 'storage:PutObject', 'storage:DeleteObject'] },
  { id: 'jobs', kind: 'queue', label: 'jobs queue', name: 'queue/jobs', actions: ['queue:SendMessage', 'queue:ReceiveMessage', 'queue:DeleteMessage'] },
  { id: 'orders', kind: 'database', label: 'orders database', name: 'db/orders', actions: ['db:Query', 'db:Write', 'db:DropTable'] },
  { id: 'payment', kind: 'secret', label: 'payment key', name: 'secrets/payment-key', actions: ['secrets:GetSecretValue'] },
];

export const ALL_ACTIONS = [...new Set(RESOURCES.flatMap((r) => r.actions))];

/** What the service actually did in the last 90 days: read reports, read and send on the jobs queue. */
export const ACCESS_LOG: { action: string; resource: string; count: number }[] = [
  { action: 'storage:GetObject', resource: 'bucket/reports/q3.csv', count: 1204 },
  { action: 'queue:SendMessage', resource: 'queue/jobs', count: 311 },
  { action: 'queue:ReceiveMessage', resource: 'queue/jobs', count: 289 },
];

const allow = (id: string, action: string, resource: string): Statement => ({ id, effect: 'Allow', action, resource });

export interface PolicyOption {
  id: string;
  label: string;
  statements: Statement[];
}

export const POLICIES: PolicyOption[] = [
  { id: 'admin', label: 'Allow * on *', statements: [allow('p1', '*', '*')] },
  { id: 'storage-all', label: 'Allow storage:* on *', statements: [allow('p1', 'storage:*', '*')] },
  { id: 'storage-buckets', label: 'Allow storage:* on bucket/*', statements: [allow('p1', 'storage:*', 'bucket/*')] },
  { id: 'reads', label: 'Allow storage:GetObject on bucket/reports/*', statements: [allow('p1', 'storage:GetObject', 'bucket/reports/*')] },
];

/** The policy that grants exactly what the log shows, one statement per (action, resource) pair. */
export function suggestPolicy(log: typeof ACCESS_LOG): Statement[] {
  return log.map((e, i) => allow(`s${i + 1}`, e.action, e.resource));
}

export interface Reach {
  resource: Resource;
  /** The actions on it that the policy allows. */
  allowed: string[];
}

export function reachOf(statements: readonly Statement[]): Reach[] {
  return RESOURCES.map((resource) => ({
    resource,
    allowed: resource.actions.filter((action) => evaluate(statements, { principal: PRINCIPAL, action, resource: resource.name }).decision === 'allow'),
  }));
}

/** The resources with at least one allowed action: the blast radius. */
export const blastRadius = (statements: readonly Statement[]): string[] => reachOf(statements).filter((r) => r.allowed.length > 0).map((r) => r.resource.id);

/** How many (action, resource) pairs the policy allows, out of all that exist. */
export const allowedPairs = (statements: readonly Statement[]) => reachOf(statements).reduce((n, r) => n + r.allowed.length, 0);
export const totalPairs = RESOURCES.reduce((n, r) => n + r.actions.length, 0);

/** Resources the log shows as used. */
export const usedResources = (log: typeof ACCESS_LOG): string[] => RESOURCES.filter((r) => log.some((e) => e.resource === r.name)).map((r) => r.id);

/** Is every (action, resource) pair the service really used still allowed? (A trimmed policy must keep the service working.) */
export const keepsServiceWorking = (statements: readonly Statement[], log: typeof ACCESS_LOG) =>
  log.every((e) => evaluate(statements, { principal: PRINCIPAL, action: e.action, resource: e.resource }).decision === 'allow');
