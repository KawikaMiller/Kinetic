import type { MatcherType } from './contract';
import type { Field } from './consumer';

export const MATCHERS: { value: MatcherType; label: string }[] = [
  { value: 'integer', label: 'integer' },
  { value: 'number', label: 'number' },
  { value: 'string', label: 'string' },
  { value: 'any', label: 'any value' },
];

/** The contract scene 1 starts with: what the default page reads, each with a matcher it survives. */
export const START_CHOICE: Partial<Record<Field, MatcherType>> = { id: 'integer', name: 'string', amount: 'integer' };
