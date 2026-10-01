import { describe, expect, it } from 'vitest';
import { ACCESS_LOG } from '../../core/fixtures/accessLog';
import { PRESETS, analyze, captureNames, highlightSegments, replacePreview, runRegex, tokenRanges, tokenize } from './model';

describe('runRegex uses the real engine', () => {
  it('matches exactly what matchAll finds, for every preset', () => {
    for (const p of PRESETS) {
      const run = runRegex(p.pattern, p.flags, p.text);
      expect(run.ok).toBe(true);
      if (!run.ok) continue;
      const real = [...p.text.matchAll(new RegExp(p.pattern, [...new Set([...p.flags, 'g'])].join('')))];
      const expected = p.flags.includes('g') ? real : real.slice(0, 1);
      expect(run.matches.map((m) => [m.start, m.text])).toEqual(expected.map((m) => [m.index, m[0]]));
      for (const [k, m] of run.matches.entries()) {
        expect(m.groups.map((g) => g.text)).toEqual(expected[k].slice(1).map((g) => g ?? null));
      }
    }
  });

  it('reports named groups by name and position', () => {
    const run = runRegex(PRESETS[0].pattern, ['g'], ACCESS_LOG);
    if (!run.ok) throw new Error(run.error);
    expect(run.matches).toHaveLength(12);
    const second = run.matches[1];
    expect(second.groups.map((g) => [g.name, g.text])).toEqual([['method', 'POST'], ['path', '/api/orders'], ['status', '500']]);
    const status = second.groups[2];
    expect(ACCESS_LOG.slice(status.start, status.end)).toBe('500');
  });

  it('finds only the first match without the g flag', () => {
    const run = runRegex('\\d+', [], 'a1 b22 c333');
    expect(run.ok && run.matches.map((m) => m.text)).toEqual(['1']);
  });

  it('marks a group that did not take part as null with no position', () => {
    const run = runRegex('(a)|(b)', ['g'], 'b');
    if (!run.ok) throw new Error(run.error);
    expect(run.matches[0].groups[0]).toMatchObject({ text: null, start: -1 });
    expect(run.matches[0].groups[1]).toMatchObject({ text: 'b', start: 0, end: 1 });
  });

  it('returns the engine error for an invalid pattern instead of throwing', () => {
    const run = runRegex('(unclosed', ['g'], 'text');
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.error).toMatch(/Invalid regular expression/);
      expect(run.error).toContain('/(unclosed/g:'); // the learner's flags, not the internal d
    }
    expect(() => analyze({ pattern: '[a-', flags: ['g'], text: 'x' })).not.toThrow();
  });

  it('keeps zero-length matches and caps runaway match counts', () => {
    const run = runRegex('^', ['g', 'm'], 'a\nb\nc');
    expect(run.ok && run.matches.map((m) => [m.start, m.end])).toEqual([[0, 0], [2, 2], [4, 4]]);
    const capped = runRegex('.?', ['g'], 'x'.repeat(500), 50);
    expect(capped.ok && capped.capped).toBe(true);
    expect(capped.ok && capped.matches).toHaveLength(50);
  });

  it('shows greedy vs lazy and the m flag as the presets claim', () => {
    const tags = '<b>bold</b> and <i>italic</i>';
    expect((runRegex('<.+>', ['g'], tags) as { matches: { text: string }[] }).matches.map((m) => m.text)).toEqual([tags]);
    expect((runRegex('<.+?>', ['g'], tags) as { matches: { text: string }[] }).matches.map((m) => m.text)).toEqual(['<b>', '</b>', '<i>', '</i>']);
    const log = 'error: disk full\nwarning: cpu\nerror: timed out';
    expect((runRegex('^error: (.+)$', ['g'], log) as { matches: unknown[] }).matches).toHaveLength(0);
    expect((runRegex('^error: (.+)$', ['g', 'm'], log) as { matches: unknown[] }).matches).toHaveLength(2);
  });

  it('the too-strict email pattern rejects real addresses', () => {
    const email = PRESETS.find((p) => p.id === 'email')!;
    const run = runRegex(email.pattern, email.flags, email.text);
    expect(run.ok && run.matches.map((m) => m.text)).toEqual(['ada@example.com']);
  });
});

describe('replacePreview is String.prototype.replaceAll', () => {
  it('equals replaceAll, and reorders ISO dates with named groups', () => {
    const date = PRESETS.find((p) => p.id === 'date')!;
    const res = replacePreview(date.pattern, date.flags, date.text, date.replacement!);
    if (!res.ok) throw new Error(res.error);
    expect(res.out).toBe(date.text.replaceAll(new RegExp(date.pattern, 'g'), date.replacement!));
    expect(res.out).toBe('Released 08/03/2026, patched 01/11/2026, retired 31/01/2027.');
    expect(res.parts.filter((p) => p.replaced).map((p) => p.text)).toEqual(['08/03/2026', '01/11/2026', '31/01/2027']);
  });

  it('matches replaceAll for $&, $1 and missing matches, even without the g flag', () => {
    for (const [pattern, text, replacement] of [['(\\w+)@', 'ada@x bob@y', '[$1]@'], ['o', 'foo', '<$&>'], ['z', 'abc', '!']]) {
      const res = replacePreview(pattern, [], text, replacement);
      expect(res.ok && res.out).toBe(text.replaceAll(new RegExp(pattern, 'g'), replacement));
    }
  });
});

