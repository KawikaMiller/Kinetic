import { describe, expect, it } from 'vitest';
import { TOPICS } from './curriculum';
import { tier3PlanRows } from './testing/tier3Plan';
import { tier4PlanRows } from './testing/tier4Plan';
import { lintLesson, longestTally, SHORT_OPTION_CHARS, TIER_LONGEST_SHARE, type ContentRule } from './lessonContent';
import {
  DOMAIN_REVIEW_IDS, lintTier3Lesson, tryThisTestNumbers, unscopedAbsolutes, type Tier3Evidence,
} from './lessonContentT3';
import {
  DOMAIN_REVIEW_IDS_T4, LEAD_IDS, lintTier4Lesson, manipulationTestNumbers, PROOF_SHAPED_IDS, REQUIRED_CHIPS, THEOREM_SCOPE,
  type Tier4Evidence,
} from './lessonContentT4';
import type { LessonModule, QuizQuestion } from './types';

/**
 * K-2 lesson-content lint over every built lesson (docs/rollout-plan.md §3.1.5).
 *
 * BASELINE: lessons that fail a rule today, each naming the ticket that fixes it and only
 * the rules it currently breaks, so anything new still fails. It must only shrink: remove
 * an entry as its ticket merges (a stale entry prints a warning below).
 */

/**
 * The nine existing Tier 4 lessons (docs/tier4-technical.md §5). They are exempt from the AC-0/T4
 * rules until their retrofit batch (T4-R1, T4-R2) merges; each leaves this list, BASELINE and
 * PENDING_RETROFIT together. Every other Tier 4 lesson is held to the rules from its first commit.
 */
const TIER4_AWAITING_RETROFIT = new Set<string>();
/** The nine existing Tier 4 lessons, fixed: the D-row cross-check needs them after each one leaves the allowlist above. */
const TIER4_RETROFIT_IDS: ReadonlySet<string> = new Set([
  'raft', 'distributed-transactions', 'crdts', 'multi-region', 'backpressure', 'lsm-trees', 'probabilistic-structures',
  'slos-error-budgets', 'zero-trust',
]);
/** How many Tier 4 lessons were on the allowlist before the retrofits began. */
const TIER4_EXISTING_COUNT = 9;

/**
 * Existing lessons not yet held to their tier's standard. They don't count towards the tier-wide
 * quiz-longest share until their retrofit batch merges. The Tier 4 set must hold every Tier 4
 * lesson that is not on BASELINE for quiz-longest: probabilistic-structures and slos-error-budgets
 * only have quiz-length there, so counting them would put the tier at 2 of 6 (33%), over the cap.
 */
const PENDING_RETROFIT = new Set<string>(TIER4_AWAITING_RETROFIT);
/** Tiers whose lessons are not yet held to the per-tier quiz-longest cap (none: Tier 4 counts now). */
const TIERS_AWAITING_KICKOFF = new Set<number>();
/** A tier-wide share over a handful of questions is noise: skip the aggregate until this many are counted. */
const MIN_QUESTIONS_FOR_SHARE = 30;

const BASELINE: Record<string, { ticket: string; rules: ContentRule[] }> = {
  // Tier 1: none. Every Tier 1 lesson passes every rule.
  // Tier 2: none. The T2-R1 and T2-R2 retrofits cleared every existing lesson.
  // Tier 3
  // Tier 4
};

/**
 * The 12 Tier 3 lessons that predate AC-0/T3 (docs/tier3-plan.md §5). They are exempt from the
 * AC-0/T3 rules until retrofitted; the list is empty now that T3-R1 and T3-R2 have merged.
 * Every other Tier 3 lesson is held to the rules from its first commit.
 */
const TIER3_AWAITING_RETROFIT = new Set<string>();
/** How many Tier 3 lessons were on the allowlist before the retrofits began. */
const TIER3_EXISTING_COUNT = 12;

/** Lesson folders' source, loaded on demand: only Tier 3 and Tier 4 lessons are ever read. */
const lessonSources = import.meta.glob<string>('../lessons/**/*.{ts,tsx}', { query: '?raw', import: 'default' });
const IS_TEST_FILE = /\.test\.tsx?$/;

