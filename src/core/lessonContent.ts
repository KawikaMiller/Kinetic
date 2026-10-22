import type { LessonModule, QuizQuestion } from './types';

/**
 * Lesson-content lint (docs/rollout-plan.md K-2): the lesson contract's counts and the
 * quiz-quality rules, as pure checks so lessonContent.test.ts can run them over every
 * built lesson and prove each one fails on a bad fixture.
 */

export type ContentRule =
  | 'counts'
  | 'quiz-why'
  | 'quiz-answer'
  | 'quiz-duplicates'
  | 'quiz-length'
  | 'quiz-longest'
  | 'quiz-of-the-above'
  | 'links';

export interface ContentIssue {
  rule: ContentRule;
  detail: string;
}

/** AC-0 counts: [min, max] per list. */
export const COUNT_LIMITS = {
  useCases: [3, 4],
  tryThis: [3, 5],
  keyIdeas: [3, 4],
  quiz: [3, 5],
} as const;

/** The correct option's length as a multiple of the mean distractor length must sit in here. */
export const LENGTH_RATIO = { min: 0.75, max: 1.35 } as const;

/**
 * The ratio check's floor: when every option is at most this many visible characters
 * ("O(n)", "V + E", "2xx", "^1.2.0"), a few characters' difference makes a big ratio but
 * no visible length tell, so the check is skipped for that question.
 */
export const SHORT_OPTION_CHARS = 16;

/** Tier-wide ceiling on questions where the correct option is strictly the longest. */
export const TIER_LONGEST_SHARE = 0.3;

const OF_THE_ABOVE = /\bof (the above|these)\b/i;
/** A backticked token shaped like a lesson id: lowercase words joined by hyphens. */
const ID_SHAPED = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** Visible length of an option: inline-code backticks don't render. */
const shown = (s: string) => s.replace(/`/g, '').trim().length;

/** Correct option's length ÷ the mean length of the distractors. */
export function lengthRatio(q: QuizQuestion): number {
  const correct = shown(q.options[q.answer] ?? '');
  const others = q.options.filter((_, i) => i !== q.answer).map(shown);
  const mean = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
  return mean === 0 ? Infinity : correct / mean;
}

/** True when the correct option is longer than every distractor. */
export function correctIsLongest(q: QuizQuestion): boolean {
  const correct = shown(q.options[q.answer] ?? '');
  return q.options.every((o, i) => i === q.answer || shown(o) < correct);
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Backticked id-shaped tokens in the summary, tips and key ideas. */
export function backtickedIds(lesson: LessonModule): string[] {
  const { summary } = lesson;
  const texts = [
    summary.tldr, summary.what, summary.analogy ?? '', summary.why, summary.watch,
    ...summary.useCases, ...lesson.tryThis, ...lesson.keyIdeas,
  ];
  const ids = texts.flatMap((t) => [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  return ids.filter((s) => ID_SHAPED.test(s));
}

/**
 * Every issue in one lesson. `topicIds` is the registered roadmap: a backticked token
 * that is one or two edits away from a registered id (but isn't one) is a broken link.
 */
export function lintLesson(lesson: LessonModule, topicIds: ReadonlySet<string>): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const counts = {
    useCases: lesson.summary.useCases.length,
    tryThis: lesson.tryThis.length,
    keyIdeas: lesson.keyIdeas.length,
    quiz: lesson.quiz.length,
  };
  for (const [key, [min, max]] of Object.entries(COUNT_LIMITS) as [keyof typeof counts, readonly [number, number]][]) {
    if (counts[key] < min || counts[key] > max) issues.push({ rule: 'counts', detail: `${key} has ${counts[key]}, expected ${min}-${max}` });
  }

  const longestAt: string[] = [];
  lesson.quiz.forEach((q, i) => {
    const n = `Q${i + 1}`;
    if (!q.why?.trim()) issues.push({ rule: 'quiz-why', detail: `${n} has no why` });
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      issues.push({ rule: 'quiz-answer', detail: `${n} answer ${q.answer} is out of range for ${q.options.length} options` });
      return;
    }
    const seen = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (seen.size !== q.options.length) issues.push({ rule: 'quiz-duplicates', detail: `${n} repeats an option` });
    const allShort = q.options.every((o) => shown(o) <= SHORT_OPTION_CHARS);
    const ratio = lengthRatio(q);
    if (!allShort && (ratio < LENGTH_RATIO.min || ratio > LENGTH_RATIO.max)) {
      issues.push({ rule: 'quiz-length', detail: `${n} correct option is ${ratio.toFixed(2)}× the mean distractor length` });
    }
    if (q.options.some((o) => OF_THE_ABOVE.test(o))) issues.push({ rule: 'quiz-of-the-above', detail: `${n} uses "of the above/these"` });
    if (correctIsLongest(q)) longestAt.push(n);
  });
  const allowedLongest = Math.floor(lesson.quiz.length / 2);
  if (longestAt.length > allowedLongest) {
    issues.push({ rule: 'quiz-longest', detail: `correct option is strictly longest in ${longestAt.length} of ${lesson.quiz.length} (max ${allowedLongest}): ${longestAt.join(', ')}` });
  }

  for (const token of backtickedIds(lesson)) {
    if (topicIds.has(token)) continue;
    const near = [...topicIds].find((id) => levenshtein(id, token) <= 2);
    if (near) issues.push({ rule: 'links', detail: `\`${token}\` looks like a broken link to \`${near}\`` });
  }
  return issues;
}

/** Where the strictly-longest correct options are, as `lesson-id Q3` (1-based): what a fixer has to lengthen to bring the tier share down. */
export function longestQuestionRefs(entries: readonly { id: string; lesson: LessonModule }[]): string[] {
  return entries.flatMap(({ id, lesson }) =>
    lesson.quiz.flatMap((q, i) => (Number.isInteger(q.answer) && q.options[q.answer] !== undefined && correctIsLongest(q) ? [`${id} Q${i + 1}`] : [])));
}

/** Count of questions whose correct option is strictly the longest, and the total. */
export function longestTally(lessons: readonly LessonModule[]): { longest: number; total: number } {
  const all = lessons.flatMap((l) => l.quiz).filter((q) => Number.isInteger(q.answer) && q.options[q.answer] !== undefined);
  return { longest: all.filter(correctIsLongest).length, total: all.length };
}
