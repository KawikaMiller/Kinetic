import { describe, expect, it } from 'vitest';
import { TOPICS } from './curriculum';
import { tier3PlanRows } from './testing/tier3Plan';
import { lintLesson, longestTally, SHORT_OPTION_CHARS, TIER_LONGEST_SHARE, type ContentRule } from './lessonContent';
import {
  DOMAIN_REVIEW_IDS, lintTier3Lesson, tryThisTestNumbers, unscopedAbsolutes, type Tier3Evidence,
} from './lessonContentT3';
import type { LessonModule, QuizQuestion } from './types';

/**
 * K-2 lesson-content lint over every built lesson (docs/rollout-plan.md §3.1.5).
 *
 * BASELINE: lessons that fail a rule today, each naming the ticket that fixes it and only
 * the rules it currently breaks, so anything new still fails. It must only shrink: remove
 * an entry as its ticket merges (a stale entry prints a warning below).
 */
const TIER3 = 'Tier 3 kickoff: existing Tier 3 lessons are retrofitted then';
const TIER4 = 'Tier 4 kickoff: existing Tier 4 lessons are retrofitted then';

/**
 * Existing Tier 2 lessons not yet held to the Tier 2 standard (docs/rollout-plan.md §3.1.6).
 * They don't count towards the tier-wide share until their retrofit batch merges; existing
 * Tier 3 and 4 lessons likewise wait for their tier's kickoff. Shrinks as R1 and R2 merge.
 */
const PENDING_RETROFIT = new Set<string>([
  // none: T2-R1 and T2-R2 have both landed
]);
/** Tiers whose existing lessons are all still awaiting their kickoff retrofit. */
const TIERS_AWAITING_KICKOFF = new Set([3, 4]);

const BASELINE: Record<string, { ticket: string; rules: ContentRule[] }> = {
  // Tier 1: none. Every Tier 1 lesson passes every rule.
  // Tier 2: none. The T2-R1 and T2-R2 retrofits cleared every existing lesson.
  // Tier 3
  'cdn-edge': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'circuit-breakers': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'consistent-hashing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'event-sourcing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'load-balancing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'monolith-microservices': { ticket: TIER3, rules: ['quiz-length'] },
  'oauth-flows': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'observability': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'sharding': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  // Tier 4
  'backpressure': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'crdts': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'distributed-transactions': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'lsm-trees': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'multi-region': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'probabilistic-structures': { ticket: TIER4, rules: ['quiz-length'] },
  'raft': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
  'slos-error-budgets': { ticket: TIER4, rules: ['quiz-length'] },
  'zero-trust': { ticket: TIER4, rules: ['quiz-length', 'quiz-longest'] },
};

/**
 * The 12 Tier 3 lessons that predate AC-0/T3 (docs/tier3-plan.md §5). They are exempt from the
 * AC-0/T3 rules until T3-R1 and T3-R2 retrofit them; remove each id as its retrofit merges.
 * Every other Tier 3 lesson is held to the rules from its first commit.
 */
const TIER3_AWAITING_RETROFIT = new Set([
  'load-balancing', 'consistent-hashing', 'circuit-breakers', 'monolith-microservices', 'event-sourcing',
  'sharding', 'cdn-edge', 'observability', 'oauth-flows',
]);
/** How many Tier 3 lessons were on the allowlist before the retrofits began. */
const TIER3_EXISTING_COUNT = 12;

/** Lesson folders' source, loaded on demand: only Tier 3 lessons are ever read. */
const lessonSources = import.meta.glob<string>('../lessons/**/*.{ts,tsx}', { query: '?raw', import: 'default' });
const IS_TEST_FILE = /\.test\.tsx?$/;

/** What the Tier 3 lint needs to know about a lesson beyond its module: its source and its tests. */
async function tier3Evidence(id: string): Promise<Tier3Evidence> {
  const files = Object.entries(lessonSources).filter(([path]) => path.startsWith(`../lessons/${id}/`));
  const read = async (tests: boolean) =>
    Promise.all(files.filter(([path]) => IS_TEST_FILE.test(path) === tests).map(([, load]) => load()));
  return {
    domainReview: DOMAIN_REVIEW_IDS.has(id),
    source: (await read(false)).join('\n'),
    tryThisTests: (await read(true)).flatMap(tryThisTestNumbers),
  };
}

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

  it('passes the AC-0/T3 rules if it is a Tier 3 lesson, apart from the 12 awaiting T3-R1/T3-R2', async () => {
    const unexpected: string[] = [];
    for (const { id, lesson } of lessons) {
      if (tierOf.get(id) !== 3 || TIER3_AWAITING_RETROFIT.has(id)) continue;
      for (const issue of lintTier3Lesson(lesson, await tier3Evidence(id))) unexpected.push(`${id}: ${issue.rule}: ${issue.detail}`);
    }
    expect(unexpected).toEqual([]);
  });

  it('allowlists only built Tier 3 lessons, and every one of them is checked once it leaves the list', () => {
    const built = new Set(lessons.map((l) => l.id));
    for (const id of TIER3_AWAITING_RETROFIT) {
      expect(built.has(id), id).toBe(true);
      expect(tierOf.get(id), id).toBe(3);
    }
    expect(TIER3_AWAITING_RETROFIT.size).toBeLessThanOrEqual(TIER3_EXISTING_COUNT);
  });

  it('reports the AC-0/T3 issues the allowlisted lessons still have', async () => {
    // Information for T3-R1/T3-R2, not a failure: each entry leaves the allowlist when its retrofit merges.
    const rows: string[] = [];
    for (const { id, lesson } of lessons) {
      if (!TIER3_AWAITING_RETROFIT.has(id)) continue;
      const rules = new Set(lintTier3Lesson(lesson, await tier3Evidence(id)).map((i) => i.rule));
      rows.push(`${id}: ${[...rules].join(', ') || 'clean'}`);
    }
    console.info(`AC-0/T3 issues in the allowlisted Tier 3 lessons:\n  ${rows.join('\n  ')}`);
    expect(rows).toHaveLength(TIER3_AWAITING_RETROFIT.size);
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
      expect(longest / total, `tier ${tier}: ${longest}/${total}`).toBeLessThanOrEqual(TIER_LONGEST_SHARE);
    }
  });
});
