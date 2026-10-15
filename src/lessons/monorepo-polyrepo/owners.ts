/**
 * Scene 3: ownership files. A deliberately simplified CODEOWNERS: a pattern and a team per line,
 * and the last matching rule wins (as in GitHub's file, written here from memory). The syntax and
 * the repository are invented.
 */

import type { Tone } from '../../core/tone';

export const TEAMS = ['@platform', '@web', '@payments', '@worker', '@infra', '@docs'] as const;
export type Team = (typeof TEAMS)[number];

/** Teams are plain categories: their names are always printed too, so colour is never the only cue. */
export const TEAM_TONE: Record<Team, Tone> = { '@platform': 'sky', '@web': 'amber', '@payments': 'pink', '@worker': 'orange', '@infra': 'violet', '@docs': 'muted' };

export interface Rule {
  pattern: string;
  owner: Team;
}

/** A repository of invented paths. */
export const PATHS: readonly string[] = [
  '/README.md',
  '/docs/architecture.md',
  '/docs/onboarding.md',
  '/api/src/orders.ts',
  '/api/src/users.ts',
  '/api/test/orders.test.ts',
  '/api/package.json',
  '/web/src/App.tsx',
  '/web/src/cart.tsx',
  '/web/src/styles.css',
  '/web/package.json',
  '/billing/src/invoice.ts',
  '/billing/src/tax.ts',
  '/billing/test/tax.test.ts',
  '/worker/src/queue.ts',
  '/worker/src/jobs/email.ts',
  '/shared-lib/src/money.ts',
  '/shared-lib/src/order.ts',
  '/shared-lib/package.json',
  '/infra/deploy.yml',
  '/infra/db.tf',
];

export interface PullRequest {
  id: string;
  title: string;
  paths: readonly string[];
}

export const PULL_REQUESTS: readonly PullRequest[] = [
  { id: 'tax', title: 'Fix tax rounding', paths: ['/billing/src/tax.ts', '/billing/test/tax.test.ts'] },
  { id: 'rename', title: 'Rename formatMoney', paths: ['/shared-lib/src/money.ts', '/api/src/orders.ts', '/billing/src/invoice.ts', '/web/src/cart.tsx'] },
  { id: 'docs', title: 'Fix a typo in the docs', paths: ['/docs/onboarding.md', '/README.md'] },
  {
    id: 'node',
    title: 'Upgrade Node everywhere',
    paths: ['/api/package.json', '/web/package.json', '/shared-lib/package.json', '/infra/deploy.yml', '/worker/src/queue.ts', '/README.md'],
  },
];

/** A pull request that needs this many teams or more is flagged. */
export const FLAG_TEAMS = 5;
/** What the opening ownership file says: three rules, so most of the tree is unowned. */
export const OPENING_RULES: readonly Rule[] = [
  { pattern: '/web/', owner: '@web' },
  { pattern: '/billing/', owner: '@payments' },
  { pattern: '*.md', owner: '@docs' },
];

export const MAX_PATTERN = 40;
const PATTERN_CHARS = /^[A-Za-z0-9._/*-]+$/;
const EXTENSION = /^\*\.[A-Za-z0-9]+$/;

export type PatternParse = { ok: true; pattern: string } | { ok: false; error: string };

/** A pattern as the simplified syntax reads it: `*`, `*.ext`, a directory ending in `/`, or one exact file path. Anchored at the repository root. */
export function parsePattern(text: string): PatternParse {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'A rule needs a pattern.' };
  if (t.length > MAX_PATTERN) return { ok: false, error: `Keep the pattern to ${MAX_PATTERN} characters.` };
  if (!PATTERN_CHARS.test(t)) return { ok: false, error: 'Patterns use letters, digits and . _ / - characters, plus * on its own or in *.ext.' };
  if (t.includes('*') && t !== '*' && !EXTENSION.test(t)) return { ok: false, error: "This simplified syntax has '*', '*.ext', directories ending in '/', and exact file paths." };
  return { ok: true, pattern: t };
}

/** Does the pattern cover the path? Paths start with `/`; a directory or file pattern may leave its leading `/` off. */
export function matches(pattern: string, path: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return path.endsWith(pattern.slice(1));
  const anchored = pattern.startsWith('/') ? pattern : `/${pattern}`;
  return anchored.endsWith('/') ? path.startsWith(anchored) : path === anchored;
}

/** The owner of a path: the last rule that matches it, or null. */
export function ownerOf(rules: readonly Rule[], path: string): Team | null {
  for (let i = rules.length - 1; i >= 0; i--) if (matches(rules[i].pattern, path)) return rules[i].owner;
  return null;
}

export type SetRule = { rules: Rule[]; replaced: boolean };

/** Add a rule at the end, or, when the pattern is already there, replace that rule in place (and say so). */
export function setRule(rules: readonly Rule[], rule: Rule): SetRule {
  const at = rules.findIndex((r) => r.pattern === rule.pattern);
  if (at < 0) return { rules: [...rules, rule], replaced: false };
  return { rules: rules.map((r, i) => (i === at ? rule : r)), replaced: true };
}

export const removeRule = (rules: readonly Rule[], index: number): Rule[] => rules.filter((_, i) => i !== index);

/** Move a rule up or down: order matters, since the last match wins. */
export function moveRule(rules: readonly Rule[], index: number, by: -1 | 1): Rule[] {
  const to = index + by;
  if (to < 0 || to >= rules.length) return [...rules];
  const out = [...rules];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export interface Review {
  pr: PullRequest;
  teams: Team[];
  unowned: string[];
  flagged: boolean;
}

/** Who must review a pull request: the owners of its paths, and the paths nobody owns. */
export function review(rules: readonly Rule[], pr: PullRequest): Review {
  const owners = pr.paths.map((p) => ownerOf(rules, p));
  const teams = TEAMS.filter((t) => owners.includes(t));
  return { pr, teams, unowned: pr.paths.filter((_, i) => owners[i] === null), flagged: teams.length >= FLAG_TEAMS };
}

/** The paths no rule covers. */
export const unownedPaths = (rules: readonly Rule[]): string[] => PATHS.filter((p) => ownerOf(rules, p) === null);

/** The file as text, one rule per line. */
export const ruleLines = (rules: readonly Rule[]): string[] => rules.map((r) => `${r.pattern.padEnd(MAX_PATTERN / 2)}${r.owner}`);
