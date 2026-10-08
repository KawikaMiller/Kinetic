import { describe, expect, it } from 'vitest';
import type { LessonModule } from '../types';
import { CODE_PLACEHOLDER, gluedSentences } from './glue';

/**
 * Repo-wide: no glued sentence in any lesson's written text (summary, try-this, key ideas, quiz).
 * Stage captions are JSX built at run time from lesson state, so a test can't enumerate them all:
 * `npm run captions` applies the same rule to every caption the browser shows, and each lesson's
 * caption tests use `expectCaption`.
 */
const modules = import.meta.glob<{ default: LessonModule }>('../../lessons/*/index.tsx', { eager: true });

/** Dotted names written as plain prose that the rule can't tell from glue. Keep it tiny. */
const NOT_GLUED = ['queue.Queue'];

/** Backticked spans are code (InlineText renders them as <code>): blank them like the caption check does. */
const prose = (s: string) => NOT_GLUED.reduce((t, name) => t.replaceAll(name, CODE_PLACEHOLDER), s.replace(/`[^`]*`/g, CODE_PLACEHOLDER));

function texts(l: LessonModule): string[] {
  const { summary: s } = l;
  return [
    s.tldr, s.what, s.why, s.watch, s.analogy ?? '', ...s.useCases,
    ...l.tryThis, ...l.keyIdeas,
    ...l.quiz.flatMap((q) => [q.q, q.why, ...q.options]),
  ];
}

describe('every lesson', () => {
  it('has no glued sentence in its written text', () => {
    const hits = Object.entries(modules).flatMap(([path, mod]) =>
      texts(mod.default).flatMap((t) => gluedSentences(prose(t)).map((g) => `${path.split('/')[3]}: "${g}"`)),
    );
    expect(Object.keys(modules).length).toBeGreaterThan(100);
    expect(hits).toEqual([]);
  });
});
