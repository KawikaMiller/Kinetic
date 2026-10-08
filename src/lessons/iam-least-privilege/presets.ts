import { ALL_ACTIONS, PRINCIPAL, RESOURCES } from './account';
import type { Request, Statement } from './policy';

export interface Preset {
  id: string;
  label: string;
  statements: Statement[];
  request: Request;
}

const st = (id: string, effect: Statement['effect'], action: string, resource: string): Statement => ({ id, effect, action, resource });
const ask = (action: string, resource: string): Request => ({ principal: PRINCIPAL, action, resource });

export const PRESETS: Preset[] = [
  {
    id: 'works',
    label: 'Works',
    statements: [st('s1', 'Allow', 'storage:GetObject', 'bucket/reports/*')],
    request: ask('storage:GetObject', 'bucket/reports/q3.csv'),
  },
  {
    id: 'wide',
    label: 'Wildcard too wide',
    statements: [st('s1', 'Allow', 'storage:*', '*')],
    request: ask('storage:DeleteObject', 'bucket/billing/ledger.csv'),
  },
  {
    id: 'deny',
    label: 'Deny overrides allow',
    statements: [st('s1', 'Allow', 'storage:*', 'bucket/*'), st('s2', 'Deny', 'storage:Delete*', 'bucket/*')],
    request: ask('storage:DeleteObject', 'bucket/reports/q3.csv'),
  },
  {
    id: 'typo',
    label: 'Typo in resource',
    statements: [st('s1', 'Allow', 'storage:GetObject', 'bucket/report/*')],
    request: ask('storage:GetObject', 'bucket/reports/q3.csv'),
  },
  {
    id: 'nomatch',
    label: 'No statement matches',
    statements: [st('s1', 'Allow', 'queue:SendMessage', 'queue/jobs')],
    request: ask('storage:GetObject', 'bucket/reports/q3.csv'),
  },
];

/** Every concrete request the account can see, plus the one near-miss spelling the typo preset uses. */
export const REQUEST_UNIVERSE: Request[] = [
  ...ALL_ACTIONS.flatMap((action) => RESOURCES.map((r) => ask(action, r.name))),
  ask('storage:GetObject', 'bucket/report/q3.csv'),
];

export const DEFAULT_PRESET = PRESETS[0];
