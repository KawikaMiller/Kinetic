// A tiny git history with file snapshots, enough to show why deleting a leaked key doesn't
// remove it, what .gitignore does and doesn't do, and how a secret scanner recognises keys.
// Every key here is an obviously fake example.

export interface Commit {
  id: string;
  message: string;
  parents: string[];
  /** The full tree at this commit: path → file content. */
  files: Record<string, string>;
}

/**
 * Join an example credential from pieces. The lesson shows key-shaped strings, but the
 * source never contains one in a single literal, so secret scanners (GitHub push
 * protection included) have nothing to flag. Every value built with it is fake.
 */
export const fakeSecret = (...parts: string[]) => parts.join('');

/** The leaked key. Fake, and shaped like a live payment key so the scanner rule matches it. */
export const LEAKED_KEY = fakeSecret('sk', '_live_', 'EXAMPLE0000DEMO0000KEY');
export const ROTATED_KEY = fakeSecret('sk', '_live_', 'EXAMPLE1111NEW1111KEY');

/** Every commit reachable from the given branch tips, by walking parents. */
export function reachable(commits: Commit[], tips: string[]): Set<string> {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const stack = [...tips];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    stack.push(...byId.get(id)!.parents);
  }
  return seen;
}

/** Reachable commits whose tree still contains `secret` anywhere. */
export const commitsContaining = (commits: Commit[], tips: string[], secret: string) => {
  const live = reachable(commits, tips);
  return commits.filter((c) => live.has(c.id) && Object.values(c.files).some((f) => f.includes(secret))).map((c) => c.id);
};

// ── .gitignore ───────────────────────────────────────────────────────────────

