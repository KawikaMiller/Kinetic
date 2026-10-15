import { describe, expect, it } from 'vitest';
import {
  OPENING_TITLE, READ_ONLY_MESSAGE, TITLE_MAX, acceptBlocked, adrLines, benefits, cleanTitle, costs, draftAdr, edit, setStatus, supersede, type Adr,
} from './adr';
import { OPENING_WEIGHTS, OPTIONS, optionOf, winner, type OptionId } from './decision';

const accepted = (a: Adr): Adr => {
  const r = setStatus(a, 'accepted');
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

describe('the ADR text is rebuilt from state', () => {
  it('changes the consequences line when the option changes, for every option', () => {
    const texts = OPTIONS.map((o) => adrLines({ ...draftAdr(o.id) }).join('\n'));
    expect(new Set(texts).size).toBe(OPTIONS.length);
    for (const o of OPTIONS) {
      const text = adrLines(draftAdr(o.id)).join('\n');
      expect(text).toContain(o.id === 'nothing' ? 'do nothing for now' : `We will ${o.name.charAt(0).toLowerCase()}${o.name.slice(1)}.`);
    }
  });

  it('lists the costs of the chosen option as well as its benefits, taken from its own numbers', () => {
    const cache = optionOf('cache');
    expect(benefits(cache)).toEqual(['p95 latency falls from 400 ms to 80 ms.']);
    expect(costs(cache)).toEqual(['Running cost rises by $400 a month.', 'Profile data can be up to 30 s stale.', 'It takes about 2 weeks of effort.']);
    const lines = adrLines(draftAdr('cache'));
    expect(lines).toContain('+ p95 latency falls from 400 ms to 80 ms.');
    expect(lines).toContain('- Running cost rises by $400 a month.');
    expect(lines).toContain('- Profile data can be up to 30 s stale.');
  });

  it('names a cost for every option that is worse than doing nothing on a criterion, and no benefit for doing nothing but not building', () => {
    for (const o of OPTIONS.filter((x) => x.id !== 'nothing')) {
      expect(costs(o).length, o.id).toBeGreaterThan(0);
      expect(benefits(o).length, o.id).toBeGreaterThan(0);
    }
    expect(costs(optionOf('nothing'))).toEqual(['p95 latency stays at 400 ms.']);
    expect(benefits(optionOf('nothing'))).toHaveLength(1);
  });

  it('prints the five parts in the layout title, status, context, decision, consequences', () => {
    const lines = adrLines(draftAdr('cache'));
    const heads = lines.filter((l) => l.startsWith('#') || l.startsWith('Status:'));
    expect(heads).toEqual([`# ADR 1: ${OPENING_TITLE}`, 'Status: proposed.', '## Context', '## Decision', '## Consequences']);
  });

  it('opens on the option that ranks first at the opening weights', () => {
    expect(winner(OPENING_WEIGHTS, [])!.id).toBe('denormalise');
  });
});

describe('titles are plain text of 1 to 80 characters', () => {
  it('trims, refuses an empty or over-long title, and keeps markup as the characters it is', () => {
    expect(cleanTitle('  Use a cache  ')).toBe('Use a cache');
    expect(cleanTitle('')).toBeNull();
    expect(cleanTitle('    ')).toBeNull();
    expect(cleanTitle('x'.repeat(TITLE_MAX))).toHaveLength(TITLE_MAX);
    expect(cleanTitle('x'.repeat(TITLE_MAX + 1))).toBeNull();
    expect(cleanTitle('<b>bold</b>')).toBe('<b>bold</b>');
    expect(adrLines({ ...draftAdr('cache'), title: '<b>bold</b>' })[0]).toBe('# ADR 1: <b>bold</b>');
  });

  it('blocks accepting an empty title and shows a placeholder in the text', () => {
    const empty = { ...draftAdr('cache'), title: '   ' };
    const r = setStatus(empty, 'accepted');
    expect(r.ok).toBe(false);
    expect(adrLines(empty)[0]).toBe('# ADR 1: (no title yet)');
  });
});

describe('an accepted ADR is read-only', () => {
  it('refuses an edit of the title or the option with the lesson’s sentence, and a move back to proposed', () => {
    const a = accepted(draftAdr('cache'));
    expect(edit(a, { title: 'Something else' })).toEqual({ ok: false, message: READ_ONLY_MESSAGE });
    expect(edit(a, { optionId: 'replica' })).toEqual({ ok: false, message: READ_ONLY_MESSAGE });
    expect(setStatus(a, 'proposed')).toEqual({ ok: false, message: READ_ONLY_MESSAGE });
    expect(READ_ONLY_MESSAGE).toBe('An accepted ADR is superseded by a new one, not edited.');
  });

  it('allows edits while proposed, and accepting with a title', () => {
    const a = draftAdr('cache');
    const r = edit(a, { title: 'New title', optionId: 'replica' });
    expect(r.ok && r.value).toMatchObject({ title: 'New title', optionId: 'replica', status: 'proposed' });
    expect(accepted(a).status).toBe('accepted');
  });

  it('will not move to superseded directly: that is done by writing the replacement', () => {
    expect(setStatus(draftAdr('cache'), 'superseded').ok).toBe(false);
    expect(setStatus(accepted(draftAdr('cache')), 'superseded').ok).toBe(false);
  });

  it('try-this 4: Supersede writes ADR 2 linked both ways, leaves ADR 1 superseded, and the new record is editable', () => {
    const one = accepted(draftAdr('cache'));
    const r = supersede([one], 1, 'replica', 'Move to a replica');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [old, next] = r.value;
    expect(old).toMatchObject({ number: 1, status: 'superseded', supersededBy: 2 });
    expect(next).toMatchObject({ number: 2, status: 'proposed', supersedes: 1, supersededBy: null, optionId: 'replica' });
    expect(adrLines(old, r.value).join('\n')).toContain('Superseded by ADR 2.');
    expect(adrLines(next, r.value).join('\n')).toContain('Supersedes ADR 1.');
    expect(adrLines(next, r.value).join('\n')).toContain('ADR 1 chose "Add a cache" and is being replaced.');
    expect(edit(next, { title: 'Edited' }).ok).toBe(true);
    const again = supersede(r.value, 2, 'nothing', 'Back off');
    expect(again.ok).toBe(false);
  });

  it('refuses to supersede a record that is not accepted or does not exist', () => {
    expect(supersede([draftAdr('cache')], 1, 'replica', 'x').ok).toBe(false);
    expect(supersede([accepted(draftAdr('cache'))], 7, 'replica', 'x').ok).toBe(false);
  });

  it('numbers successive records one higher than the highest, for a chain of five', () => {
    let history: Adr[] = [accepted(draftAdr('cache'))];
    for (let n = 2; n <= 5; n++) {
      const r = supersede(history, n - 1, 'nothing', `ADR ${n}`);
      if (!r.ok) throw new Error(r.message);
      history = r.value.map((a) => (a.number === n ? accepted(a) : a));
      expect(history).toHaveLength(n);
    }
    expect(history.map((a) => a.status)).toEqual(['superseded', 'superseded', 'superseded', 'superseded', 'accepted']);
  });
});

describe('accepting an option that breaks a constraint', () => {
  it('is refused with the constraint named, and allowed when the constraint is off', () => {
    const id: OptionId = 'denormalise';
    expect(acceptBlocked(id, ['effort'])).toContain('effort ≤ 4 weeks');
    expect(acceptBlocked(id, [])).toBeNull();
    expect(acceptBlocked('nothing', ['effort', 'staleness', 'cost'])).toBeNull();
  });
});
