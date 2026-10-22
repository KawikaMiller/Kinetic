import {
  isAllowed, lintTier3Lesson, unscopedAbsolutes, withoutComments, type Tier3Evidence, type Tier3Issue, type Tier3Rule,
} from './lessonContentT3';
import type { ProvenanceKind } from './provenance';
import type { LessonModule } from './types';

/**
 * Tier 4 content lint (docs/tier4-technical.md §6.2, AC-0/T4 rules 27-39): the mechanical rules on
 * top of the Tier 3 lint. Pure functions, so lessonContent.test.ts can prove each rule fails on a
 * planted bad fixture and then run them over the Tier 4 lessons. The Tier 3 file stays frozen:
 * `lintTier4Lesson` wraps `lintTier3Lesson` and replaces its absolutes scan with a wider one.
 */

export type Tier4Rule =
  | Tier3Rule
  | 'chip-required'
  | 'claim-label'
  | 'no-clock-or-random'
  | 'fresh-array-hook'
  | 'pinned-seed-zero'
  | 'seed-visible'
  | 'manipulation-tests';

export interface Tier4Issue {
  rule: Tier4Rule;
  detail: string;
}

/**
 * The 38 Tier 4 lessons flagged for domain review: the 29 new topics marked **D** in
 * docs/tier4-plan.md §2 (pinned to that table by lessonContent.test.ts) plus all nine retrofits.
 * Each must show at least one `Provenance` chip.
 */
export const DOMAIN_REVIEW_IDS_T4: ReadonlySet<string> = new Set([
  // the nine existing lessons (retrofits T4-R1, T4-R2)
  'raft', 'distributed-transactions', 'backpressure', 'multi-region', 'lsm-trees', 'crdts',
  'probabilistic-structures', 'slos-error-budgets', 'zero-trust',
  // the 29 new D rows of the plan
  'failure-detectors', 'gossip-protocols', 'metastable-failures', 'deterministic-simulation-testing',
  'memory-ordering-atomics', 'lock-free-cas', 'numa-multicore', 'formal-methods', 'np-reductions',
  'approximation-algorithms', 'linear-programming', 'paxos', 'byzantine-faults', 'flp-impossibility',
  'distributed-snapshots', 'hybrid-logical-clocks', 'distributed-sql-truetime', 'online-algorithms', 'game-theory',
  'elliptic-curves', 'post-quantum-crypto', 'e2ee-forward-secrecy', 'secret-sharing', 'zero-knowledge-proofs',
  'llm-serving', 'fine-tuning-quantization', 'feature-stores-skew', 'finops-cloud-cost', 'hiring-interviewing',
]);

/** Lessons whose point is a proof or an impossibility: each needs two `manipulation N:` tests (AC-0/T4 #30). */
export const PROOF_SHAPED_IDS: ReadonlySet<string> = new Set([
  'flp-impossibility', 'np-reductions', 'zero-knowledge-proofs', 'approximation-algorithms', 'sat-solvers',
  'byzantine-faults', 'secret-sharing', 'online-algorithms', 'game-theory',
]);

/** The seven lead lessons: every practice or research claim wears a `ClaimLabel` (AC-0/T4 #35). */
export const LEAD_IDS: ReadonlySet<string> = new Set([
  'strangler-fig-migrations', 'build-vs-buy', 'conways-law', 'reversible-decisions', 'technical-strategy',
  'influence-without-authority', 'hiring-interviewing',
]);

/** Chips a lesson must wear besides the general rule (a `real` chip wherever the source uses `crypto.subtle`). */
export const REQUIRED_CHIPS: Readonly<Record<string, readonly ProvenanceKind[]>> = {
  'memory-ordering-atomics': ['simulated'],
  'lock-free-cas': ['simulated'],
  'elliptic-curves': ['toy'],
  'post-quantum-crypto': ['toy'],
  'e2ee-forward-secrecy': ['toy'],
  'secret-sharing': ['toy'],
  'zero-knowledge-proofs': ['toy'],
  'llm-serving': ['illustrative', 'toy'],
  'fine-tuning-quantization': ['toy'],
  'feature-stores-skew': ['simulated'],
};

/**
 * Scope phrases that Tier 4 adds: a theorem lesson legitimately says "every deterministic protocol",
 * and a sentence that names its assumption or its bound has scoped its claim.
 */
export const THEOREM_SCOPE = /\b(theorem|proved|proof|assum(?:e|es|ed|ing|ption|ptions)|in the asynchronous model|in this protocol|within the horizon)\b/i;

export interface Tier4Evidence extends Tier3Evidence {
  /** The lesson id, so the id-keyed tables above apply. */
  id: string;
  /** Source text of the lesson folder's test files, for `manipulation N:` and pinned-seed checks. */
  testSource: string;
}

