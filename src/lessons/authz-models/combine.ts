/** Combining rules: what a policy engine says when more than one rule matches. "No rule matched" is deny in this lesson. */

export type RuleResult = 'permit' | 'deny' | 'none';
export type Algorithm = 'deny-overrides' | 'permit-overrides' | 'first-applicable';

export const RESULTS: readonly RuleResult[] = ['permit', 'deny', 'none'];

export const ALGORITHMS: readonly { id: Algorithm; label: string; text: string }[] = [
  { id: 'deny-overrides', label: 'Deny overrides', text: 'any matching deny wins' },
  { id: 'permit-overrides', label: 'Permit overrides', text: 'any matching permit wins' },
  { id: 'first-applicable', label: 'First applicable', text: 'the first rule that matches decides' },
];

export const RESULT_LABEL: Record<RuleResult, string> = { permit: 'permit', deny: 'deny', none: 'does not match' };

/** The decision for rules listed in order. No match at all is deny (the lesson's default, as in cloud policy engines; chipped on screen). */
export function combine(alg: Algorithm, results: readonly RuleResult[]): 'permit' | 'deny' {
  const matched = results.filter((r) => r !== 'none');
  if (matched.length === 0) return 'deny';
  switch (alg) {
    case 'deny-overrides': return matched.includes('deny') ? 'deny' : 'permit';
    case 'permit-overrides': return matched.includes('permit') ? 'permit' : 'deny';
    case 'first-applicable': return matched[0] as 'permit' | 'deny';
  }
}