describe('the token explainer', () => {
  it('covers every preset pattern: explained chips that spell the pattern back exactly', () => {
    for (const p of PRESETS) {
      const tokens = tokenize(p.pattern, p.flags);
      expect(tokens.map((t) => t.text).join('')).toBe(p.pattern);
      expect(tokens.filter((t) => !t.explained)).toEqual([]);
      for (const t of tokens) expect(t.meaning.length).toBeGreaterThan(3);
    }
  });

  it('merges an atom with its quantifier and says greedy or lazy', () => {
    const [digits] = tokenize('\\d{3}');
    expect(digits).toMatchObject({ text: '\\d{3}', meaning: 'Exactly 3 digits' });
    expect(tokenize('.+')[0].meaning).toMatch(/one or more .*greedy/i);
    expect(tokenize('.+?')[0].meaning).toMatch(/one or more .*lazy/i);
    expect(tokenize('[A-Z]+')[0].meaning).toMatch(/^One or more characters from A-Z/);
    expect(tokenize('colou?r').map((t) => t.text)).toEqual(['colo', 'u?', 'r']);
  });

  it('describes anchors according to the m flag, and . according to the s flag', () => {
    expect(tokenize('^')[0].meaning).toMatch(/whole text/);
    expect(tokenize('^', ['m'])[0].meaning).toMatch(/line/);
    expect(tokenize('.', ['s'])[0].meaning).toMatch(/line breaks included/);
  });

  it('numbers capture groups the way the engine does', () => {
    expect(captureNames('(a)(?:b)(?<year>c)(?=d)(e)')).toEqual([null, 'year', null]);
    const run = runRegex('(a)(?:b)(?<year>c)(?=d)(e)', [], 'abced');
    expect(run.ok && run.matches.length).toBe(0);
    const ok = runRegex('(a)(?:b)(?<year>c)(e)', [], 'abce');
    expect(ok.ok && ok.matches[0].groups.map((g) => [g.n, g.name])).toEqual([[1, null], [2, 'year'], [3, null]]);
  });

  it('labels syntax it does not cover as "not explained" instead of guessing', () => {
    const tokens = tokenize('\\p{L}+');
    expect(tokens[0].explained).toBe(false);
    expect(tokens[0].meaning).toMatch(/not explained/);
    expect(tokenize('(?i)abc')[0].explained).toBe(false);
    expect(tokenize('*a')[0].explained).toBe(false);
  });
});

describe('highlightSegments', () => {
  it('splits text into match, innermost-group and hover runs that rebuild the text', () => {
    const text = 'id=42; id=7';
    const run = runRegex('id=(\\d+)', ['g'], text);
    if (!run.ok) throw new Error(run.error);
    const segs = highlightSegments(text, run.matches, [{ start: 3, end: 4 }]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.map((s) => [s.text, s.match, s.group, s.hover])).toEqual([
      ['id=', 0, null, false],
      ['4', 0, 1, true],
      ['2', 0, 1, false],
      ['; ', null, null, false],
      ['id=', 1, null, false],
      ['7', 1, 1, false],
    ]);
  });

  it('draws zero-width matches as carets', () => {
    const run = runRegex('^', ['g', 'm'], 'a\nb');
    if (!run.ok) throw new Error(run.error);
    const segs = highlightSegments('a\nb', run.matches);
    expect(segs.filter((s) => s.caret === 'match')).toHaveLength(2);
    expect(segs.map((s) => s.text).join('')).toBe('a\nb');
  });
});

describe('tokenRanges: what each chip matched, found by the real engine', () => {
  it('finds the text a single token matched in every match', () => {
    const pattern = '(\\w+)-(\\d{3})';
    const text = 'abc-123 zz-4567';
    const tokens = tokenize(pattern);
    const hits = tokenRanges(pattern, ['g'], text, tokens);
    const digits = tokens.findIndex((t) => t.text === '\\d{3}');
    expect(hits[digits]?.map((r) => text.slice(r.start, r.end))).toEqual(['123', '456']);
    const dash = tokens.findIndex((t) => t.text === '-');
    expect(hits[dash]?.map((r) => text.slice(r.start, r.end))).toEqual(['-', '-']);
    const group1 = tokens.findIndex((t) => t.kind === 'group-open' && t.group === 1);
    expect(hits[group1]?.map((r) => text.slice(r.start, r.end))).toEqual(['abc', 'zz']);
  });

  it('gives no ranges where probing would change the pattern (| and numbered backrefs)', () => {
    const tokens = tokenize('(a)\\1|b');
    const hits = tokenRanges('(a)\\1|b', ['g'], 'aab', tokens);
    expect(hits[tokens.findIndex((t) => t.kind === 'or')]).toBeNull();
    expect(hits[tokens.findIndex((t) => t.kind === 'backref')]).toBeNull();
  });
});
