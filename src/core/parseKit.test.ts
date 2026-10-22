import { describe, expect, it } from 'vitest';
import { cursorOf, parseBoundedList, parseKitLine, parseKitRows, tokenize, type KitRead, type TokenCursor, type TokenRule } from './parseKit';
import { parseRows } from './parse';
import parseKitSource from './parseKit.ts?raw';

const RULES: TokenRule[] = [
  { kind: 'arrow', pattern: /->/ },
  { kind: 'word', pattern: /[\p{L}\p{N}_]+/u },
  { kind: 'punct', pattern: /[()|*+?]/ },
];

describe('tokenize', () => {
  it('cuts words, an arrow and punctuation, with 1-based columns', () => {
    const r = tokenize('q0 a -> q1 (b)', RULES);
    expect(r).toEqual({
      ok: true,
      tokens: [
        { kind: 'word', text: 'q0', column: 1 },
        { kind: 'word', text: 'a', column: 4 },
        { kind: 'arrow', text: '->', column: 6 },
        { kind: 'word', text: 'q1', column: 9 },
        { kind: 'punct', text: '(', column: 12 },
        { kind: 'word', text: 'b', column: 13 },
        { kind: 'punct', text: ')', column: 14 },
      ],
    });
  });

  it('tries rules in order: the first match wins', () => {
    const r = tokenize('->', [{ kind: 'word', pattern: /\S/ }, ...RULES]);
    expect(r.ok && r.tokens.map((t) => t.text)).toEqual(['-', '>']);
  });

  it('refuses a character no rule starts with, at its column', () => {
    expect(tokenize('a $ b', RULES)).toEqual({ ok: false, column: 3, error: 'unexpected "$".' });
  });

  it('starts counting at startColumn when the text is the tail of a line', () => {
    expect(tokenize('a $', RULES, 5)).toEqual({ ok: false, column: 7, error: 'unexpected "$".' });
  });

  it('counts code points, so an emoji or a combining word is one column', () => {
    const r = tokenize('é x 😀', [...RULES]);
    expect(r).toEqual({ ok: false, column: 5, error: 'unexpected "😀".' });
    const ok = tokenize('日本 b', RULES);
    expect(ok.ok && ok.tokens.map((t) => [t.text, t.column])).toEqual([['日本', 1], ['b', 4]]);
  });

  it('treats tabs, non-breaking spaces and ideographic spaces as whitespace', () => {
    const r = tokenize('a\tb c　d', RULES);
    expect(r.ok && r.tokens.map((t) => [t.text, t.column])).toEqual([['a', 1], ['b', 3], ['c', 5], ['d', 7]]);
  });

  it('gives no tokens for empty or all-whitespace text', () => {
    expect(tokenize('', RULES)).toEqual({ ok: true, tokens: [] });
    expect(tokenize(' \t ', RULES)).toEqual({ ok: true, tokens: [] });
  });

  it('is not fooled by a rule that could match the empty string', () => {
    const r = tokenize('ab', [{ kind: 'maybe', pattern: /x*/ }]);
    expect(r).toEqual({ ok: false, column: 1, error: 'unexpected "a".' });
  });

  it('ignores the global and sticky flags a pattern was written with', () => {
    const r = tokenize('a a', [{ kind: 'w', pattern: /a/g }]);
    expect(r.ok && r.tokens.length).toBe(2);
  });
});

describe('cursorOf', () => {
  const tokens = (text: string) => {
    const r = tokenize(text, RULES);
    if (!r.ok) throw new Error(r.error);
    return r.tokens;
  };

  it('peeks, takes and accepts by kind', () => {
    const c = cursorOf(tokens('a -> b'));
    expect(c.peek()?.text).toBe('a');
    expect(c.accept('arrow')).toBeUndefined();
    expect(c.accept('arrow', 'word')?.text).toBe('a');
    expect(c.next()?.text).toBe('->');
    expect(c.atEnd()).toBe(false);
    expect(c.rest().map((t) => t.text)).toEqual(['b']);
    expect(c.atEnd()).toBe(true);
    expect(c.next()).toBeUndefined();
  });

  it('fails at the next token, or just past the last one when the line has run out', () => {
    const c = cursorOf(tokens('ab c'));
    expect(c.fail('x')).toEqual({ ok: false, error: 'x', column: 1 });
    c.rest();
    expect(c.fail('needs more')).toEqual({ ok: false, error: 'needs more', column: 5 });
  });

  it('fails at the line end column when there are no tokens at all', () => {
    expect(cursorOf([], 4).fail('empty')).toEqual({ ok: false, error: 'empty', column: 4 });
  });

  it('fails at an earlier token', () => {
    const ts = tokens('a b');
    const c = cursorOf(ts);
    c.rest();
    expect(c.failAt(ts[0], 'that one')).toEqual({ ok: false, error: 'that one', column: 1 });
  });
});

