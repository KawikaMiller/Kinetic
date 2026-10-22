import type { LessonModule } from './types';

/**
 * Tier 3 content lint (docs/tier3-plan.md AC-0/T3, ticket K3-T2): the rules that can be
 * checked mechanically on top of the K-2 lint in lessonContent.ts. Pure functions, so
 * lessonContent.test.ts can prove each rule fails on a bad fixture and then run them over
 * the Tier 3 lessons. They apply to Tier 3 lessons only; Tier 4 (lessonContentT4.ts) wraps
 * `lintTier3Lesson` and reuses `unscopedAbsolutes`, `isAllowed` and `withoutComments`.
 */

export type Tier3Rule = 'absolutes' | 'provenance' | 'try-this-tests';

export interface Tier3Issue {
  rule: Tier3Rule;
  detail: string;
}

/**
 * The 86 Tier 3 lessons flagged **D** (domain review) in docs/tier3-plan.md §2: an error in
 * them would teach a wrong fact about a real system, standard, protocol or piece of maths.
 * Each must show at least one `Provenance` chip (AC-0/T3 #21).
 */
export const DOMAIN_REVIEW_IDS: ReadonlySet<string> = new Set([
  'dma-io-devices', 'branch-prediction', 'cache-coherence', 'io-models', 'fork-copy-on-write',
  'mmap-page-cache', 'priority-inversion', 'page-tables-tlb', 'halting-problem', 'lambda-calculus',
  'compiler-optimisations', 'undefined-behavior', 'chomsky-hierarchy', 'distributions',
  'percentiles-statistics', 'queueing-theory', 'hypothesis-testing-ab', 'entropy-information', 'markov-chains',
  'eigen-pagerank', 'svd-pca', 'numeric-precision', 'fourier-transform', 'lossy-compression',
  'count-min-heavy-hitters', 'routing-algorithms', 'bgp', 'wifi-shared-medium', 'congestion-control', 'quic',
  'cloud-networking-vpc', 'vpns-tunneling', 'nat-traversal-webrtc', 'back-of-envelope', 'double-entry-ledgers',
  'physical-clocks-skew', 'logical-clocks', 'consistency-models', 'exactly-once-myth', 'leases-fencing',
  'job-scheduling', 'transactional-outbox', 'service-discovery-mesh', 'schema-evolution', 'quorums',
  'query-planning', 'mvcc', 'kafka-partitioned-log', 'stream-windowing', 'vector-search', 'write-ahead-log',
  'change-data-capture', 'zero-downtime-migrations', 'merkle-trees', 'timing-side-channels', 'authz-models',
  'ssrf-access-control', 'envelope-encryption-kms', 'randomness-csprng', 'fuzzing', 'redos',
  'sandboxing-isolation', 'supply-chain-security', 'privacy-engineering', 'ddos-mitigation', 'tail-latency',
  'capacity-planning', 'dora-metrics', 'backups-disaster-recovery', 'benchmarking-methodology', 'webassembly',
  'gpu-rendering-pipeline', 'offline-first-sync', 'neural-networks-backprop', 'cnns-convolution',
  'attention-transformers', 'tokenization-bpe', 'training-vs-inference', 'rag-pipelines', 'llm-agents-tool-use',
  'model-evals-drift', 'recommender-systems', 'reinforcement-learning', 'ml-fairness-bias', 'estimation',
  'prioritization',
]);

/** Words that claim something holds without exception (AC-0/T3 #15). */
const ABSOLUTE = /\b(never|always|every|all|only|must|guaranteed|most|typical(?:ly)?)\b/gi;

/**
 * A sentence that names where its claim holds is scoped: "in this model", "by default in
 * current Chrome", "unless the compiler can see the callee". Anything else with an
 * absolute in it is flagged.
 */
const SCOPE =
  /\b(in this (model|lesson|sim|simulation|toy|demo|scene|visual|example)|in the (model|sim|simulation|lesson)|by default|unless|except|in current)\b/i;

/** The same-line marker that exempts an absolute from the check: `allow-absolute: <reason>`. */
const ALLOW_MARKER = /allow-absolute:\s*(\S.{2,})/;

/** How many leading characters of a text locate its source line when looking for the marker. */
const ANCHOR_CHARS = 24;

const plain = (s: string) => s.replace(/\\/g, '');

/**
 * The absolute words in a text, one entry per unscoped sentence that carries one. `extraScope` adds
 * scope phrases of its own (Tier 4's theorem wording); without it the Tier 3 behaviour is unchanged.
 */
export function unscopedAbsolutes(text: string, extraScope?: RegExp): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !SCOPE.test(sentence) && !extraScope?.test(sentence))
    .flatMap((sentence) => [...sentence.matchAll(ABSOLUTE)].map((m) => m[1].toLowerCase()));
}

/**
 * True when the source line that holds `text` ends in an `allow-absolute: <reason>` comment.
 * The line is found by the first characters of the text, so the marker sits next to the
 * string literal it exempts, like `allow-color` does for a colour.
 */
export function isAllowed(text: string, source: string): boolean {
  const anchor = plain(text).slice(0, ANCHOR_CHARS);
  if (!anchor) return false;
  return source.split('\n').some((line) => plain(line).includes(anchor) && ALLOW_MARKER.test(line));
}

/** Source without block comments and whole-line comments, so a mention of the chip doesn't count as one. */
export const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');

/** The N of every test named `try-this N: ...` in a test file's source. */
export function tryThisTestNumbers(testSource: string): number[] {
  return [...testSource.matchAll(/\b(?:it|test)(?:\.\w+)?\(\s*['"`]try-this (\d+):/g)].map((m) => Number(m[1]));
}

export interface Tier3Evidence {
  /** The lesson is flagged D in the plan (see DOMAIN_REVIEW_IDS). */
  domainReview: boolean;
  /** Source text of the lesson folder, tests excluded: where the chip and the markers live. */
  source: string;
  /** `try-this N:` numbers found in the lesson folder's tests (see tryThisTestNumbers). */
  tryThisTests: readonly number[];
}

/** Every Tier 3 issue in one lesson. */
export function lintTier3Lesson(lesson: LessonModule, evidence: Tier3Evidence): Tier3Issue[] {
  const issues: Tier3Issue[] = [];

  const claims = [
    ...lesson.keyIdeas.map((text, i) => ({ where: `keyIdeas[${i}]`, text })),
    ...lesson.quiz.map((q, i) => ({ where: `Q${i + 1} why`, text: q.why ?? '' })),
  ];
  for (const { where, text } of claims) {
    const words = unscopedAbsolutes(text);
    if (words.length && !isAllowed(text, evidence.source)) {
      issues.push({ rule: 'absolutes', detail: `${where} has an unscoped "${[...new Set(words)].join('", "')}": scope it or mark the line allow-absolute: <reason>` });
    }
  }

  if (evidence.domainReview && !/<Provenance\b/.test(withoutComments(evidence.source))) {
    issues.push({ rule: 'provenance', detail: 'a domain-reviewed lesson needs at least one <Provenance> chip' });
  }

  const tested = new Set(evidence.tryThisTests);
  const missing = lesson.tryThis.map((_, i) => i + 1).filter((n) => !tested.has(n));
  if (missing.length) {
    const names = missing.map((n) => `"try-this ${n}: …"`).join(', ');
    issues.push({ rule: 'try-this-tests', detail: `tryThis has ${lesson.tryThis.length} entries; no test named ${names}` });
  }
  return issues;
}
