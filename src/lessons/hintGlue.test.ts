import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('./*/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** A `<Hint>` that follows a `<SectionTitle>` within the same box, whatever sits between them in the JSX. */
const HINT_AFTER_TITLE = /<\/SectionTitle>(?:(?!<\/Box>|<\/SectionTitle>|<\/Tray>|<SectionTitle)[\s\S]){0,260}?<Hint\b([^>]*)>/g;

describe('a Hint straight under a SectionTitle', () => {
  it('is block, or it runs on after the title (the title is inline, so a plain hint glues to its inline hint text)', () => {
    const glued: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(HINT_AFTER_TITLE)) {
        if (!/\bblock\b/.test(m[1])) glued.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    // allow-glue: a Hint that follows its title with another element between them (a text field, a paragraph) is not adjacent.
    const notAdjacent = ['./property-based-testing/FireScene.tsx', './sets-functions/Stage.tsx'];
    expect(glued.filter((g) => !notAdjacent.some((n) => g.startsWith(n)))).toEqual([]);
  });
});