/** A tiny PDA table: `state read pop -> state push`. */
interface Row {
  from: string;
  read: string;
  pop: string;
  to: string;
  push: string;
}

function readPda(c: TokenCursor): KitRead<Row> {
  const word = () => {
    const t = c.accept('word');
    return t ? t.text : null;
  };
  const from = word();
  const read = word();
  const pop = word();
  if (from === null || read === null || pop === null) return c.fail('expected: state read pop -> state push');
  if (!c.accept('arrow')) return c.fail('expected "->" after the three inputs');
  const to = word();
  if (to === null) return c.fail('the rule needs a next state after "->"');
  const push = word() ?? '';
  return { ok: true, value: { from, read, pop, to, push } };
}

const limits = { maxRows: 3, maxLineChars: 30, tokens: RULES, row: readPda };

describe('parseKitRows', () => {
  it('reads one rule per line, skipping blanks and comment lines, and keeps each line number', () => {
    const r = parseKitRows('q0 a Z -> q1 AZ\n\n# note\n  q1 b A -> q1 ', limits);
    expect(r).toEqual({
      ok: true,
      rows: [
        { line: 1, value: { from: 'q0', read: 'a', pop: 'Z', to: 'q1', push: 'AZ' } },
        { line: 4, value: { from: 'q1', read: 'b', pop: 'A', to: 'q1', push: '' } },
      ],
    });
  });

  it('reads a trailing comment only when asked to, and then the comment is not counted toward the line limit', () => {
    const text = 'q0 a Z -> q1 # then push nothing at all here';
    expect(parseKitRows(text, limits)).toMatchObject({ ok: false, line: 1 });
    expect(parseKitRows(text, { ...limits, trailingComments: true })).toEqual({
      ok: true,
      rows: [{ line: 1, value: { from: 'q0', read: 'a', pop: 'Z', to: 'q1', push: '' } }],
    });
  });

  it('accepts CRLF line endings', () => {
    const r = parseKitRows('q0 a Z -> q1\r\nq1 b A -> q0\r\n', limits);
    expect(r.ok && r.rows.map((x) => x.line)).toEqual([1, 2]);
  });

  it('refuses an unknown character with line and column', () => {
    expect(parseKitRows('q0 a Z -> q1\nq1 b $ -> q0', limits)).toEqual({
      ok: false,
      line: 2,
      column: 6,
      error: 'Line 2, column 6: unexpected "$".',
    });
  });

  it('counts the indent in the column', () => {
    expect(parseKitRows('    q0 a $', limits)).toMatchObject({ line: 1, column: 10, error: 'Line 1, column 10: unexpected "$".' });
  });

  it('counts a tab as one column', () => {
    expect(parseKitRows('\tq0 a $', limits)).toMatchObject({ column: 7 });
  });

  it('refuses a rule that stops early, just past its last token', () => {
    expect(parseKitRows('q0 a', limits)).toEqual({
      ok: false,
      line: 1,
      column: 5,
      error: 'Line 1, column 5: expected: state read pop -> state push',
    });
  });

  it('refuses a wrong token where the reader expected an arrow', () => {
    expect(parseKitRows('q0 a Z q1', limits)).toMatchObject({ line: 1, column: 8, error: 'Line 1, column 8: expected "->" after the three inputs' });
  });

  it('refuses tokens left over after a complete rule, at the first extra token', () => {
    expect(parseKitRows('q0 a Z -> q1 AZ extra', limits)).toMatchObject({
      line: 1,
      column: 17,
      error: 'Line 1, column 17: unexpected "extra": nothing can follow here.',
    });
  });

  it('refuses a line over the character limit before reading it', () => {
    const r = parseKitRows(`q0 a Z -> q1 ${'A'.repeat(30)}`, limits);
    expect(r).toEqual({ ok: false, line: 1, error: 'Line 1 is 43 characters; keep each rule to 30 or fewer.' });
  });

  it('refuses too many rules on the line that breaks the limit, with the caller noun', () => {
    const text = ['q0 a Z -> q1', 'q1 a Z -> q2', 'q2 a Z -> q3', 'q3 a Z -> q4'].join('\n');
    expect(parseKitRows(text, limits)).toEqual({ ok: false, line: 4, error: 'Line 4: more than 3 rules; delete one first.' });
    expect(parseKitRows(text, { ...limits, noun: { one: 'transition', many: 'transitions' } })).toMatchObject({
      error: 'Line 4: more than 3 transitions; delete one first.',
    });
  });

  it('does not count blank or comment lines against the limits', () => {
    const text = ['q0 a Z -> q1', '', '# one', '# two', 'q1 a Z -> q2', 'q2 a Z -> q3'].join('\n');
    expect(parseKitRows(text, limits).ok).toBe(true);
  });

  it('lets a row refuse a whole rule with no column', () => {
    const r = parseKitRows('q0 a Z -> q1', { ...limits, row: () => ({ ok: false, error: 'not like that' }) });
    expect(r).toEqual({ ok: false, line: 1, error: 'Line 1: not like that' });
  });

  it('returns no rows for empty text, or the supplied refusal', () => {
    expect(parseKitRows('', limits)).toEqual({ ok: true, rows: [] });
    expect(parseKitRows('# only a note\n \n', limits)).toEqual({ ok: true, rows: [] });
    expect(parseKitRows('  ', { ...limits, empty: 'Write at least one rule.' })).toEqual({ ok: false, line: 1, error: 'Write at least one rule.' });
  });

  it('uses a custom comment marker', () => {
    expect(parseKitRows('// hi\nq0 a Z -> q1', { ...limits, comment: '//' }).ok).toBe(true);
  });

  it('handles non-ASCII names and unicode input without throwing', () => {
    const r = parseKitRows('état ä Z -> état', limits);
    expect(r.ok && r.rows[0].value.from).toBe('état');
    expect(parseKitRows('q0 😀 Z -> q1', limits)).toMatchObject({ line: 1, column: 4, error: 'Line 1, column 4: unexpected "😀".' });
  });

  it('stays quick on a hostile 1 MB single line (refused by the limit, never tokenized)', () => {
    const started = Date.now();
    const r = parseKitRows('a'.repeat(1_000_000), limits);
    expect(r.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('parseRows column support', () => {
  it('hands the row reader the indent and formats a column when given one', () => {
    const seen: number[] = [];
    const r = parseRows('  ab', {
      maxRows: 1,
      maxLineChars: 10,
      row: (_text, _line, indent) => {
        seen.push(indent);
        return { ok: false, error: 'bad', column: indent + 2 };
      },
    });
    expect(seen).toEqual([2]);
    expect(r).toEqual({ ok: false, line: 1, column: 4, error: 'Line 1, column 4: bad' });
  });
});

describe('parseKitLine', () => {
  /** A one-line field: a word, optionally followed by `*`. */
  const read = (c: TokenCursor): KitRead<string> => {
    const w = c.accept('word');
    if (!w) return c.fail('nothing to repeat');
    c.accept('punct');
    return { ok: true, value: w.text };
  };
  const o = { tokens: RULES, maxChars: 8, read, empty: 'Type a pattern.' };

  it('reads a field', () => {
    expect(parseKitLine('  ab* ', o)).toEqual({ ok: true, value: 'ab' });
  });

  it('refuses nothing typed, including only spaces', () => {
    expect(parseKitLine('', o)).toEqual({ ok: false, error: 'Type a pattern.' });
    expect(parseKitLine('   ', o)).toEqual({ ok: false, error: 'Type a pattern.' });
  });

  it('refuses text over the limit, with the default or a supplied sentence', () => {
    expect(parseKitLine('abcdefghij', o)).toEqual({ ok: false, error: 'That is 10 characters; keep it to 8 or fewer.' });
    expect(parseKitLine('abcdefghij', { ...o, tooLong: (n, m) => `${n}>${m}` })).toEqual({ ok: false, error: '10>8' });
  });

  it('names the column, or the position when asked, counting the indent', () => {
    expect(parseKitLine('  *', o)).toEqual({ ok: false, column: 3, error: 'Column 3: nothing to repeat' });
    expect(parseKitLine('  *', { ...o, place: 'position' })).toEqual({ ok: false, column: 3, error: 'Position 3: nothing to repeat' });
  });

  it('refuses an unexpected character and leftover tokens with their columns', () => {
    expect(parseKitLine('a $', o)).toMatchObject({ column: 3, error: 'Column 3: unexpected "$".' });
    expect(parseKitLine('a* b', o)).toMatchObject({ column: 4, error: 'Column 4: unexpected "b": nothing can follow here.' });
  });

  it('keeps a whole-field refusal columnless', () => {
    expect(parseKitLine('a', { ...o, read: () => ({ ok: false, error: 'too deep' }) })).toEqual({ ok: false, error: 'too deep' });
  });
});

describe('parseBoundedList', () => {
  const o = { min: 2, max: 4, lo: 0, hi: 9, noun: 'weights' };

  it('reads a list separated by commas and/or spaces', () => {
    expect(parseBoundedList('1, 2  3', o)).toEqual({ ok: true, value: [1, 2, 3] });
    expect(parseBoundedList('1, , 2', o)).toEqual({ ok: true, value: [1, 2] });
  });

  it('refuses text that is not a list of whole numbers, with the default or supplied sentence', () => {
    const generic = { ok: false, error: 'Type whole numbers separated by commas or spaces.' };
    for (const bad of ['', '   ', 'a b','1.5 2', '1e3 2', '0x10 2', '+3 4', '١ ٢']) expect(parseBoundedList(bad, o), JSON.stringify(bad)).toEqual(generic);
    expect(parseBoundedList('x', { ...o, messages: { notNumbers: 'digits only' } })).toEqual({ ok: false, error: 'digits only' });
  });

  it('refuses too few and too many, in the default sentence or supplied ones', () => {
    expect(parseBoundedList('1', o)).toEqual({ ok: false, error: 'Use 2 to 4 weights: that is 1.' });
    expect(parseBoundedList('1 2 3 4 5', o)).toEqual({ ok: false, error: 'Use 2 to 4 weights: that is 5.' });
    expect(parseBoundedList('1', { ...o, messages: { tooFew: (n) => `few ${n}` } })).toEqual({ ok: false, error: 'few 1' });
    expect(parseBoundedList('1 2 3 4 5', { ...o, messages: { tooMany: (n) => `many ${n}` } })).toEqual({ ok: false, error: 'many 5' });
  });

  it('refuses the first value out of range, in typed order', () => {
    expect(parseBoundedList('1 12 -3', o)).toEqual({ ok: false, error: '12 is outside 0 to 9 for weights.' });
    expect(parseBoundedList('-3 12', { ...o, messages: { outOfRange: (v) => `bad ${v}` } })).toEqual({ ok: false, error: 'bad -3' });
  });

  it('checks the count before the range', () => {
    expect(parseBoundedList('99', o)).toEqual({ ok: false, error: 'Use 2 to 4 weights: that is 1.' });
  });

  it('accepts values exactly on the bounds', () => {
    expect(parseBoundedList('0 9', o)).toEqual({ ok: true, value: [0, 9] });
  });

  it('refuses text over maxChars before splitting it', () => {
    expect(parseBoundedList('1 '.repeat(50), { ...o, maxChars: 20 })).toEqual({ ok: false, error: 'That is 100 characters; keep it to 20 or fewer.' });
    expect(parseBoundedList('1 2', { ...o, maxChars: 20, messages: { tooLong: () => 'x' } })).toEqual({ ok: true, value: [1, 2] });
  });
});

describe('parseKit source', () => {
  it('never evaluates learner text', () => {
    const source = parseKitSource.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/\beval\s*\(|new Function|Function\s*\(/);
    expect(source).not.toMatch(/new RegExp\([^)]*(text|lineText|input)\b/);
  });
});
