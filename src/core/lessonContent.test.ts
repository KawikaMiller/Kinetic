import { describe, expect, it } from 'vitest';
import { TOPICS } from './curriculum';
import { lintLesson, longestTally, SHORT_OPTION_CHARS, TIER_LONGEST_SHARE, type ContentRule } from './lessonContent';
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
  'cap-theorem': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'cdn-edge': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'circuit-breakers': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'consistent-hashing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'event-sourcing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'isolation-levels': { ticket: TIER3, rules: ['quiz-length'] },
  'load-balancing': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'monolith-microservices': { ticket: TIER3, rules: ['quiz-length'] },
  'oauth-flows': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'observability': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
  'replication': { ticket: TIER3, rules: ['quiz-length', 'quiz-longest'] },
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
