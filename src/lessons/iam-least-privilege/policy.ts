// A simplified cloud policy language: statements that Allow or Deny actions on resources, matched
// with a glob, evaluated with the rule every major provider shares: an explicit Deny wins, then any
// Allow, otherwise the request is denied by default. Real systems add conditions, permission
// boundaries and resource policies; this models none of them.

/**
 * Glob rule used here: `*` matches any run of characters, including `/` and nothing at all, and
 * every other character matches itself, case-sensitively. There is no `?` and no character class.
 */
export function matchGlob(pattern: string, text: string): boolean {
  // prev[j]: does the pattern consumed so far match text[0..j)?
  let prev = new Array<boolean>(text.length + 1).fill(false);
  prev[0] = true;
  for (const p of pattern) {
    const next = new Array<boolean>(text.length + 1).fill(false);
    if (p === '*') {
      next[0] = prev[0];
      for (let j = 1; j <= text.length; j++) next[j] = prev[j] || next[j - 1];
    } else {
      for (let j = 1; j <= text.length; j++) next[j] = prev[j - 1] && text[j - 1] === p;
    }
    prev = next;
  }
  return prev[text.length];
}

export type Effect = 'Allow' | 'Deny';

export interface Statement {
  id: string;
  effect: Effect;
  /** An action pattern such as `storage:Get*`. */
  action: string;
  /** A resource pattern such as `bucket/reports/*`. */
  resource: string;
}

export interface Request {
  principal: string;
  action: string;
  resource: string;
}

export const statementMatches = (s: Statement, r: Request) => matchGlob(s.action, r.action) && matchGlob(s.resource, r.resource);

export type Reason = 'explicit-deny' | 'allow' | 'implicit-deny';

export interface Evaluation {
  decision: 'allow' | 'deny';
  reason: Reason;
  /** The statement that decided it (the first matching Deny, else the first matching Allow), or null. */
  decidedBy: string | null;
  /** Whether each statement matches the request, by id. */
  matches: Record<string, boolean>;
}

export function evaluate(statements: readonly Statement[], r: Request): Evaluation {
  const matches = Object.fromEntries(statements.map((s) => [s.id, statementMatches(s, r)]));
  const deny = statements.find((s) => s.effect === 'Deny' && matches[s.id]);
  if (deny) return { decision: 'deny', reason: 'explicit-deny', decidedBy: deny.id, matches };
  const allow = statements.find((s) => s.effect === 'Allow' && matches[s.id]);
  if (allow) return { decision: 'allow', reason: 'allow', decidedBy: allow.id, matches };
  return { decision: 'deny', reason: 'implicit-deny', decidedBy: null, matches };
}

/** Statements in the order the rule looks at them: every Deny first, then every Allow. */
export const ruleOrder = (statements: readonly Statement[]): Statement[] => [
  ...statements.filter((s) => s.effect === 'Deny'),
  ...statements.filter((s) => s.effect === 'Allow'),
];

// ── Input rules for the editable fields ────────────────────────────────────

export const MAX_PATTERN = 60;
export const MAX_STATEMENTS = 6;
const PATTERN_CHARS = /^[A-Za-z0-9:_*/.-]+$/;

export type Parsed = { ok: true; value: string } | { ok: false; error: string };

/** A policy pattern: letters, digits and `: _ - . / *`, up to 60 characters. Refused otherwise, never coerced. */
export function parsePattern(text: string): Parsed {
  if (text.length === 0) return { ok: false, error: 'A pattern cannot be empty.' };
  if (text !== text.trim()) return { ok: false, error: 'Remove the spaces around the pattern.' };
  if (text.length > MAX_PATTERN) return { ok: false, error: `Keep it under ${MAX_PATTERN + 1} characters.` };
  if (!PATTERN_CHARS.test(text)) return { ok: false, error: 'This model takes letters, digits and : _ - . / * only.' };
  return { ok: true, value: text };
}

/** A concrete action or resource in a request: the same characters, but no `*`. */
export function parseConcrete(text: string): Parsed {
  const p = parsePattern(text);
  if (!p.ok) return p;
  if (text.includes('*')) return { ok: false, error: 'A request names one real action or resource: no * here.' };
  return p;
}
