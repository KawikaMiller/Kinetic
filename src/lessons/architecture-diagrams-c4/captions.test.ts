import { describe, expect, it } from 'vitest';
import { audienceCaption, audienceNote, fixCaption, fixIntro, levelCaption, noDeeperLevel } from './captions';
import { BAD, FIX_IDS, applyFixes, score, type FixId } from './diagram';
import { AUDIENCES, AUDIENCE_IDS, LEVELS, RELATIONS, ancestorAt, relationLevel, viewAt } from './model';

describe('captions are computed from the model', () => {
  it('every level caption counts its own boxes and arrows', () => {
    for (const l of LEVELS) {
      const v = viewAt(l);
      const text = levelCaption(l);
      expect(text).toContain(`${v.children.length} boxes`);
      expect(text).toContain(`${v.relations.length} arrows`);
      for (const c of v.children) expect(text).toContain(c.name);
    }
    expect(levelCaption(2)).toContain('inside Book a table');
    expect(levelCaption(1)).not.toContain('inside');
  });

  it('audience notes say more, less or exactly right, for every audience × level (16 combinations)', () => {
    for (const id of AUDIENCE_IDS) {
      for (const l of LEVELS) {
        const a = AUDIENCES[id];
        const note = audienceNote(a, l);
        if (a.level === null) expect(note).toBe('');
        else if (a.level === l) expect(note).toContain(a.question);
        else expect(note).toContain(l > a.level ? 'More detail' : 'Less detail');
      }
    }
    expect(audienceCaption(AUDIENCES.exec)).toContain('Context');
    expect(audienceCaption(AUDIENCES.engineer)).toContain('Container');
  });

  it('refuses to zoom into a box that has no deeper level, by name', () => {
    expect(noDeeperLevel('db')).toContain('Database has no deeper level');
  });

  it('fix captions report the checklist item and the score after the change, for every subset and fix', () => {
    for (let mask = 0; mask < 1 << FIX_IDS.length; mask++) {
      const fixes = new Set<FixId>(FIX_IDS.filter((_, i) => (mask >> i) & 1));
      const d = applyFixes(fixes);
      for (const id of FIX_IDS) {
        const text = fixCaption(id, fixes.has(id), d);
        expect(text).toContain(`Readability ${score(d)} of 5`);
        expect(text).toContain(fixes.has(id) ? 'Applied' : 'Undone');
      }
    }
    expect(fixIntro(BAD)).toContain('5 of 5 readability checks fail');
  });
});

describe('quiz numbers come from the model', () => {
  it('the component-count question: 5 inside the frame, 9 with the neighbours', async () => {
    const lesson = (await import('./index')).default;
    const q = lesson.quiz[3];
    const v = viewAt(3);
    expect(q.options[q.answer]).toBe(String(v.children.length));
    expect(q.options).toContain(String(v.children.length + v.surroundings.length));
    for (const s of v.surroundings) expect(q.why).toContain(s.name);
    expect(q.why).toContain(`${v.surroundings.length === 4 ? 'four' : '?'} boxes`);
  });
});

describe('review fixes, pinned', () => {
  it('the audience pairing is flagged as this lesson\'s rule of thumb everywhere it is stated', async () => {
    expect(audienceCaption(AUDIENCES.exec)).toContain('rule of thumb');
    expect(audienceNote(AUDIENCES.exec, 2)).toContain('this lesson pairs that question');
    const { default: lesson } = await import('./index');
    expect(lesson.tryThis.join(' ')).toContain('this lesson pairs with an executive');
  });

  it('try-this 2 works from the default state: it starts by zooming away from level 1, so Executive really jumps', async () => {
    const { default: lesson } = await import('./index');
    expect(lesson.tryThis[1]).toMatch(/^Zoom to 3 Component, then pick Executive/);
    // From level 3, an executive's level (1) is a jump; from the default level 1 it would not be.
    expect(AUDIENCES.exec.level).toBe(1);
    expect(viewAt(3).level).not.toBe(AUDIENCES.exec.level);
  });

  it('does not imply components are required: levels 1 and 2 are called enough for most teams', async () => {
    const { default: lesson } = await import('./index');
    expect(lesson.summary.what).toContain('levels 1 and 2 are enough for most teams');
    expect(lesson.keyIdeas.join(' ')).toContain('Levels 1 and 2 are enough for most teams');
  });

  it('protocols are asked for between separate processes, matching the model', async () => {
    const { default: lesson } = await import('./index');
    expect(lesson.keyIdeas.join(' ')).toContain('where two separate processes talk');
    expect(lesson.keyIdeas.join(' ')).not.toContain('from the container level down');
    // The model agrees: every relationship between different containers names a protocol, in-process ones do not.
    for (const r of RELATIONS) {
      const crosses = ancestorAt(r.from, 2) !== ancestorAt(r.to, 2);
      if (relationLevel(r) >= 2 && crosses) expect(r.protocol, `${r.from}>${r.to}`).toBeDefined();
      if (!crosses && relationLevel(r) >= 3) expect(r.protocol, `${r.from}>${r.to}`).toBeUndefined();
    }
  });
});
