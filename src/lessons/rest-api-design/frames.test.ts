import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { boardCaption } from './frames';
import { ENDPOINTS, METHODS, shape, validate, verdict } from './model';

describe('the board caption describes the endpoint and choice it is given', () => {
  it('names the endpoint, so selecting another card replaces a caption about the previous one', () => {
    const [a, b] = [ENDPOINTS[0], ENDPOINTS[2]];
    const ta = expectCaption(boardCaption(a, a.start));
    const tb = expectCaption(boardCaption(b, b.start));
    expect(ta).toContain(a.intent.job);
    expect(tb).toContain(b.intent.job);
    expect(ta).not.toBe(tb);
  });
  it('its verdict and flag count come from the validator, for every card × method × path', () => {
    for (const e of ENDPOINTS)
      for (const method of METHODS)
        for (const path of e.paths) {
          const flags = validate(e.intent, method, shape(path));
          const t = expectCaption(boardCaption(e, { method, path }));
          const problems = flags.filter((f) => f.level !== 'ok').length;
          if (verdict(flags) === 'ok') expect(t).toContain('matches the conventions');
          else expect(t).toContain(problems === 1 ? 'one flag' : `${problems} flags`);
          expect(t.includes('a violation')).toBe(verdict(flags) === 'bad');
          expect(t.includes('a style warning')).toBe(verdict(flags) === 'warn');
        }
  });
});
