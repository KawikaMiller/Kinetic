import { describe, expect, it } from 'vitest';
import { splitInlineCode } from './inlineCode';

describe('splitInlineCode', () => {
  it('turns backtick pairs into code parts', () => {
    expect(splitInlineCode('relies on `x | 0` or wrapping')).toEqual([
      { text: 'relies on ', code: false },
      { text: 'x | 0', code: true },
      { text: ' or wrapping', code: false },
    ]);
  });

  it('handles several code spans and code at the edges', () => {
    expect(splitInlineCode('`a` then `b`')).toEqual([
      { text: 'a', code: true },
      { text: ' then ', code: false },
      { text: 'b', code: true },
    ]);
  });

  it('leaves text without backticks as one plain part', () => {
    expect(splitInlineCode('no code here')).toEqual([{ text: 'no code here', code: false }]);
    expect(splitInlineCode('')).toEqual([]);
  });

  it('keeps an unpaired backtick as literal text', () => {
    expect(splitInlineCode('a `b c')).toEqual([{ text: 'a `b c', code: false }]);
    expect(splitInlineCode('`x` and ` stray')).toEqual([
      { text: 'x', code: true },
      { text: ' and ` stray', code: false },
    ]);
  });

  it('drops an empty pair rather than rendering an empty code box', () => {
    expect(splitInlineCode('a `` b')).toEqual([
      { text: 'a ', code: false },
      { text: ' b', code: false },
    ]);
  });

  it('round-trips the text when the code parts are re-wrapped', () => {
    const s = 'In `user && user.name`, when is `user.name` never evaluated?';
    const back = splitInlineCode(s)
      .map((p) => (p.code ? `\`${p.text}\`` : p.text))
      .join('');
    expect(back).toBe(s);
  });
});
