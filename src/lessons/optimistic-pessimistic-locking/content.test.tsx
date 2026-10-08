import { expectCaption } from '../../core/testing/captions';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { changeCaption, introCaption, verdictCaption } from './frames';
import lesson from './index';
import { LUNCH_TICKS, run } from './model';


const joined = [lesson.summary.tldr, lesson.summary.what, lesson.summary.why, ...lesson.summary.useCases, ...lesson.keyIdeas].join(' ');

describe('claims about real tools are accurate', () => {
  it('does not credit Django with built-in optimistic locking', () => {
    expect(joined).not.toMatch(/Rails, Django and JPA/);
    const django = lesson.summary.useCases.find((u) => u.includes('Django'))!;
    expect(django).toContain('select_for_update');
    expect(django).toMatch(/pessimistic/);
    expect(django).toContain('lock_version');
    expect(django).toContain('@Version');
  });
  it('says a transaction alone fails to stop lost updates only at READ COMMITTED', () => {
    expect(lesson.keyIdeas[0]).toContain('READ COMMITTED');
    expect(lesson.summary.what).toContain('READ COMMITTED');
  });
  it('names SKIP LOCKED for the job-queue idiom', () => {
    expect(joined).toContain('SKIP LOCKED');
  });
  it('every try-this that names a preset says to click the chip', () => {
    for (const t of lesson.tryThis.filter((x) => x.includes('Both read first') || x.includes('Ben reads while'))) expect(t).toContain('chip');
  });
});

describe('captions', () => {
  const lunch = run('pessimistic', { editTicks: { ana: LUNCH_TICKS, ben: 1 }, lockTimeout: 5 }, ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'], true);
  it('does not colour the final stock as a success when someone timed out', () => {
    expect(lunch.users.ben.outcome).toBe('timeout');
    const html = renderToStaticMarkup(<>{verdictCaption(lunch)}</>);
    expect(html).not.toContain('hl ok');
    expect(expectCaption(verdictCaption(lunch))).toContain('Ben timed out waiting');
    const clean = run('pessimistic', { editTicks: { ana: 1, ben: 1 }, lockTimeout: 99 }, ['ana', 'ben', 'ana', 'ana', 'ben', 'ben'], true);
    expect(renderToStaticMarkup(<>{verdictCaption(clean)}</>)).toContain('hl ok');
  });
  it('describes a lost update by its cause, not as "a newer value" (both writes can be equal)', () => {
    const w = run('none', { editTicks: { ana: 1, ben: 1 }, lockTimeout: 5 }, ['ana', 'ben', 'ana', 'ben', 'ana', 'ben']);
    const t = expectCaption(changeCaption(null, w, introCaption('x')));
    expect(t).toContain('worked out from a stale read');
    expect(t).not.toContain('newer value');
  });
});
