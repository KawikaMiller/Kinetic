/**
 * The pull request under review, its answer key, and a scorer. The planted bugs are real:
 * the same logic is implemented below (`pageSlice`, `planTier`) and unit-tested.
 */

export type Severity = 'blocking' | 'suggestion' | 'nit';
export type LineKind = 'add' | 'ctx' | 'file';

export interface DiffLine {
  kind: LineKind;
  text: string;
}

export const DIFF: DiffLine[] = [
  { kind: 'file', text: 'src/orders.ts' },
  { kind: 'ctx', text: "import { db } from './db';" },
  { kind: 'add', text: "import { logger } from './logger';" },
  { kind: 'ctx', text: '' },
  { kind: 'add', text: 'const PAGE_SIZE = 20;' },
  { kind: 'add', text: '' },
  { kind: 'add', text: '/** One page of a user\'s orders, newest first. `page` starts at 1. */' },
  { kind: 'add', text: 'export async function getOrderHistory(userId: string, page: number) {' },
  { kind: 'add', text: '  const user = await db.users.find(userId); // null if there is no such user' },
  { kind: 'add', text: "  logger.info('order history', { userId, key: process.env.PAYMENTS_API_KEY });" },
  { kind: 'add', text: '  const d = await db.orders.byUser(userId);' },
  { kind: 'add', text: '  const start = page * PAGE_SIZE;' },
  { kind: 'add', text: '  const rows = d.slice(start, start + PAGE_SIZE);' },
  { kind: 'add', text: "  if (user.plan.tier === 'gold') {" },
  { kind: 'add', text: '    rows.forEach((row) => { row.discount = 0.1 })' },
  { kind: 'add', text: '  }' },
  { kind: 'add', text: '  return rows;' },
  { kind: 'add', text: '}' },
  { kind: 'file', text: 'src/orders.test.ts' },
  { kind: 'ctx', text: "import { getOrderHistory } from './orders';" },
  { kind: 'ctx', text: '' },
  { kind: 'add', text: "it('returns a page of orders', async () => {" },
  { kind: 'add', text: "  const rows = await getOrderHistory('u1', 1); // u1 has 45 orders" },
  { kind: 'add', text: '  expect(rows).toHaveLength(20);' },
  { kind: 'add', text: '});' },
];

/** The PR header's numbers, counted from the diff itself. */
export const ADDED_LINES = DIFF.filter((l) => l.kind === 'add').length;
export const FILE_COUNT = DIFF.filter((l) => l.kind === 'file').length;

export interface Issue {
  id: string;
  line: number;
  label: string;
  /** Severities a good reviewer could reasonably pick; the first is the key. */
  accept: Severity[];
  /** A comment that's really a linter's job: noise in a human review. */
  linterJob?: boolean;
  bug?: boolean;
  explain: string;
}

const lineOf = (needle: string) => DIFF.findIndex((l) => l.text.includes(needle));

export const ISSUES: Issue[] = [
  {
    id: 'secret', line: lineOf('PAYMENTS_API_KEY'), label: 'Secret in a log line', accept: ['blocking'], bug: true,
    explain: 'The payments API key ends up in log storage, readable by anyone with log access. Never log credentials.',
  },
  {
    id: 'name', line: lineOf('const d ='), label: 'Confusing name', accept: ['nit', 'suggestion'],
    explain: '`d` says nothing. `orders` would make the next two lines read at a glance. Worth a nit, not a block.',
  },
  {
    id: 'offbyone', line: lineOf('page * PAGE_SIZE'), label: 'Off-by-one in pagination', accept: ['blocking'], bug: true,
    explain: 'page starts at 1, so page 1 starts at index 20 and the newest 20 orders are never shown. Should be (page - 1) * PAGE_SIZE.',
  },
  {
    id: 'null', line: lineOf('user.plan.tier'), label: 'Unhandled null', accept: ['blocking'], bug: true,
    explain: 'find() returns null for an unknown user, so user.plan throws a TypeError. Handle the missing user (404) first.',
  },
  {
    id: 'style', line: lineOf('row.discount = 0.1 })'), label: 'Missing semicolon', accept: ['nit'], linterJob: true,
    explain: 'True, but a formatter or linter should enforce this automatically. Spending review attention on it is noise.',
  },
  {
    id: 'test', line: lineOf('toHaveLength(20)'), label: 'Test misses the new branches', accept: ['blocking', 'suggestion'],
    explain: 'The test only checks the count: it passes with the off-by-one bug, and nothing covers the gold-tier discount branch.',
  },
];

export interface Comment {
  line: number;
  severity: Severity;
}

export interface Verdict {
  issue: Issue;
  comment: Comment | null;
  status: 'found' | 'wrong-severity' | 'missed';
}

export interface Score {
  verdicts: Verdict[];
  bugsFound: number;
  bugsTotal: number;
  /** Comments on lines with no issue, plus comments that were a linter's job. */
  noise: Comment[];
}

export function scoreReview(comments: readonly Comment[]): Score {
  const verdicts = ISSUES.map((issue): Verdict => {
    const comment = comments.find((c) => c.line === issue.line) ?? null;
    const status = !comment ? 'missed' : issue.accept.includes(comment.severity) ? 'found' : 'wrong-severity';
    return { issue, comment, status };
  });
  const bugs = verdicts.filter((v) => v.issue.bug);
  const issueLines = new Set(ISSUES.filter((i) => !i.linterJob).map((i) => i.line));
  return {
    verdicts,
    bugsFound: bugs.filter((v) => v.status !== 'missed').length,
    bugsTotal: bugs.length,
    noise: comments.filter((c) => !issueLines.has(c.line)),
  };
}

// ── The PR's logic, runnable, so the planted bugs are provably bugs ─────────────────

export interface User {
  plan: { tier: 'free' | 'gold' };
}

/** What the PR does: `start = page * size`. */
export function pageSlicePr<T>(items: readonly T[], page: number, size: number): T[] {
  const start = page * size;
  return items.slice(start, start + size);
}

/** What it should do for 1-based pages. */
export function pageSliceFixed<T>(items: readonly T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

/** What the PR does with the user: dereferences it unconditionally. */
export function planTierPr(user: User | null): string {
  return (user as User).plan.tier;
}