/** What the AC-0/T3 and AC-0/T4 lints need to know about a lesson beyond its module: its source and its tests. */
async function tierEvidence(id: string, domainSet: ReadonlySet<string>): Promise<Tier4Evidence> {
  const files = Object.entries(lessonSources).filter(([path]) => path.startsWith(`../lessons/${id}/`));
  const read = async (tests: boolean) =>
    Promise.all(files.filter(([path]) => IS_TEST_FILE.test(path) === tests).map(([, load]) => load()));
  const testFiles = await read(true);
  return {
    id,
    domainReview: domainSet.has(id),
    source: (await read(false)).join('\n'),
    tryThisTests: testFiles.flatMap(tryThisTestNumbers),
    testSource: testFiles.join('\n'),
  };
}

/** One row per tier that has a content lint: who is on the retrofit allowlist, who is domain-reviewed, which lint runs. */
const TIER_LINT = [
  { tier: 3, awaiting: TIER3_AWAITING_RETROFIT, existing: TIER3_EXISTING_COUNT, domain: DOMAIN_REVIEW_IDS, lint: lintTier3Lesson },
  { tier: 4, awaiting: TIER4_AWAITING_RETROFIT, existing: TIER4_EXISTING_COUNT, domain: DOMAIN_REVIEW_IDS_T4, lint: lintTier4Lesson },
] as const;

const modules = import.meta.glob<{ default: LessonModule }>('../lessons/*/index.tsx', { eager: true });
const lessons = Object.entries(modules).map(([path, mod]) => ({ id: path.split('/')[2], lesson: mod.default }));
const topicIds = new Set(TOPICS.map((t) => t.id));
const tierOf = new Map(TOPICS.map((t) => [t.id, t.tier]));

// ── Each rule fails on a planted bad fixture ─────────────────────────────

const q = (options: string[], answer = 0): QuizQuestion => ({ q: 'Which?', options, answer, why: 'Because.' });
const GOOD: LessonModule = {
  summary: {
    tldr: 'One line.', what: 'What it is.', why: 'Why it matters.', watch: 'How to read it.',
    useCases: ['a', 'b', 'c'],
  },
  tryThis: ['one', 'two', 'three'],
  keyIdeas: ['one', 'two', 'three'],
  quiz: [
    q(['Sorted input', 'Unique items', 'Short arrays'], 0),
    q(['Unique items', 'Sorted input', 'Short arrays'], 1),
    q(['Unique items', 'Short arrays', 'Sorted input'], 2),
  ],
  Stage: () => null,
};
const rulesOf = (l: LessonModule) => lintLesson(l, topicIds).map((i) => i.rule);

