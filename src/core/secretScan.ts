/**
 * Secret-shape scanning: the patterns pre-commit scanners and push protection look for.
 * Used by the secrets-management lesson (its five teaching rules) and by
 * secretScan.test.ts, which runs the wider repo set over src/, scripts/ and docs/ so
 * nothing credential-shaped is ever committed, even as an example (docs/rollout-plan.md K-3).
 */

export interface Rule {
  id: string;
  name: string;
  re: RegExp;
}

export interface Finding {
  rule: string;
  line: number;
  match: string;
}

/** The rules the secrets-management lesson teaches with. Real scanners have hundreds, plus entropy checks. */
export const RULES: Rule[] = [
  { id: 'stripe', name: 'Stripe-style secret key', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'aws', name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'github', name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { id: 'private-key', name: 'Private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'assignment', name: 'Hard-coded secret', re: /\b(?:password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi },
];

/**
 * The repo-wide set: the lesson's credential shapes (not its "assignment" heuristic, which
 * flags ordinary code) plus the other formats GitHub push protection scans for.
 */
export const REPO_RULES: Rule[] = [
  ...RULES.filter((r) => r.id !== 'assignment'),
  { id: 'github-pat', name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { id: 'slack', name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'google', name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'jwt', name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: 'url-credentials', name: 'Credentials in a URL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@/gi },
];

/** A line carrying this marker, followed by a reason, is a documented fixture and isn't reported. */
const ALLOW = /allow-secret-shape:\s*\S/;

/** Every rule hit in `text`, with its 1-based line number. */
export function scan(text: string, rules: readonly Rule[] = RULES): Finding[] {
  const out: Finding[] = [];
  text.split('\n').forEach((lineText, i) => {
    if (ALLOW.test(lineText)) return;
    for (const r of rules) {
      for (const m of lineText.matchAll(r.re)) out.push({ rule: r.id, line: i + 1, match: m[0] });
    }
  });
  return out;
}
