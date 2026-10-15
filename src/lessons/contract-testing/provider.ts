/**
 * The provider in scenes 2 to 4: a real handler function whose response the learner changes with
 * chips. Each change is a flag on its state; `handle` builds the response from them.
 */

import type { ProviderResponse } from './contract';
import type { Field } from './consumer';

export type ChangeId = 'rename-name' | 'remove-email' | 'add-nickname' | 'id-string' | 'status-201' | 'amount-dollars';

export const CHANGES: { id: ChangeId; label: string; line: string }[] = [
  { id: 'rename-name', label: 'Rename name to fullName', line: 'name: user.name  ->  fullName: user.name' },
  { id: 'remove-email', label: 'Remove email', line: 'email: user.email  (deleted)' },
  { id: 'add-nickname', label: 'Add nickname', line: 'nickname: "ace"  (new)' },
  { id: 'id-string', label: 'id becomes a string', line: 'id: String(user.id)' },
  { id: 'status-201', label: 'Status 200 becomes 201', line: 'status: 200  ->  201' },
  { id: 'amount-dollars', label: 'amount: cents to dollars', line: 'amount: user.amount / 100' },
];

const USER = { id: 42, name: 'Ada', email: 'ada@example.com', plan: 'pro', amount: 2500 };

export type Changes = ReadonlySet<ChangeId>;

/** The handler for `GET /users/42` with these changes applied. */
export function handle(changes: Changes): ProviderResponse {
  const body: Record<string, unknown> = {
    id: changes.has('id-string') ? String(USER.id) : USER.id,
    [changes.has('rename-name') ? 'fullName' : 'name']: USER.name,
    ...(changes.has('remove-email') ? {} : { email: USER.email }),
    plan: USER.plan,
    amount: changes.has('amount-dollars') ? USER.amount / 100 : USER.amount,
    ...(changes.has('add-nickname') ? { nickname: 'ace' } : {}),
  };
  return { status: changes.has('status-201') ? 201 : 200, body };
}

/** What a full-schema test would assert: every field the provider had, with the type it had. The naive alternative to a contract. */
export const FULL_SCHEMA: Record<Field, 'integer' | 'string'> = { id: 'integer', name: 'string', email: 'string', plan: 'string', amount: 'integer' };

/** The handler's source with these changes applied, for the code panel: one line per body field. */
export const handlerLines = (changes: Changes): string[] => [
  'function handle(user) {',
  '  return {',
  `    status: ${changes.has('status-201') ? 201 : 200},`,
  '    body: {',
  `      id: ${changes.has('id-string') ? 'String(user.id)' : 'user.id'},`,
  `      ${changes.has('rename-name') ? 'fullName' : 'name'}: user.name,`,
  ...(changes.has('remove-email') ? [] : ['      email: user.email,']),
  '      plan: user.plan,',
  `      amount: ${changes.has('amount-dollars') ? 'user.amount / 100' : 'user.amount'},`,
  ...(changes.has('add-nickname') ? ['      nickname: "ace",'] : []),
  '    },',
  '  };',
  '}',
];