describe('lesson-content rules', () => {
  it('pass a well-formed lesson', () => {
    expect(rulesOf(GOOD)).toEqual([]);
  });

  it('fail on out-of-range counts', () => {
    expect(rulesOf({ ...GOOD, keyIdeas: ['1', '2', '3', '4', '5'] })).toContain('counts');
    expect(rulesOf({ ...GOOD, tryThis: ['1', '2'] })).toContain('counts');
    expect(rulesOf({ ...GOOD, summary: { ...GOOD.summary, useCases: ['a', 'b', 'c', 'd', 'e'] } })).toContain('counts');
    expect(rulesOf({ ...GOOD, quiz: GOOD.quiz.slice(0, 2) })).toContain('counts');
  });

  it('fail on a question without a why', () => {
    expect(rulesOf({ ...GOOD, quiz: [{ ...GOOD.quiz[0], why: '' }, ...GOOD.quiz.slice(1)] })).toContain('quiz-why');
  });

  it('fail on an answer index out of range', () => {
    expect(rulesOf({ ...GOOD, quiz: [{ ...GOOD.quiz[0], answer: 3 }, ...GOOD.quiz.slice(1)] })).toContain('quiz-answer');
  });

  it('fail on duplicate options', () => {
    expect(rulesOf({ ...GOOD, quiz: [q(['Sorted input', 'sorted input ', 'Short arrays']), ...GOOD.quiz.slice(1)] })).toContain('quiz-duplicates');
  });

  it('fail when the correct option is much longer or shorter than the distractors', () => {
    const long = q(['Sorted input, because order tells you which half to drop', 'Unique items', 'Short arrays']);
    const short = q(['No', 'Unique items only', 'Short arrays only']);
    expect(rulesOf({ ...GOOD, quiz: [long, ...GOOD.quiz.slice(1)] })).toContain('quiz-length');
    expect(rulesOf({ ...GOOD, quiz: [short, ...GOOD.quiz.slice(1)] })).toContain('quiz-length');
  });

  it(`skip the length ratio when every option is ${SHORT_OPTION_CHARS} characters or fewer`, () => {
    // 3 vs 10 characters is a 0.3 ratio but no visible tell among symbolic answers.
    const symbolic = q(['O(n)', 'O(n log n)', 'O(n²) time'], 0);
    const justOver = q(['O(n)', 'O(n log n) always', 'O(n²) in the worst case'], 0);
    expect(rulesOf({ ...GOOD, quiz: [symbolic, ...GOOD.quiz.slice(1)] })).not.toContain('quiz-length');
    expect(rulesOf({ ...GOOD, quiz: [justOver, ...GOOD.quiz.slice(1)] })).toContain('quiz-length');
  });

  it('fail when the correct option is strictly the longest in a majority of questions', () => {
    const tell = (a: number) => {
      const opts = ['Short arrays', 'Unique items'];
      opts.splice(a, 0, 'Sorted inputs'); // one character longer than both distractors
      return q(opts, a);
    };
    expect(rulesOf({ ...GOOD, quiz: [tell(0), tell(1), GOOD.quiz[2]] })).toContain('quiz-longest');
    expect(rulesOf({ ...GOOD, quiz: [tell(0), GOOD.quiz[1], GOOD.quiz[2]] })).not.toContain('quiz-longest');
  });

  it('fail on "all/none of the above"', () => {
    expect(rulesOf({ ...GOOD, quiz: [q(['Sorted input', 'None of the above', 'Short arrays']), ...GOOD.quiz.slice(1)] })).toContain('quiz-of-the-above');
  });

  it('fail on a backticked lesson id that is a near miss of a registered one', () => {
    const typo = { ...GOOD, keyIdeas: ['See `binary-serch` first.', 'two', 'three'] };
    const fine = { ...GOOD, keyIdeas: ['See `binary-search` first.', 'Set `box-sizing` too.', 'three'] };
    expect(rulesOf(typo)).toContain('links');
    expect(rulesOf(fine)).not.toContain('links');
  });
});

// ── AC-0/T3 rules (K3-T2) fail on planted bad fixtures ───────────────────

const CLEAN: Tier3Evidence = { domainReview: false, source: '', tryThisTests: [1, 2, 3] };
const t3Rules = (l: LessonModule, ev: Partial<Tier3Evidence> = {}) => lintTier3Lesson(l, { ...CLEAN, ...ev }).map((i) => i.rule);
const withKeyIdea = (text: string): LessonModule => ({ ...GOOD, keyIdeas: [text, 'two', 'three'] });
const withWhy = (why: string): LessonModule => ({ ...GOOD, quiz: [{ ...GOOD.quiz[0], why }, ...GOOD.quiz.slice(1)] });