/** The N of every test named `manipulation N: ...` in a test file's source. */
export function manipulationTestNumbers(testSource: string): number[] {
  return [...testSource.matchAll(/\b(?:it|test)(?:\.\w+)?\(\s*['"`]manipulation (\d+):/g)].map((m) => Number(m[1]));
}

/** Source lines of `code` (comments already stripped) that match `pattern` and do not carry `marker`. */
function offendingLines(code: string, pattern: RegExp, marker: RegExp): string[] {
  return code.split('\n').filter((line) => pattern.test(line) && !marker.test(line)).map((line) => line.trim());
}

const CLOCK_OR_RANDOM = /Math\.random|performance\.now|Date\.now|new Date/;
const ALLOW_RANDOM = /allow-random:\s*\S.{2,}/;

const ALLOW_FRESH = /allow-fresh:\s*\S.{2,}/;
/** A call that returns a primitive: `String(x)`, `JSON.stringify(x)`, `xs.join(',')` are stable keys. */
const PRIMITIVE_CALL = /^(?:String|Number|JSON\.stringify|[\w$.]+\.(?:join|toString|toFixed))\(/;
const MEMOISED_CALL = /^useMemo\(/;
const FALLBACK_ARRAY = /(?:\?\?|\|\|)\s*\[\s*\]/;

/** The text between the bracket at `open` and its partner, or the rest of the source when unbalanced. */
function balancedInner(source: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}' };
  const closer = pairs[source[open]];
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === source[open]) depth += 1;
    else if (source[i] === closer) depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** The first top-level argument of an argument list (up to the first comma outside brackets). */
function firstArgument(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i += 1) {
    if ('([{'.includes(args[i])) depth += 1;
    else if (')]}'.includes(args[i])) depth -= 1;
    else if (args[i] === ',' && depth === 0) return args.slice(0, i).trim();
  }
  return args.trim();
}

/** Why `expr` builds a fresh object every render, or null when it looks stable. */
function freshShape(expr: string): string | null {
  if (expr.startsWith('[')) return 'an array literal';
  if (FALLBACK_ARRAY.test(expr)) return 'a `?? []` / `|| []` fallback';
  if (/^[A-Za-z_$][\w$.]*\(/.test(expr) && !PRIMITIVE_CALL.test(expr) && !MEMOISED_CALL.test(expr)) return 'a direct call';
  return null;
}

/** `usePlayer(...)` and `introKey={...}` arguments that are rebuilt on every render (AC-0/T4 #37). */
function freshHookArguments(code: string): string[] {
  const found: string[] = [];
  const hooks = /usePlayer\(|introKey=\{/g;
  for (const m of code.matchAll(hooks)) {
    const open = m.index + m[0].length - 1;
    const inner = balancedInner(code, open);
    const arg = m[0].startsWith('usePlayer') ? firstArgument(inner) : inner.trim();
    const shape = freshShape(arg);
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    const lineEnd = code.indexOf('\n', m.index);
    const line = code.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    if (shape && !ALLOW_FRESH.test(line)) found.push(`${m[0].replace(/[({]$/, '')} is given ${shape}: ${arg.slice(0, 40)}`);
  }
  return found;
}

const SEED_CONSTANT = /\b(?:BROKEN_SEED|FAILING_SEED|LOWEST_\w*SEED\w*|COUNTEREXAMPLE_\w*SEED\w*)\s*(?::\s*number\s*)?=\s*0\b(?!\.)/;
/** `allow-seed-zero: <reason>`; the reason must carry a number (the fail count or share) that shows zero is not everything-fails. */
const ALLOW_SEED_ZERO = /allow-seed-zero:\s*(.*\d.*)$/;
/** A lesson that declares a shortest witness (decisions §3) is exempt: a deterministic algorithm lesson has no meaningful seed. */
const WITNESS_CONSTANT = /\b(?:const|let)\s+[A-Z0-9_]*WITNESS[A-Z0-9_]*\b/;

const SEEDED_CALL = /\b(?:createCluster|createTickSim|mulberry32)\(/;
const ALLOW_NO_SEED = /allow-no-seed:\s*\S.{2,}/;
const SEED_SHOWN = /\bseed=|<SeedField\b/;

const hasKind = (code: string, kind: string) => new RegExp(`kind=["']${kind}["']`).test(code);

function chipIssues(id: string, code: string): Tier4Issue[] {
  const issues: Tier4Issue[] = [];
  for (const kind of REQUIRED_CHIPS[id] ?? []) {
    if (!hasKind(code, kind)) issues.push({ rule: 'chip-required', detail: `${id} needs a <Provenance kind="${kind}"> chip` });
  }
  if (/crypto\.subtle|core\/crypto/.test(code) && !hasKind(code, 'real')) {
    issues.push({ rule: 'chip-required', detail: 'the source uses crypto.subtle (or core/crypto) but wears no <Provenance kind="real"> chip' });
  }
  return issues;
}

function leadIssues(code: string): Tier4Issue[] {
  const issues: Tier4Issue[] = [];
  if (!/<ClaimLabel\b/.test(code)) issues.push({ rule: 'claim-label', detail: 'a lead lesson needs at least one <ClaimLabel>' });
  if (/<ScenarioStory\b/.test(code) && !/\bclaimOf=|\bnotes=/.test(code)) {
    issues.push({ rule: 'claim-label', detail: '<ScenarioStory> needs claimOf= or notes= so its practice claims are labelled' });
  }
  return issues;
}

function determinismIssues(code: string): Tier4Issue[] {
  const issues: Tier4Issue[] = [];
  for (const line of offendingLines(code, CLOCK_OR_RANDOM, ALLOW_RANDOM)) {
    issues.push({ rule: 'no-clock-or-random', detail: `lesson source reads the clock or Math.random: ${line.slice(0, 60)} (use a seeded Rnd, or mark the line allow-random: <reason>)` });
  }
  for (const detail of freshHookArguments(code)) {
    issues.push({ rule: 'fresh-array-hook', detail: `${detail}: memoise it or make it a module constant, or mark the line allow-fresh: <reason>` });
  }
  const calls = offendingLines(code, SEEDED_CALL, ALLOW_NO_SEED);
  if (calls.length && !SEED_SHOWN.test(code)) {
    issues.push({ rule: 'seed-visible', detail: `a seeded run (${calls[0].slice(0, 40)}) shows no seed: pass seed= to Provenance or render a <SeedField>, or mark the call allow-no-seed: <reason>` });
  }
  return issues;
}

function seedZeroIssues(id: string, code: string, testSource: string): Tier4Issue[] {
  if (WITNESS_CONSTANT.test(code)) return [];
  const lines = [...code.split('\n'), ...withoutComments(testSource).split('\n')];
  return lines
    .filter((line) => SEED_CONSTANT.test(line) && !ALLOW_SEED_ZERO.test(line))
    .map((line) => ({
      rule: 'pinned-seed-zero' as const,
      detail: `${id}: a pinned failing seed of 0 (${line.trim().slice(0, 50)}): name a seed that is not 0, declare a *_WITNESS constant, or mark allow-seed-zero: <reason with the fail count>`,
    }));
}

/** The text fields the absolutes scan covers: key ideas, quiz explanations and the summary prose (AC-0/T4 absolutes rule). */
function claimTexts(lesson: LessonModule): { where: string; text: string }[] {
  const { tldr, what, why, analogy } = lesson.summary;
  return [
    ...lesson.keyIdeas.map((text, i) => ({ where: `keyIdeas[${i}]`, text })),
    ...lesson.quiz.map((q, i) => ({ where: `Q${i + 1} why`, text: q.why ?? '' })),
    { where: 'summary.tldr', text: tldr },
    { where: 'summary.what', text: what },
    { where: 'summary.why', text: why },
    { where: 'summary.analogy', text: analogy ?? '' },
  ];
}

/** Every Tier 4 issue in one lesson: the Tier 3 rules (with the wider absolutes scan) plus the Tier 4 ones. */
export function lintTier4Lesson(lesson: LessonModule, ev: Tier4Evidence): Tier4Issue[] {
  const issues: Tier4Issue[] = lintTier3Lesson(lesson, ev).filter((i: Tier3Issue) => i.rule !== 'absolutes');

  for (const { where, text } of claimTexts(lesson)) {
    const words = unscopedAbsolutes(text, THEOREM_SCOPE);
    if (words.length && !isAllowed(text, ev.source)) {
      issues.push({ rule: 'absolutes', detail: `${where} has an unscoped "${[...new Set(words)].join('", "')}": scope it or mark the line allow-absolute: <reason>` });
    }
  }

  const code = withoutComments(ev.source);
  issues.push(...chipIssues(ev.id, code), ...determinismIssues(code), ...seedZeroIssues(ev.id, code, ev.testSource));
  if (LEAD_IDS.has(ev.id)) issues.push(...leadIssues(code));
  if (PROOF_SHAPED_IDS.has(ev.id) && new Set(manipulationTestNumbers(ev.testSource)).size < 2) {
    issues.push({ rule: 'manipulation-tests', detail: `${ev.id} is proof-shaped: it needs at least two tests named "manipulation N: ..." that make the wrong move and assert the refusal` });
  }
  return issues;
}