/** Does one .gitignore pattern match this path? Supports names, `*.ext`, `dir/` and a leading `/`. */
export function matchesPattern(path: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p || p.startsWith('#')) return false;
  if (p.endsWith('/')) return path.startsWith(p.replace(/^\//, '')) || path.includes(`/${p}`);
  const anchored = p.startsWith('/');
  const glob = anchored ? p.slice(1) : p;
  const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*')}$`);
  if (anchored) return re.test(path);
  return path.split('/').some((_, i, parts) => re.test(parts.slice(i).join('/'))) || re.test(path.split('/').pop()!);
}

export const isIgnored = (path: string, gitignore: string) => gitignore.split('\n').some((line) => matchesPattern(path, line));

/**
 * Which files `git add -A` would stage. A file that's already tracked stays tracked whatever
 * .gitignore says; ignore rules only stop *untracked* files being added.
 */
export function wouldStage(paths: string[], tracked: ReadonlySet<string>, gitignore: string) {
  return paths.filter((p) => tracked.has(p) || !isIgnored(p, gitignore));
}

// ── Secret scanning ──────────────────────────────────────────────────────────
// The scanner is shared with the repo-wide secret-shape test, so it lives in core.
export { RULES, scan, type Finding, type Rule } from '../../core/secretScan';

// ── The story ────────────────────────────────────────────────────────────────

const README = '# shop\n';
const CONFIG_LEAK = `export const config = {\n  currency: 'EUR',\n  stripeKey: '${LEAKED_KEY}',\n};\n`;
const CONFIG_CLEAN = `export const config = {\n  currency: 'EUR',\n};\n`;
const CONFIG_ENV = `export const config = {\n  currency: 'EUR',\n  stripeKey: process.env.STRIPE_KEY,\n};\n`;

/** The leak: an initial commit, then the commit that hard-codes the key. */
export const LEAK_HISTORY: Commit[] = [
  { id: 'a1f3', message: 'initial commit', parents: [], files: { 'README.md': README } },
  { id: 'b7c2', message: 'add payments', parents: ['a1f3'], files: { 'README.md': README, 'config.js': CONFIG_LEAK } },
];

export type FixId = 'delete' | 'gitignore' | 'rotate' | 'prevent';

export interface FixOutcome {
  commits: Commit[];
  tip: string;
  /** Commits that still contain the leaked key. */
  stillInHistory: string[];
  /** Is the leaked key still accepted by the payment provider? */
  keyWorks: boolean;
  /** Is config.js still tracked (so it keeps going into every commit)? */
  configTracked: boolean;
  verdict: string;
}

export function applyFix(fix: FixId): FixOutcome {
  if (fix === 'prevent') {
    const commits: Commit[] = [
      { id: 'a1f3', message: 'initial commit + .gitignore', parents: [], files: { 'README.md': README, '.gitignore': '.env\n' } },
      { id: 'c9d0', message: 'add payments (reads env)', parents: ['a1f3'], files: { 'README.md': README, '.gitignore': '.env\n', 'config.js': CONFIG_ENV } },
    ];
    return {
      commits, tip: 'c9d0', stillInHistory: commitsContaining(commits, ['c9d0'], LEAKED_KEY), keyWorks: true, configTracked: true,
      verdict: 'The key lives in .env (ignored) or a secret manager, and the code only names it: process.env.STRIPE_KEY. Nothing secret ever reaches git.',
    };
  }
  const base = LEAK_HISTORY;
  const head = base[base.length - 1];
  if (fix === 'delete') {
    const commits = [...base, { id: 'd4e5', message: 'remove stripe key', parents: [head.id], files: { ...head.files, 'config.js': CONFIG_CLEAN } }];
    return {
      commits, tip: 'd4e5', stillInHistory: commitsContaining(commits, ['d4e5'], LEAKED_KEY), keyWorks: true, configTracked: true,
      verdict: 'The latest version is clean, but commit b7c2 still has the key, and anyone can check it out. It was also already copied the moment it was pushed.',
    };
  }
  if (fix === 'gitignore') {
    const files = { ...head.files, '.gitignore': 'config.js\n' };
    const commits = [...base, { id: 'e8f1', message: 'ignore config.js', parents: [head.id], files }];
    const staged = wouldStage(Object.keys(files), new Set(Object.keys(head.files)), files['.gitignore']);
    return {
      commits, tip: 'e8f1', stillInHistory: commitsContaining(commits, ['e8f1'], LEAKED_KEY), keyWorks: true, configTracked: staged.includes('config.js'),
      verdict: '.gitignore only stops untracked files being added. config.js is already tracked, so it stays in every commit, key and all.',
    };
  }
  // rotate
  const commits = [...base, { id: 'f2a6', message: 'read stripe key from env', parents: [head.id], files: { ...head.files, 'config.js': CONFIG_ENV } }];
  return {
    commits, tip: 'f2a6', stillInHistory: commitsContaining(commits, ['f2a6'], LEAKED_KEY), keyWorks: false, configTracked: true,
    verdict: `The provider revoked the old key and issued a new one (${ROTATED_KEY.slice(0, 12)}…), set as an environment variable. The leaked copy is still in history, but it's dead.`,
  };
}

// ── Code, config or secret? ─────────────────────────────────────────────────

export type Bucket = 'code' | 'config' | 'secret';

export interface Item {
  id: string;
  label: string;
  answer: Bucket;
  why: string;
}

export const ITEMS: Item[] = [
  { id: 'tax', label: 'A function that calculates sales tax', answer: 'code', why: 'Logic: it belongs in the repo and is the same everywhere.' },
  { id: 'port', label: 'The port the server listens on', answer: 'config', why: 'Changes per environment but isn\'t sensitive: an environment variable or config file.' },
  { id: 'db-pass', label: 'The production database password', answer: 'secret', why: 'Grants access: a secret manager or environment variable, never the repo.' },
  { id: 'retries', label: 'How many times to retry a request (3)', answer: 'code', why: 'A behaviour default: a named constant in code is fine.' },
  { id: 'api-url', label: 'The payment API\'s base URL', answer: 'config', why: 'Differs between test and live, but anyone may know it.' },
  { id: 'stripe', label: 'The Stripe secret key', answer: 'secret', why: 'Lets anyone charge cards as you: rotate it immediately if it leaks.' },
  { id: 'log-level', label: 'The log level (debug or info)', answer: 'config', why: 'Varies per environment, not sensitive.' },
  { id: 'jwt', label: 'The key that signs login tokens', answer: 'secret', why: 'Whoever has it can forge logins for any user.' },
];