describe('AC-0/T3 rules', () => {
  it('pass a well-formed lesson', () => {
    expect(t3Rules(GOOD)).toEqual([]);
  });

  it('find an unscoped absolute, and every word the list names', () => {
    for (const word of ['never', 'always', 'every', 'all', 'only', 'must', 'guaranteed', 'most', 'typical', 'typically']) {
      expect(unscopedAbsolutes(`A cache ${word} helps.`), word).toEqual([word]);
    }
    expect(unscopedAbsolutes('ALWAYS verify. Never trust.')).toEqual(['always', 'never']);
    expect(unscopedAbsolutes('A cache can help, sometimes.')).toEqual([]);
    expect(unscopedAbsolutes('Normally the first request is slow.')).toEqual([]);
  });

  it('read a scope phrase as hedging only the sentence it sits in', () => {
    expect(unscopedAbsolutes('In this model, a leaf never sets up a frame.')).toEqual([]);
    expect(unscopedAbsolutes('Browsers default to Lax by default in current Chrome, never elsewhere.')).toEqual([]);
    expect(unscopedAbsolutes('It holds in this model. A real cluster never agrees for free.')).toEqual(['never']);
  });

  it('fail on an unscoped absolute in keyIdeas or a quiz why', () => {
    expect(t3Rules(withKeyIdea('Retries always make things worse.'))).toContain('absolutes');
    expect(t3Rules(withWhy('Every provider shares deny-wins.'))).toContain('absolutes');
    expect(t3Rules(withKeyIdea('Retries make things worse unless they back off.'))).not.toContain('absolutes');
  });

  it('read allow-absolute: <reason> on the line that holds the text as an exemption', () => {
    const text = "Retries always make things worse, don't they.";
    const marked = `  keyIdeas: [\n    'Retries always make things worse, don\\'t they.', // allow-absolute: pinned by sim.test.ts\n  ],`;
    const bareMarker = `    'Retries always make things worse, don\\'t they.', // allow-absolute:`;
    const elsewhere = `    'Something else entirely, always.', // allow-absolute: other line`;
    expect(t3Rules(withKeyIdea(text), { source: marked })).not.toContain('absolutes');
    expect(t3Rules(withKeyIdea(text), { source: bareMarker })).toContain('absolutes');
    expect(t3Rules(withKeyIdea(text), { source: elsewhere })).toContain('absolutes');
  });

  it('fail a D lesson without a Provenance chip, and pass it with one', () => {
    expect(t3Rules(GOOD, { domainReview: true, source: 'export const x = 1;' })).toContain('provenance');
    expect(t3Rules(GOOD, { domainReview: true, source: '<Provenance kind="toy">a toy</Provenance>' })).not.toContain('provenance');
    expect(t3Rules(GOOD, { domainReview: false, source: '' })).not.toContain('provenance');
    expect(t3Rules(GOOD, { domainReview: true, source: '// <Provenance> is imported elsewhere' })).toContain('provenance');
  });

  it('fail a lesson with fewer try-this N: tests than tryThis entries', () => {
    expect(t3Rules(GOOD, { tryThisTests: [1, 2] })).toContain('try-this-tests');
    expect(t3Rules(GOOD, { tryThisTests: [] })).toContain('try-this-tests');
    expect(t3Rules(GOOD, { tryThisTests: [1, 1, 3] }), 'a repeated number is not a second test').toContain('try-this-tests');
    expect(t3Rules(GOOD, { tryThisTests: [1, 2, 3, 4] })).not.toContain('try-this-tests');
  });

  it('find the try-this N: tests in a test file', () => {
    const src = [
      "it('try-this 1: the default state shows a stale read', () => {});",
      'test("try-this 2: first reset, then drag", () => {});',
      "it.skip('try-this 3: not run', () => {});",
      "it('try-this: no number', () => {});",
      "it('tries this 4: wrong name', () => {});",
    ].join('\n');
    expect(tryThisTestNumbers(src)).toEqual([1, 2, 3]);
  });

  it('flag 86 registered Tier 3 topics as D', () => {
    expect(DOMAIN_REVIEW_IDS.size).toBe(86);
    for (const id of DOMAIN_REVIEW_IDS) expect(tierOf.get(id), id).toBe(3);
  });

  it.skipIf(!tier3PlanRows.length)('flag exactly the D rows of the plan', () => {
    const planned = tier3PlanRows.filter((r) => r.domainReview).map((r) => r.id);
    expect([...DOMAIN_REVIEW_IDS].sort()).toEqual(planned.sort());
  });
});

// ── AC-0/T4 rules (T4-T2) fail on planted bad fixtures ───────────────────

const CLEAN4: Tier4Evidence = { ...CLEAN, id: 'some-lesson', testSource: '' };
const t4Rules = (l: LessonModule, ev: Partial<Tier4Evidence> = {}) =>
  lintTier4Lesson(l, { ...CLEAN4, ...ev }).map((i) => i.rule);
