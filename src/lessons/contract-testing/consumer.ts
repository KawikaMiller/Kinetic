/**
 * The consumer in scenes 1 and 4: a checkout page that calls `GET /users/42` and renders a line from
 * the response. It is real code. Which fields it reads is found by running it against a Proxy that
 * records property reads, and whether a matcher is tight enough is found by running it on values the
 * matcher would accept.
 */

import { makeContract, type Contract, type MatcherType } from './contract';

export type Field = 'id' | 'name' | 'email' | 'plan' | 'amount';
export const FIELDS: readonly Field[] = ['id', 'name', 'email', 'plan', 'amount'];

export interface ConsumerOptions {
  showEmail: boolean;
  showPlan: boolean;
}
export const DEFAULT_CONSUMER: ConsumerOptions = { showEmail: false, showPlan: false };

export type User = Record<string, unknown>;

/** The page's one line for a user. Throws, like a page would, when the response is not shaped as it expects. */
export function renderCheckout(user: User, o: ConsumerOptions): string {
  const id = (user.id as number).toFixed(0);
  const name = (user.name as string).toUpperCase();
  if (!Number.isInteger(user.amount)) throw new Error('amount is not a whole number of cents');
  const parts = [`#${id}`, name, `charge $${((user.amount as number) / 100).toFixed(2)}`];
  if (o.showEmail) parts.push((user.email as string).toLowerCase());
  if (o.showPlan) parts.push(`plan ${(user.plan as string).trim()}`);
  return parts.join(' | ');
}

/** The consumer's source lines, shown beside the contract. */
export const consumerLines = (o: ConsumerOptions): string[] => [
  'const id = user.id.toFixed(0);',
  'const name = user.name.toUpperCase();',
  'if (!Number.isInteger(user.amount)) throw new Error("amount is not a whole number of cents");',
  'const parts = [`#${id}`, name, `charge $${(user.amount / 100).toFixed(2)}`];',
  ...(o.showEmail ? ['parts.push(user.email.toLowerCase());'] : []),
  ...(o.showPlan ? ['parts.push(`plan ${user.plan.trim()}`);'] : []),
];

export const SAMPLE_USER: User = { id: 42, name: 'Ada', email: 'ada@example.com', plan: 'pro', amount: 2500 };

/** The fields the consumer touches, recorded by running it on a Proxy. */
export function readsOf(o: ConsumerOptions): Field[] {
  const seen = new Set<string>();
  const spy = new Proxy(SAMPLE_USER, {
    get(target, key, receiver) {
      if (typeof key === 'string') seen.add(key);
      return Reflect.get(target, key, receiver);
    },
  });
  renderCheckout(spy, o);
  return FIELDS.filter((f) => seen.has(f));
}

/** The values a matcher accepts, as the representatives a check tries. */
const SAMPLES: Record<MatcherType, unknown[]> = {
  integer: [7],
  number: [7, 1.5],
  string: ['x'],
  boolean: [true],
  any: [7, 1.5, 'x', true, null],
};

export interface Fit {
  fits: boolean;
  /** The value that broke the consumer, and what it said. */
  breaksOn?: { value: unknown; error: string };
}

/** Does the consumer survive every value this matcher lets through for `field`? */
export function matcherFits(field: Field, matcher: MatcherType, o: ConsumerOptions): Fit {
  for (const value of SAMPLES[matcher]) {
    try {
      renderCheckout({ ...SAMPLE_USER, [field]: value }, o);
    } catch (e) {
      return { fits: false, breaksOn: { value, error: e instanceof Error ? e.message : String(e) } };
    }
  }
  return { fits: true };
}

/** The tightest matcher the consumer survives, for the contract it would write. */
export function tightestMatcher(field: Field, o: ConsumerOptions): MatcherType {
  const order: MatcherType[] = ['integer', 'string', 'number', 'any'];
  return order.find((m) => matcherFits(field, m, o).fits) ?? 'any';
}

export interface Coverage {
  /** Read by the consumer but left out of the contract: a provider could remove it unnoticed. */
  missing: Field[];
  /** In the contract but never read: it would stop a provider removing something no one uses. */
  extra: Field[];
}

export function coverage(inContract: readonly Field[], o: ConsumerOptions): Coverage {
  const reads = readsOf(o);
  return { missing: reads.filter((f) => !inContract.includes(f)), extra: inContract.filter((f) => !reads.includes(f)) };
}

/** The contract this consumer would honestly write: what it reads, each with its tightest matcher. */
export function honestContract(o: ConsumerOptions): Contract {
  return makeContract(Object.fromEntries(readsOf(o).map((f) => [f, tightestMatcher(f, o)])));
}

/** What the checkout page should show for user 42: the behaviour test's expectation. */
export const EXPECTED_LINE = '#42 | ADA | charge $25.00';