const withSummary = (patch: Partial<LessonModule['summary']>): LessonModule => ({ ...GOOD, summary: { ...GOOD.summary, ...patch } });

describe('AC-0/T4 rules', () => {
  it('pass a well-formed lesson', () => {
    expect(t4Rules(GOOD)).toEqual([]);
  });

  it('keep the Tier 3 absolutes scan unchanged when no extra scope is passed', () => {
    expect(unscopedAbsolutes('Every deterministic protocol fails, as the theorem says.')).toEqual(['every']);
    expect(unscopedAbsolutes('Every deterministic protocol fails, as the theorem says.', THEOREM_SCOPE)).toEqual([]);
  });

  it('scan the summary as well as key ideas and quiz why, with the theorem scope', () => {
    for (const field of ['tldr', 'what', 'why', 'analogy'] as const) {
      expect(t4Rules(withSummary({ [field]: 'A cache always helps.' })), field).toContain('absolutes');
    }
    expect(t4Rules(withKeyIdea('Retries always make things worse.'))).toContain('absolutes');
    expect(t4Rules(withSummary({ what: 'Under the assumption of one crash, every protocol blocks.' }))).not.toContain('absolutes');
    const marked = "    tldr: 'A cache always helps.', // allow-absolute: pinned by sim.test.ts";
    expect(t4Rules(withSummary({ tldr: 'A cache always helps.' }), { source: marked })).not.toContain('absolutes');
  });

  it('still apply the Tier 3 provenance and try-this rules', () => {
    expect(t4Rules(GOOD, { domainReview: true, source: 'export const x = 1;' })).toContain('provenance');
    expect(t4Rules(GOOD, { tryThisTests: [1] })).toContain('try-this-tests');
  });

  it('chip-required: fail a lesson missing the chip kind its id requires, and one using crypto.subtle without a real chip', () => {
    const toy = '<Provenance kind="toy">a toy</Provenance>';
    expect(t4Rules(GOOD, { id: 'elliptic-curves', source: 'export const x = 1;' })).toContain('chip-required');
    expect(t4Rules(GOOD, { id: 'elliptic-curves', source: toy })).not.toContain('chip-required');
    expect(t4Rules(GOOD, { id: 'llm-serving', source: toy }), 'llm-serving needs illustrative too').toContain('chip-required');
    expect(t4Rules(GOOD, { id: 'llm-serving', source: `${toy}<Provenance kind="illustrative">x</Provenance>` })).not.toContain('chip-required');
    expect(t4Rules(GOOD, { source: 'await crypto.subtle.digest(a, b);' })).toContain('chip-required');
    expect(t4Rules(GOOD, { source: "import { hmac } from '../../core/crypto';" })).toContain('chip-required');
    expect(t4Rules(GOOD, { source: 'crypto.subtle.digest(a, b); <Provenance kind="real">live</Provenance>' })).not.toContain('chip-required');
    expect(t4Rules(GOOD, { source: '// crypto.subtle is mentioned in a comment' })).not.toContain('chip-required');
  });

  it('claim-label: fail a lead lesson without a ClaimLabel, or a ScenarioStory without claimOf= or notes=', () => {
    const lead = { id: 'build-vs-buy' };
    expect(t4Rules(GOOD, { ...lead, source: 'export const x = 1;' })).toContain('claim-label');
    expect(t4Rules(GOOD, { ...lead, source: '<ClaimLabel kind="view">x</ClaimLabel>' })).not.toContain('claim-label');
    expect(t4Rules(GOOD, { ...lead, source: '<ClaimLabel kind="view" /><ScenarioStory scenario={s} />' })).toContain('claim-label');
    expect(t4Rules(GOOD, { ...lead, source: '<ClaimLabel kind="view" /><ScenarioStory scenario={s} claimOf={c} />' })).not.toContain('claim-label');
    expect(t4Rules(GOOD, { ...lead, source: '<ScenarioStory scenario={s} notes={<ClaimLabel kind="view" />} />' })).not.toContain('claim-label');
    expect(t4Rules(GOOD, { id: 'paxos', source: 'export const x = 1;' }), 'a non-lead needs none').not.toContain('claim-label');
  });

  it('no-clock-or-random: fail Math.random, Date.now, performance.now and new Date, unless the line says allow-random', () => {
    for (const call of ['Math.random()', 'Date.now()', 'performance.now()', 'new Date()']) {
      expect(t4Rules(GOOD, { source: `const x = ${call};` }), call).toContain('no-clock-or-random');
    }
    expect(t4Rules(GOOD, { source: 'const x = Math.random(); // allow-random: decorative jitter, never feeds a stat' })).not.toContain('no-clock-or-random');
    expect(t4Rules(GOOD, { source: 'const x = Math.random(); // allow-random:' })).toContain('no-clock-or-random');
    expect(t4Rules(GOOD, { source: '// never call Math.random here\nconst r = mulberry32(1);' })).not.toContain('no-clock-or-random');
  });

  it('fresh-array-hook: fail an array literal, a direct call or a `?? []` fallback handed to usePlayer or introKey', () => {
    const bad = [
      'const p = usePlayer([a, b], { interval: 5 });',
      'const p = usePlayer(buildFrames(x), { interval: 5 });',
      'const p = usePlayer(frames ?? [], { interval: 5 });',
      'const p = usePlayer(rec.frames || [], { interval: 5 });',
      '<StageFrame introKey={[input]}>',
      '<StageFrame introKey={makeKey(r)}>',
    ];
    for (const source of bad) expect(t4Rules(GOOD, { source }), source).toContain('fresh-array-hook');
    const fine = [
      'const p = usePlayer(frames, { interval: 5 });',
      'const p = usePlayer(useMemo(() => build(x), [x]), { interval: 5 });',
      '<StageFrame introKey={caption}>',
      '<StageFrame introKey={`${a}|${b}`}>',
      '<StageFrame introKey={xs.join(\',\')}>',
      '<StageFrame introKey={String(n)}>',
      'const p = usePlayer([a, b], { interval: 5 }); // allow-fresh: constants, never changes',
    ];
    for (const source of fine) expect(t4Rules(GOOD, { source }), source).not.toContain('fresh-array-hook');
  });

  it('pinned-seed-zero: fail a failing-seed constant of 0 unless it is marked, or the lesson declares a witness', () => {
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 0;' })).toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { testSource: 'const LOWEST_FAILING_SEED = 0;' })).toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'const COUNTEREXAMPLE_SEED = 0' })).toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 7;' })).not.toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 0.5;' })).not.toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 0; // allow-seed-zero: fails on 41 of 200 seeds, seed 0 is the first of them' })).not.toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 0; // allow-seed-zero: it is fine' }), 'the reason must carry the fail count').toContain('pinned-seed-zero');
    expect(t4Rules(GOOD, { source: 'export const BROKEN_SEED = 0;\nexport const SHORTEST_WITNESS = { clauses: 2 };' }), 'a declared witness exempts it').not.toContain('pinned-seed-zero');
  });

  it('seed-visible: fail a lesson that builds a cluster, tick sim or Rnd without showing a seed', () => {
    for (const call of ['createCluster(cfg)', 'createTickSim(cfg)', 'mulberry32(seed)']) {
      expect(t4Rules(GOOD, { source: `const s = ${call};` }), call).toContain('seed-visible');
    }
    expect(t4Rules(GOOD, { source: 'const s = createCluster(cfg); <Provenance kind="simulated" seed={seed} />' })).not.toContain('seed-visible');
    expect(t4Rules(GOOD, { source: 'const s = mulberry32(seed); <SeedField seed={seed} onChange={set} />' })).not.toContain('seed-visible');
    expect(t4Rules(GOOD, { source: 'const s = mulberry32(1); // allow-no-seed: fixed decorative layout' })).not.toContain('seed-visible');
  });

  it('manipulation-tests: fail a proof-shaped lesson with fewer than two distinct manipulation N: tests', () => {
    const one = "it('manipulation 1: picking a cover of size K-1 is refused', () => {});";
    const two = `${one}\ntest("manipulation 2: an unsatisfiable formula has no cover", () => {});`;
    expect(t4Rules(GOOD, { id: 'np-reductions', testSource: '' })).toContain('manipulation-tests');
    expect(t4Rules(GOOD, { id: 'np-reductions', testSource: one })).toContain('manipulation-tests');
    expect(t4Rules(GOOD, { id: 'np-reductions', testSource: `${one}\n${one}` }), 'a repeated number is not a second test').toContain('manipulation-tests');
    expect(t4Rules(GOOD, { id: 'np-reductions', testSource: two })).not.toContain('manipulation-tests');
    expect(t4Rules(GOOD, { id: 'paxos', testSource: '' }), 'only proof-shaped ids need them').not.toContain('manipulation-tests');
    expect(manipulationTestNumbers(`${two}\nit('manipulation: no number', () => {});`)).toEqual([1, 2]);
  });

  it('flag 38 registered Tier 4 topics as D: the nine retrofits plus the 29 D rows of the plan', () => {
    expect(DOMAIN_REVIEW_IDS_T4.size).toBe(38);
    for (const id of DOMAIN_REVIEW_IDS_T4) expect(tierOf.get(id), id).toBe(4);
    for (const id of TIER4_AWAITING_RETROFIT) expect(DOMAIN_REVIEW_IDS_T4.has(id), id).toBe(true);
  });

  it.skipIf(!tier4PlanRows.length)('flag exactly the D rows of the plan', () => {
    const planned = tier4PlanRows.filter((r) => r.domainReview).map((r) => r.id);
    expect(planned).toHaveLength(29);
    const newlyFlagged = [...DOMAIN_REVIEW_IDS_T4].filter((id) => !TIER4_RETROFIT_IDS.has(id));
    expect(newlyFlagged.sort()).toEqual(planned.sort());
  });

  it('name only registered Tier 4 topics in the proof-shaped, lead and required-chip tables', () => {
    expect(PROOF_SHAPED_IDS.size).toBe(8);
    expect(LEAD_IDS.size).toBe(7);
    for (const id of [...PROOF_SHAPED_IDS, ...LEAD_IDS, ...Object.keys(REQUIRED_CHIPS)]) expect(tierOf.get(id), id).toBe(4);
  });
});

// ── Every built lesson ───────────────────────────────────────────────────

describe('every built lesson', () => {
  it('passes the lesson-content rules, apart from its baselined ones', () => {
    const unexpected: string[] = [];
    for (const { id, lesson } of lessons) {
      const allowed = new Set(BASELINE[id]?.rules ?? []);
      for (const issue of lintLesson(lesson, topicIds)) {
        if (!allowed.has(issue.rule)) unexpected.push(`${id}: ${issue.rule}: ${issue.detail}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  for (const { tier, awaiting, existing, domain, lint } of TIER_LINT) {
    it(`passes the AC-0/T${tier} rules if it is a Tier ${tier} lesson, apart from any still on the retrofit allowlist`, async () => {
      const unexpected: string[] = [];
      for (const { id, lesson } of lessons) {
        if (tierOf.get(id) !== tier || awaiting.has(id)) continue;
        for (const issue of lint(lesson, await tierEvidence(id, domain))) unexpected.push(`${id}: ${issue.rule}: ${issue.detail}`);
      }
      expect(unexpected).toEqual([]);
    });

    it(`allowlists only built Tier ${tier} lessons, and every one of them is checked once it leaves the list`, () => {
      const built = new Set(lessons.map((l) => l.id));
      for (const id of awaiting) {
        expect(built.has(id), id).toBe(true);
        expect(tierOf.get(id), id).toBe(tier);
      }
      expect(awaiting.size).toBeLessThanOrEqual(existing);
    });

    it(`reports the AC-0/T${tier} issues the allowlisted lessons still have`, async () => {
      // Information for the retrofit tickets, not a failure: each entry leaves the allowlist when its retrofit merges.
      const rows: string[] = [];
      for (const { id, lesson } of lessons) {
        if (!awaiting.has(id)) continue;
        const rules = new Set(lint(lesson, await tierEvidence(id, domain)).map((i) => i.rule));
        rows.push(`${id}: ${[...rules].join(', ') || 'clean'}`);
      }
      console.info(`AC-0/T${tier} issues in the allowlisted Tier ${tier} lessons:\n  ${rows.join('\n  ')}`);
      expect(rows).toHaveLength(awaiting.size);
    });
  }

  it('keeps every retrofit allowlist entry in PENDING_RETROFIT, so a half-retrofitted tier never skews the share', () => {
    for (const id of TIER4_AWAITING_RETROFIT) expect(PENDING_RETROFIT.has(id), id).toBe(true);
  });

  it('guards the Tier 4 quiz-share trap twice (technical doc §6.2): the pending set and the minimum question count', () => {
    // Trap one: a lesson baselined for quiz-length only would be counted without PENDING_RETROFIT, and two such lessons alone can break the cap.
    // (Fixtures: the real lessons that once stood here left the allowlist in T4-R2.)
    const longer = (n: number) => ({ ...GOOD, quiz: Array.from({ length: 3 }, (_, i) => (i < n ? q(['Short', 'Brief', 'A noticeably longer correct option'], 2) : GOOD.quiz[1])) });
    const trap = [longer(2), longer(2)];
    const { longest, total } = longestTally(trap);
    expect(trap).toHaveLength(2);
    expect(longest / total, `${longest}/${total}`).toBeGreaterThan(TIER_LONGEST_SHARE);
    // Trap two: a handful of questions is noise; the aggregate waits for MIN_QUESTIONS_FOR_SHARE.
    expect(total).toBeLessThan(MIN_QUESTIONS_FOR_SHARE);
    // The shortest real case: one new lesson, three questions, one strictly-longest correct option (33%).
    const oneLongest = { ...GOOD, quiz: [{ ...q(['Short arrays', 'Unique items', 'Sorted inputs'], 2) }, GOOD.quiz[1], GOOD.quiz[2]] };
    const lone = longestTally([oneLongest]);
    expect(lone.longest / lone.total).toBeGreaterThan(TIER_LONGEST_SHARE);
    expect(lone.total).toBeLessThan(MIN_QUESTIONS_FOR_SHARE);
  });

  it('has a baseline that only names built lessons, each with a ticket', () => {
    const built = new Set(lessons.map((l) => l.id));
    for (const [id, entry] of Object.entries(BASELINE)) {
      expect(built.has(id), id).toBe(true);
      expect(entry.ticket.length, id).toBeGreaterThan(0);
      expect(entry.rules.length, id).toBeGreaterThan(0);
    }
  });

  it('reports baseline entries that are no longer needed', () => {
    // A warning, not a failure: batches can't edit core, so the coordinator shrinks the list.
    const stale: string[] = [];
    for (const { id, lesson } of lessons) {
      const entry = BASELINE[id];
      if (!entry) continue;
      const failing = new Set(lintLesson(lesson, topicIds).map((i) => i.rule));
      for (const rule of entry.rules) if (!failing.has(rule)) stale.push(`${id}: ${rule}`);
    }
    if (stale.length) console.warn(`K-2 baseline entries that now pass and can be removed:\n  ${stale.join('\n  ')}`);
    expect(true).toBe(true);
  });

  it(`keeps the correct option strictly longest in at most ${TIER_LONGEST_SHARE * 100}% of each tier's questions`, () => {
    for (const tier of [1, 2, 3, 4]) {
      if (TIERS_AWAITING_KICKOFF.has(tier)) continue;
      // Measured once their ticket lands: lessons awaiting a retrofit, and ones baselined for quiz-longest.
      const counted = lessons
        .filter(({ id }) => tierOf.get(id) === tier && !PENDING_RETROFIT.has(id) && !BASELINE[id]?.rules.includes('quiz-longest'))
        .map(({ lesson }) => lesson);
      if (!counted.length) continue;
      const { longest, total } = longestTally(counted);
      if (total < MIN_QUESTIONS_FOR_SHARE) continue; // the per-lesson quiz-longest rule still applies from the first commit
      expect(longest / total, `tier ${tier}: ${longest}/${total}`).toBeLessThanOrEqual(TIER_LONGEST_SHARE);
    }
  });
});
